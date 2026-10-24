// functions/sync-utils.mjs — copia src/utils/cuentas.js (puro, sin imports) a functions/lib/cuentas.mjs para que las
// Functions calculen los saldos de una cuenta con EXACTAMENTE el mismo código que el cliente (mpCrearPago, mpWebhook).
// Corre como predeploy de functions (firebase.json), en el .cmd de deploy y antes de los tests; la copia se versiona y
// functions/cuentasCopia.test.js falla si quedó vieja.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const origen = resolve(aqui, "..", "src", "utils", "cuentas.js");
const destino = resolve(aqui, "lib", "cuentas.mjs");
export const CABECERA = "// GENERADO por functions/sync-utils.mjs desde src/utils/cuentas.js — NO EDITAR ACÁ (editá el original y volvé a correr el sync).\n";
const fuente = readFileSync(origen, "utf8").replace(/\r\n/g, "\n");
mkdirSync(dirname(destino), { recursive: true });
writeFileSync(destino, CABECERA + fuente);
console.log(`sync-utils: ${destino} (${fuente.length} bytes)`);
