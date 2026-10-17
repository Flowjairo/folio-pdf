# Folio PDF

> Puesta en marcha (Supabase, Google, dominio): ver `CONFIGURAR.md`.

Sitio estático en español para procesar PDF en el navegador. Los archivos elegidos no se suben a un backend. No hay servicios de conversión externos, analítica, historial de documentos ni almacenamiento persistente en la aplicación.

## Funciones

- Unir PDF con orden de archivos configurable.
- Extraer páginas por rangos o separar cada página en un PDF dentro de un ZIP.
- Optimización estructural y compresión de escaneos por rasterización, con aceptación explícita de pérdida de funciones.
- Editor de texto añadido, resaltados e imágenes, con navegación y deshacer.
- JPG/PNG/WebP a PDF, con orientación, márgenes y tamaño de página.
- PDF a JPG, individual o ZIP, con resolución configurable.
- Organización de páginas: mover, excluir y girar.
- Rotación por rangos.
- Marca de agua de texto: posición, tamaño, color y opacidad.
- Números de página con inicio, posición y formato.
- Firma dibujada con ratón o dedo, recortada y colocada sobre el PDF.
- Extracción de texto seleccionable a TXT.
- Rellenar formularios AcroForm: texto, casillas, opciones y listas; conserva los campos editables.

## Límites

60 MB y 300 páginas por operación. Imágenes de hasta 40 megapíxeles. Los PDF cifrados y dañados se rechazan. No se ofrece OCR en español, edición del texto original, conversión Office ni firma digital certificada. Los añadidos de texto admiten caracteres latinos y signos de WinAnsi; se muestra un error para símbolos no compatibles. Las modificaciones pueden invalidar firmas previas. Combinar y copiar páginas puede perder marcadores, adjuntos o formularios. La rasterización pierde texto seleccionable, enlaces y formularios y requiere consentimiento. La reducción de tamaño no se garantiza: si el resultado pesa más, se devuelve el original.

## Estructura

`dist/index.html`, `styles.css`, `app.js`, `pdf-core.js`, `pdf-forms.js`, `icons.js`. Dependencias incluidas en `dist/vendor`: pdf-lib 1.17.1 (MIT), PDF.js 5.6.205 legacy (Apache 2.0), JSZip 3.10.1 (MIT/GPL). Licencias junto a los archivos. Sin compilación ni instalación para servir `dist` sobre HTTP(S). No abrir mediante file://, porque usa módulos y workers.

El despliegue está configurado en `.openai/hosting.json`. Se conserva su identidad y la audiencia configurada en Sites (pública en la última consulta).

## Verificación

`node tests/pdf.test.mjs` verifica rangos, extracción, unión, orden, giro, numeración, marca, texto añadido, imágenes, firma y optimización con PDF reales, lectura independiente mediante PDF.js y render con canvas. Para render utiliza los paquetes de canvas y PDF.js del runtime disponible. Las pruebas generan material temporal fuera de `dist`. No se ha ejecutado QA visual en navegador porque el control de navegador requerido por el entorno no está disponible.

La prueba `node tests/ui-state.test.mjs` verifica restauración de controles deshabilitados, límites de navegación y descarte de imágenes que terminan de cargar después de cambiar de sesión o selección. Se evita exportar mientras se valida una anotación. Son pruebas de estado sin navegador.

Los formularios admiten hasta 300 campos. No ejecutan cálculos ni scripts, no convierten escaneos en formularios y rechazan XFA y campos huérfanos. Los campos de solo lectura, contraseña y tipos no admitidos se conservan sin edición.

`node tests/forms.test.mjs` verifica valores, apariencias, opciones, validaciones y campos editables después de guardar. También se comprobó el PDF con pypdf y renderizado mediante Poppler.

## OCR

OCR de escaneos en inglés a TXT, hasta 20 páginas por operación. Motor Tesseract.js 7.0.0 y modelos servidos localmente desde vendor/ocr, sin CDN ni envío de documentos. Carga bajo demanda, cancelación y límite de dos minutos por página. No conserva formato ni crea PDF buscable. El modelo español no está incluido porque su descarga no está disponible en este entorno.

## Cuenta y herramientas añadidas

- Registro obligatorio con Supabase (correo y contraseña, o Google). Sin sesión, abrir una herramienta lleva a `/entrar` y luego regresa a la misma herramienta.
- `/corregir`: corrige líneas del texto original (tapa la línea y escribe la nueva encima; el texto anterior puede seguir dentro del archivo), añade texto y tapa zonas.
- `/corregir?modo=contrasena`: pone, cambia o quita contraseñas con qpdf-wasm 0.3.0.
- Esta página usa el mismo pdf.js 5.6.205 de `dist/vendor/` con `isEvalSupported: false` (protege contra CVE-2024-4367). En `dist/vendor/corregir/` quedan pdf-lib 1.17.1 y qpdf-wasm 0.3.0 (mismos archivos que publica npm).
