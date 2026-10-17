// Folio PDF · crea un pago y devuelve la URL del checkout de Wompi.
// La firma de integridad se calcula aquí porque el secreto nunca debe llegar al navegador.
//
// Secretos (Supabase → Edge Functions → Secrets):
//   WOMPI_ENV               "test" (pruebas) o "prod" (real)
//   WOMPI_PUBLIC_KEY        pub_test_… / pub_prod_…
//   WOMPI_INTEGRITY_SECRET  test_integrity_… / prod_integrity_…
//   SITE_URL                https://www.foliopdf.site
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los pone Supabase automáticamente.

import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const PLANES: Record<string, { centavos: number; nombre: string }> = {
  mensual: { centavos: 1_490_000, nombre: "Folio PDF · Plan mensual" },
  anual: { centavos: 8_990_000, nombre: "Folio PDF · Plan anual" },
};

const ORIGENES = ["https://www.foliopdf.site", "https://foliopdf.site", "https://folio-pdf-eight.vercel.app"];

function cabeceras(origin: string): HeadersInit {
  return {
    "Access-Control-Allow-Origin": ORIGENES.includes(origin) ? origin : ORIGENES[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Content-Type": "application/json; charset=utf-8",
  };
}

function responder(cuerpo: unknown, estado: number, h: HeadersInit) {
  return new Response(JSON.stringify(cuerpo), { status: estado, headers: h });
}

async function sha256(texto: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  const h = cabeceras(req.headers.get("origin") ?? "");
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  if (req.method !== "POST") return responder({ error: "Método no permitido." }, 405, h);

  const env = (k: string) => Deno.env.get(k) ?? "";
  const publica = env("WOMPI_PUBLIC_KEY");
  const integridad = env("WOMPI_INTEGRITY_SECRET");
  const sitio = env("SITE_URL") || "https://www.foliopdf.site";
  const ambiente = env("WOMPI_ENV") || "test";
  if (!publica || !integridad) return responder({ error: "Los pagos todavía no están configurados." }, 503, h);
  if ((ambiente === "prod") !== publica.startsWith("pub_prod_")) {
    return responder({ error: "La llave pública no corresponde al ambiente configurado." }, 503, h);
  }

  // Quién paga: se valida el token de sesión con Supabase.
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: quien, error: errUsuario } = await admin.auth.getUser(token);
  const usuario = quien?.user;
  if (errUsuario || !usuario) return responder({ error: "Necesitas iniciar sesión." }, 401, h);

  let cuerpo: { plan?: string } = {};
  try { cuerpo = await req.json(); } catch { /* cuerpo vacío */ }
  const plan = cuerpo.plan ?? "";
  if (!(plan in PLANES)) return responder({ error: "Plan no válido." }, 400, h);
  const { centavos } = PLANES[plan];

  const referencia = `FOLIO-${plan === "anual" ? "A" : "M"}-${crypto.randomUUID()}`;
  const { error: errPago } = await admin.from("pagos").insert({
    referencia, user_id: usuario.id, plan, monto_centavos: centavos,
  });
  if (errPago) return responder({ error: "No se pudo iniciar el pago. Intenta de nuevo." }, 500, h);

  const firma = await sha256(`${referencia}${centavos}COP${integridad}`);
  const url = new URL("https://checkout.wompi.co/p/");
  url.searchParams.set("public-key", publica);
  url.searchParams.set("currency", "COP");
  url.searchParams.set("amount-in-cents", String(centavos));
  url.searchParams.set("reference", referencia);
  url.searchParams.set("signature:integrity", firma);
  url.searchParams.set("redirect-url", `${sitio}/cuenta?ref=${encodeURIComponent(referencia)}`);
  if (usuario.email) url.searchParams.set("customer-data:email", usuario.email);
  const nombre = String(usuario.user_metadata?.full_name ?? usuario.user_metadata?.name ?? "").slice(0, 80);
  if (nombre) url.searchParams.set("customer-data:full-name", nombre);

  return responder({ url: url.toString(), referencia }, 200, h);
});
