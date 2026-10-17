# Folio PDF — puesta en marcha

Sitio estático (HTML + JavaScript) publicado en Vercel. Todo lo que se publica está en `dist/`.
Los PDF se procesan en el navegador; Supabase solo guarda las cuentas (nombre y correo).

- **Sitio:** https://www.foliopdf.site (dominio `foliopdf.site` comprado en GoDaddy; la versión sin www redirige a www)
- **Dirección de respaldo de Vercel:** https://folio-pdf-eight.vercel.app
- **Repositorio:** https://github.com/Flowjairo/folio-pdf (cada cambio en `main` se publica solo)
- **Vercel:** proyecto `folio-pdf` en el equipo «Flow»
- **Supabase:** proyecto «Folio PDF» (`aihpyqkuqzxmbygxclby`)
- **Google Cloud:** proyecto «Folio PDF» (su ID interno sigue siendo `taller-pdf` porque Google no deja cambiarlo), cliente OAuth «Folio PDF web»

## Estado

| Paso | Estado |
|---|---|
| 1. Supabase y claves en `config.js` | ✅ Hecho |
| 2. Direcciones permitidas en Supabase (Site URL y Redirect URLs) | ✅ Hecho |
| 3. Correo propio (SMTP con Resend) | ✅ Hecho |
| 4. Inicio con Google | ✅ Hecho (app publicada «En producción») |
| 5. Contraseña mínima de 8 caracteres | ✅ Hecho |
| 6. Datos legales y plan de Vercel | ⏳ Pendiente |
| 7. Suscripción con Wompi | ⏳ Código listo; faltan las llaves de Wompi |

«Confirm email» está **activado**: las cuentas nuevas con correo deben confirmarlo antes de entrar.

## Archivos (dentro de `dist/`)

| Archivo | Qué es |
|---|---|
| `index.html`, `app.js`, `styles.css` | Portada y las 14 herramientas originales de Folio. Piden cuenta al abrir una herramienta. |
| `corregir.html` | Corregir texto y Contraseña PDF (`/corregir` y `/corregir?modo=contrasena`). |
| `entrar.html` | Entrar, crear cuenta, Google y recuperar contraseña. |
| `restablecer.html` | Página a la que llega el enlace de "olvidé mi contraseña". |
| `privacidad.html`, `terminos.html` | Borradores legales. Completa lo que está entre corchetes. |
| `config.js` | Datos de Supabase y opciones (Google, versión de la política). |
| `auth.js` | Lógica de sesión compartida (`window.FolioAuth`). |
| `assets/base.css` | Estilos de las páginas de cuenta y legales. |
| `precios.html`, `cuenta.html` | Planes y precios, y Mi cuenta (plan, usos de hoy, pagos). |
| `limite.js` | Cuenta las operaciones (3 gratis al día) y muestra el aviso de planes. |
| `vendor/` | Librerías guardadas en el propio sitio: pdf.js, pdf-lib, JSZip, Tesseract, Supabase y, en `vendor/corregir/`, pdf-lib y qpdf para Corregir texto. Todo pdf.js es 5.6.205 con `isEvalSupported: false` (CVE-2024-4367). |

`vercel.json` (en la raíz) publica `dist/`, activa URLs limpias (`/entrar` en vez de `/entrar.html`)
y añade cabeceras de seguridad. Ninguna librería se carga desde un CDN.

## Seguridad

- **pdf.js 6.4.299** en todo el sitio. Las versiones anteriores tenían dos fallas que permitían ejecutar código con un PDF manipulado: CVE-2024-4367 (antes de 4.2.67) y CVE-2026-16633 (5.6.83 a 6.2.107).
- **Política de seguridad de contenido (CSP)** en `vercel.json`: solo se ejecutan scripts del propio dominio (sin código en línea ni `eval`), y la página solo puede conectarse a sí misma y a Supabase. Si algún día agregas un servicio externo (pagos, analítica, anuncios), hay que añadir su dominio a la CSP o no funcionará.
- Para revisar las librerías: actualiza las versiones en un `package.json` de prueba y ejecuta `npm audit`.

---

## 1. Supabase ✅

`config.js` tiene la Project URL y la clave pública (`sb_publishable_…`).
**Nunca** pongas ahí la clave `service_role` / `secret`, ni la cadena de conexión `postgresql://…`.

## 2. Direcciones permitidas ✅

En **Authentication → URL Configuration**:

- **Site URL:** `https://www.foliopdf.site`
- **Redirect URLs:** `https://www.foliopdf.site/**` y `https://folio-pdf-eight.vercel.app/**`

Si cambias de dominio, actualiza las dos.

## 3. Correo propio ✅

Los correos de confirmación y de recuperación salen desde `no-responder@foliopdf.site` por **Resend**
(cuenta `tallerpdf.soporte@gmail.com`, plan gratis: 3.000 al mes, 100 al día).

