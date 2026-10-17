# Folio PDF — puesta en marcha

Sitio estático (HTML + JavaScript) publicado en Vercel. Todo lo que se publica está en `dist/`.
Los PDF se procesan en el navegador; Supabase solo guarda las cuentas (nombre y correo).

- **Sitio:** https://folio-pdf-eight.vercel.app
- **Repositorio:** https://github.com/Flowjairo/folio-pdf (cada cambio en `main` se publica solo)
- **Vercel:** proyecto `folio-pdf` en el equipo «Flow»
- **Supabase:** proyecto `aihpyqkuqzxmbygxclby` (el mismo que usaba Taller PDF)
- **Google Cloud:** proyecto `taller-pdf`, cliente OAuth «Taller PDF web»

## Estado

| Paso | Estado |
|---|---|
| 1. Supabase y claves en `config.js` | ✅ Hecho |
| 2. Direcciones permitidas en Supabase (Site URL y Redirect URLs) | ✅ Hecho |
| 3. Correo propio (SMTP) | ⏳ Pendiente: necesita dominio |
| 4. Inicio con Google | ✅ Hecho (app publicada «En producción») |
| 5. Contraseña mínima de 8 caracteres | ✅ Hecho |
| 6. Datos legales y plan de Vercel | ⏳ Pendiente |

**Temporal:** «Confirm email» está **desactivado** para poder probar sin correo. Vuelve a activarlo al terminar el paso 3.

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
| `vendor/` | Librerías guardadas en el propio sitio: pdf.js, pdf-lib, JSZip, Tesseract, Supabase y, en `vendor/corregir/`, pdf-lib y qpdf para Corregir texto. Todo pdf.js es 5.6.205 con `isEvalSupported: false` (CVE-2024-4367). |

`vercel.json` (en la raíz) publica `dist/`, activa URLs limpias (`/entrar` en vez de `/entrar.html`)
y añade cabeceras de seguridad. Ninguna librería se carga desde un CDN.

---

## 1. Supabase ✅

`config.js` tiene la Project URL y la clave pública (`sb_publishable_…`).
**Nunca** pongas ahí la clave `service_role` / `secret`, ni la cadena de conexión `postgresql://…`.

## 2. Direcciones permitidas ✅

En **Authentication → URL Configuration**:

- **Site URL:** `https://folio-pdf-eight.vercel.app`
- **Redirect URLs:** `https://folio-pdf-eight.vercel.app/**` (y la de Taller, mientras exista)

Si cambias de dominio, actualiza las dos.

## 3. Correo propio ⏳

El correo de fábrica de Supabase **solo envía a los miembros de tu equipo de Supabase y como
máximo 2 mensajes por hora**. Con eso nadie más puede confirmar su cuenta ni recuperar la contraseña.

1. Compra un dominio (por ejemplo `foliopdf.com`) y conéctalo al proyecto de Vercel.
2. Crea una cuenta en un servicio de correo: **Resend** (gratis: 3.000 al mes, 100 al día)
   o **Brevo** (gratis: 300 al día).
3. Verifica el dominio en ese servicio pegando sus registros DNS (SPF, DKIM).
4. En Supabase → **Authentication → Emails → SMTP Settings** pon servidor, usuario, contraseña
   y un remitente tipo `no-responder@foliopdf.com`.
5. Vuelve a activar **Confirm email** en **Authentication → Sign In / Providers → User Signups**.
6. Actualiza el paso 2 y la marca de Google con el dominio nuevo.

## 4. Inicio con Google ✅

- **URI de redireccionamiento autorizado** del cliente OAuth:
  `https://aihpyqkuqzxmbygxclby.supabase.co/auth/v1/callback`
- **Desarrollo de la marca:** nombre de la app, página principal, privacidad y términos
  del sitio, y dominios autorizados `folio-pdf-eight.vercel.app` y `aihpyqkuqzxmbygxclby.supabase.co`.
- **Público:** «En producción». Solo pide nombre y correo, así que no necesita revisión de Google.
- **Correo de asistencia y de contacto:** `tallerpdf.soporte@gmail.com`
  (propietario del proyecto junto con `juanes09hernandez@gmail.com`).
  Cuando haya dominio, cámbialo a `soporte@tu-dominio`.

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
