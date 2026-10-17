// Folio PDF · recibe los avisos (eventos) de Wompi y activa el plan cuando un pago queda APROBADO.
// URL que va en Wompi (Desarrolladores → Eventos):
//   https://aihpyqkuqzxmbygxclby.supabase.co/functions/v1/wompi-evento
// Esta función debe desplegarse SIN verificación de JWT: Wompi no envía sesión de Supabase.
// La autenticidad se comprueba con la firma (checksum) y el secreto de eventos.
//
// Secretos: WOMPI_ENV ("test" o "prod"), WOMPI_EVENTS_SECRET (test_events_… / prod_events_…).

import { createClient } from "npm:@supabase/supabase-js@2.116.0";

async function sha256(texto: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function iguales(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function valorEn(obj: unknown, ruta: string): unknown {
  return ruta.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");
  const env = (k: string) => Deno.env.get(k) ?? "";
  const secreto = env("WOMPI_EVENTS_SECRET");
  const ambiente = env("WOMPI_ENV") || "test";
  if (!secreto) return new Response("Eventos sin configurar", { status: 503 });

  let ev: any;
  try { ev = await req.json(); } catch { return new Response("JSON inválido", { status: 400 }); }

  // 1) Firma: valores de signature.properties (en orden) + timestamp + secreto, en SHA-256.
  const props: unknown = ev?.signature?.properties;
  if (!Array.isArray(props) || ev?.timestamp == null) return new Response("Evento incompleto", { status: 400 });
  const concatenado = props.map((p) => { const v = valorEn(ev.data, String(p)); return v == null ? "" : String(v); }).join("")
    + String(ev.timestamp) + secreto;
  const calculado = await sha256(concatenado);
  const recibido = String(req.headers.get("x-event-checksum") ?? ev?.signature?.checksum ?? "").toLowerCase();
  if (!iguales(calculado, recibido)) return new Response("Firma inválida", { status: 401 });

  // 2) Solo nos interesan las transacciones del ambiente configurado.
  if (ev.event !== "transaction.updated") return new Response("ok");
  if (ev.environment && ev.environment !== ambiente) return new Response("ok");

  let tx = ev?.data?.transaction;
  if (!tx?.id || !tx?.reference) return new Response("ok");

  // 3) Doble verificación: se consulta la transacción directamente a Wompi.
  const api = ambiente === "prod" ? "https://production.wompi.co/v1" : "https://sandbox.wompi.co/v1";
  try {
    const r = await fetch(`${api}/transactions/${encodeURIComponent(tx.id)}`);
    if (r.ok) { const j = await r.json(); if (j?.data?.id === tx.id) tx = j.data; }
  } catch { /* si Wompi no responde, se usa el evento ya firmado */ }

  const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await admin.rpc("aplicar_pago", {
    p_referencia: tx.reference,
    p_transaccion: tx.id,
    p_estado: tx.status,
    p_monto: tx.amount_in_cents,
    p_moneda: tx.currency,
    p_metodo: tx.payment_method_type ?? null,
  });
  // Un 500 hace que Wompi reintente (30 min, 3 h y 24 h).
  if (error) return new Response("Error al aplicar el pago", { status: 500 });
  return new Response("ok");
});