- **Resend:** dominio `foliopdf.site` verificado (región São Paulo); registros DNS puestos en GoDaddy.
- **Supabase → Authentication → Emails → SMTP Settings:** host `smtp.resend.com`, puerto `465`,
  usuario `resend`, contraseña = clave de Resend «Supabase Folio» (solo envío), remitente «Folio PDF».
- **Confirm email:** activado en **Authentication → Sign In / Providers**.
- Si cambias la clave de Resend, pégala de nuevo en el campo *Password* de SMTP Settings.
- **Texto de los correos:** se edita en Supabase → **Authentication → Emails → Templates** (no en Resend).
  Copia de las plantillas con el botón «Verificar mi correo» en `correos/` (ver `correos/ASUNTOS.md`).
- Dominio en GoDaddy: A `@` → `216.198.79.1`, CNAME `www` → `b7fbbcde71ca0269.vercel-dns-017.com`.

## 4. Inicio con Google ✅

- **URI de redireccionamiento autorizado** del cliente OAuth:
  `https://aihpyqkuqzxmbygxclby.supabase.co/auth/v1/callback`
- **Desarrollo de la marca:** nombre de la app, página principal, privacidad y términos
  del sitio, y dominios autorizados `foliopdf.site`, `folio-pdf-eight.vercel.app` y `aihpyqkuqzxmbygxclby.supabase.co`.
- **Público:** «En producción». Solo pide nombre y correo, así que no necesita revisión de Google.
- **Correo de asistencia y de contacto:** `tallerpdf.soporte@gmail.com`
  (propietario del proyecto junto con `juanes09hernandez@gmail.com`).
  Cuando el correo del dominio funcione, cámbialo a `soporte@foliopdf.site`.

## 5. Contraseña mínima ✅

En **Authentication → Sign In / Providers → Email**, *Minimum password length* = **8**, igual que el formulario.

## 6. Antes de abrir al público ⏳

- Completa los datos entre corchetes de `privacidad.html` y `terminos.html` y borra el aviso de borrador.
- La portada dice «Sin suscripción»: cámbialo cuando definas el plan de pago.
- **Vercel Hobby (gratis) es solo para uso no comercial.** Anuncios o cobros de suscripción requieren Vercel Pro.
- Borra en **Authentication → Users** las cuentas de prueba.
- El inicio de sesión es una puerta de entrada, no una protección de las herramientas: como todo ocurre
  en el navegador, alguien con conocimientos técnicos podría saltársela. Si vas a cobrar por funciones,
  esas funciones tendrán que verificarse en un servidor.

## 7. Suscripción con Wompi ⏳

**Modelo:** 3 operaciones gratis al día por cuenta. Plan Pro mensual **$14.900** o anual **$89.900**,
pago por periodo (sin renovación automática), con tarjeta, PSE o Nequi en el checkout de Wompi.
Si alguien con plan activo paga otra vez, el tiempo se suma.

**Qué hay en Supabase (ya creado):**
- Tablas `suscripciones`, `pagos` y `usos_diarios` con RLS: cada usuario solo lee lo suyo y nadie escribe desde el navegador.
- Funciones SQL `estado_plan()`, `registrar_uso()` (cuentas con sesión) y `aplicar_pago()` (solo servidor).
  Código en `supabase/migrations/001_suscripcion.sql`.
- Edge Functions (sin «Verify JWT with legacy secret»; cada una valida la sesión por su cuenta):
  - `crear-pago`: crea la referencia y la firma de integridad, y devuelve la URL del checkout.
  - `wompi-evento`: recibe el aviso de Wompi, verifica la firma y activa el plan.
  - `confirmar-pago`: al volver del checkout consulta la transacción a Wompi para activar al instante.
  Código en `supabase/functions/`.

**Para activarlo (primero en pruebas):**
1. Crea la cuenta de comercio en <https://comercios.wompi.co>.
2. En Wompi → Desarrolladores copia las llaves de **pruebas** (Sandbox).
3. En Supabase → **Edge Functions → Secrets** agrega:
   - `WOMPI_ENV` = `test`
   - `WOMPI_PUBLIC_KEY` = `pub_test_…`
   - `WOMPI_INTEGRITY_SECRET` = `test_integrity_…`
   - `WOMPI_EVENTS_SECRET` = `test_events_…`
   - `SITE_URL` = `https://www.foliopdf.site`
4. En Wompi → Desarrolladores → **URL de eventos** (Sandbox) pon
   `https://aihpyqkuqzxmbygxclby.supabase.co/functions/v1/wompi-evento`.
5. Prueba en /precios con las tarjetas de prueba de Wompi.

**Para cobrar de verdad:** pasa Vercel a **Pro**, repite los pasos 3 y 4 con las llaves de **producción**
(`WOMPI_ENV` = `prod`, `pub_prod_…`, `prod_integrity_…`, `prod_events_…`) y completa en `terminos.html`
el IVA y la sección de retracto y reembolsos (revísala con un abogado).

**Pendiente para después:** correo de aviso unos días antes del vencimiento y renovación automática (tarjeta tokenizada).
