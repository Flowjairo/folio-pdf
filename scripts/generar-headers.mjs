/*
  Folio PDF · genera dist/_headers (Cloudflare Pages) a partir de vercel.json.
  Así las cabeceras de seguridad son idénticas en los dos alojamientos y no se desincronizan.

  Uso:  node scripts/generar-headers.mjs          (escribe el archivo)
        node scripts/generar-headers.mjs --check  (falla si está desactualizado)
*/
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const vercel = JSON.parse(readFileSync(join(raiz, "vercel.json"), "utf8"));
const destino = join(raiz, "dist", "_headers");

// Cloudflare usa "/*" donde Vercel usa "/(.*)"
const ruta = (fuente) => (fuente === "/(.*)" ? "/*" : fuente);

let salida = "# Generado por scripts/generar-headers.mjs a partir de vercel.json. No lo edites a mano.\n";
for (const grupo of vercel.headers) {
  salida += `\n${ruta(grupo.source)}\n`;
  for (const { key, value } of grupo.headers) {
    const linea = `  ${key}: ${value}`;
    if (linea.length > 2000) throw new Error(`La cabecera ${key} pasa de 2000 caracteres (límite de Cloudflare).`);
    salida += `${linea}\n`;
  }
}

const reglas = vercel.headers.length;
if (reglas > 100) throw new Error(`${reglas} reglas: Cloudflare admite 100 como máximo.`);

if (process.argv.includes("--check")) {
  const actual = readFileSync(destino, "utf8");
  if (actual !== salida) {
    console.error("dist/_headers está desactualizado. Ejecuta: node scripts/generar-headers.mjs");
    process.exit(1);
  }
  console.log(`dist/_headers al día (${reglas} reglas).`);
} else {
  writeFileSync(destino, salida);
  console.log(`dist/_headers generado (${reglas} reglas).`);
}
