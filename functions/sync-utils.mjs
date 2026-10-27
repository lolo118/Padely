// functions/sync-utils.mjs — copia los utils puros del cliente (sin imports) a functions/lib/*.mjs para que las
// Functions usen EXACTAMENTE el mismo código que el panel: src/utils/cuentas.js (saldos de una cuenta: mpCrearPago,
// mpWebhook, barrido) y src/utils/planes.js (planes de los clubes, P3-9). Corre como predeploy de functions
// (firebase.json), en el .cmd de deploy y antes de los tests; functions/cuentasCopia.test.js falla si quedó vieja.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const cabecera = (nombre) => `// GENERADO por functions/sync-utils.mjs desde src/utils/${nombre}.js — NO EDITAR ACÁ (editá el original y volvé a correr el sync).\n`;
export const CABECERA = cabecera("cuentas");

for (const nombre of ["cuentas", "planes", "senas"]) {
  const origen = resolve(aqui, "..", "src", "utils", `${nombre}.js`);
  const destino = resolve(aqui, "lib", `${nombre}.mjs`);
  const fuente = readFileSync(origen, "utf8").replace(/\r\n/g, "\n");
  mkdirSync(dirname(destino), { recursive: true });
  writeFileSync(destino, cabecera(nombre) + fuente);
  console.log(`sync-utils: ${destino} (${fuente.length} bytes)`);
}
