// node --test functions/profes.test.js — la copia functions/lib/profes.mjs está al día y las Functions de profes la
// pueden usar desde CommonJS (reservarClase, cancelarClase, elogiarClase, mpPagarClase).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");

test("functions/lib/profes.mjs está al día con src/utils/profes.js", async () => {
  const cab = "// GENERADO por functions/sync-utils.mjs desde src/utils/profes.js — NO EDITAR ACÁ (editá el original y volvé a correr el sync).\n";
  const lf = (s) => s.replace(/\r\n/g, "\n");
  const original = lf(readFileSync(path.join(__dirname, "..", "src", "utils", "profes.js"), "utf8"));
  const copia = lf(readFileSync(path.join(__dirname, "lib", "profes.mjs"), "utf8"));
  assert.equal(copia, cab + original, "la copia difiere del original: node functions/sync-utils.mjs");
});

test("la copia se importa y decide como el panel (ids, horas, comisión, elogios)", async () => {
  const P = await import("./lib/profes.mjs");
  assert.equal(P.idClase("p", "2026-11-16", "18:00"), "p_2026-11-16_1800");
  assert.deepEqual(P.horasDeClase("18:00", 90), ["18:00", "19:00"]);
  assert.equal(P.comisionClasesPct({}), 5);
  assert.equal(P.validarElogio({ tags: ["divertido"] }).tags[0], "divertido");
  assert.ok(P.validarElogio({ tags: ["malo"] }).error);
  // El id de la reserva de cancha que arma la Function es el mismo slotId del cliente (cancha_fecha_HHMM)
  const index = readFileSync(path.join(__dirname, "index.js"), "utf8");
  assert.match(index, /const slotIdDe = \(canchaId, fecha, hora\) => `\$\{canchaId\}_\$\{fecha\}_\$\{String\(hora\)\.replace\(":", ""\)\}`;/);
  assert.match(index, /if \(pm\.tipo === "clase"\) return aplicarPagoClaseEnTx\(/);
});
