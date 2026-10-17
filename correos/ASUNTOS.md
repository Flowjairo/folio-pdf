# Plantillas de correo (Supabase → Authentication → Emails → Templates)

| Plantilla de Supabase | Asunto | Archivo |
|---|---|---|
| Confirm signup | Verifica tu correo para entrar a Folio PDF | `confirmar-cuenta.html` |
| Reset password | Cambia tu contraseña de Folio PDF | `restablecer-contrasena.html` |
| Change email address | Confirma tu correo nuevo en Folio PDF | `cambiar-correo.html` |

Los correos salen por Resend (SMTP), pero el texto se edita aquí, en Supabase.
`{{ .ConfirmationURL }}` es la variable de Supabase con el enlace; no la borres.
