// Folio PDF · al volver de Wompi, consulta la transacción directamente a Wompi y aplica el pago.
// Así el plan se activa al instante aunque el aviso (evento) tarde. No confía en lo que diga
// la URL de regreso: el estado sale de la API de Wompi y la referencia debe ser del mismo usuario.
//
// Secretos: WOMPI_ENV ("test" o "prod").

import { createClient } from "npm:@supabase/supabase-js@2.116.0";

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
const responder = (c: unknown, s: number, h: HeadersInit) => new Response(JSON.stringify(c), { status: s, headers: h });

Deno.serve(async (req) => {
  const h = cabeceras(req.headers.get("origin") ?? "");
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  if (req.method !== "POST") return responder({ error: "Método no permitido." }, 405, h);

  const env = (k: string) => Deno.env.get(k) ?? "";
  const ambiente = env("WOMPI_ENV") || "test";
  const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: quien, error: errUsuario } = await admin.auth.getUser(token);
  const usuario = quien?.user;
  if (errUsuario || !usuario) return responder({ error: "Necesitas iniciar sesión." }, 401, h);

  let cuerpo: { id?: string; ref?: string } = {};
  try { cuerpo = await req.json(); } catch { /* vacío */ }
  const ref = String(cuerpo.ref ?? "").slice(0, 120);
  const id = String(cuerpo.id ?? "").slice(0, 120);

  // El pago debe existir y ser de este usuario.
  const { data: pago } = await admin.from("pagos").select("referencia, user_id, estado, aplicado, plan")
    .eq("referencia", ref).maybeSingle();
  if (!pago || pago.user_id !== usuario.id) return responder({ error: "No encontramos ese pago." }, 404, h);
  if (pago.aplicado || !id) return responder({ estado: pago.estado, aplicado: pago.aplicado, plan: pago.plan }, 200, h);

  const api = ambiente === "prod" ? "https://production.wompi.co/v1" : "https://sandbox.wompi.co/v1";
  const r = await fetch(`${api}/transactions/${encodeURIComponent(id)}`).catch(() => null);
  if (!r || !r.ok) return responder({ estado: pago.estado, aplicado: false, plan: pago.plan, pendiente: true }, 200, h);
  const tx = (await r.json())?.data;
  if (!tx || tx.reference !== ref) return responder({ error: "La transacción no corresponde a este pago." }, 400, h);

  const { data: res, error } = await admin.rpc("aplicar_pago", {
    p_referencia: ref, p_transaccion: tx.id, p_estado: tx.status,
    p_monto: tx.amount_in_cents, p_moneda: tx.currency, p_metodo: tx.payment_method_type ?? null,
  });
  if (error) return responder({ error: "No se pudo confirmar el pago." }, 500, h);
  return responder({ estado: tx.status, aplicado: !!res?.aplicado, plan: pago.plan, vence: res?.vence ?? null }, 200, h);
});
