// node --test functions/fichaje.test.js — PINs (scrypt con sal por club) y token del QR de la caja (HMAC)
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const f = require("./fichaje");

test("hashPin: determinista con la misma sal, distinto con otra, nunca el PIN en claro", () => {
  const sal = f.nuevoSecreto();
  const h = f.hashPin("1234", sal);
  assert.equal(h, f.hashPin("1234", sal));
  assert.notEqual(h, f.hashPin("1234", f.nuevoSecreto()));
  assert.notEqual(h, f.hashPin("1235", sal));
  assert.ok(!h.includes("1234"));
  assert.throws(() => f.hashPin("123", sal));
  assert.throws(() => f.hashPin(1234, sal));
  assert.throws(() => f.hashPin("1234", ""));
});

test("empleadosConPin: encuentra solo entre los activos", () => {
  const sal = "s";
  const pines = { a: f.hashPin("1111", sal), b: f.hashPin("2222", sal), c: f.hashPin("1111", sal) };
  assert.deepEqual(f.empleadosConPin(pines, f.hashPin("1111", sal), new Set(["a", "b"])), ["a"]);
  assert.deepEqual(f.empleadosConPin(pines, f.hashPin("1111", sal)), ["a", "c"]);
  assert.deepEqual(f.empleadosConPin(pines, f.hashPin("9999", sal)), []);
  assert.deepEqual(f.empleadosConPin(null, "x"), []);
});

test("token del QR: válido hasta que vence, atado al club y a la clave", () => {
  const clave = f.nuevoSecreto();
  const ahora = Date.UTC(2026, 10, 10, 17, 2);
  const vence = Math.floor(ahora / 1000) + 60;
  const token = f.firmarTokenQr("club1", clave, vence);
  assert.match(token, /^[0-9a-z]+\.[A-Za-z0-9_-]{22}$/);
  assert.ok(token.length <= 32, "corto para que el QR entre en versión chica");
  assert.deepEqual(f.verificarTokenQr("club1", clave, token, ahora), { ok: true, venceSeg: vence });
  assert.equal(f.verificarTokenQr("club1", clave, token, ahora + 61000).motivo, "vencido");
  assert.equal(f.verificarTokenQr("club2", clave, token, ahora).motivo, "firma");
  assert.equal(f.verificarTokenQr("club1", f.nuevoSecreto(), token, ahora).motivo, "firma");
  // estirar el vencimiento rompe la firma
  const [, sig] = token.split(".");
  assert.equal(f.verificarTokenQr("club1", clave, `${(vence + 3600).toString(36)}.${sig}`, ahora).motivo, "firma");
  assert.equal(f.verificarTokenQr("club1", clave, "basura", ahora).motivo, "formato");
  assert.equal(f.verificarTokenQr("club1", clave, null, ahora).motivo, "formato");
});

test("functions/lib/fichajes.mjs está al día con src/utils/fichajes.js y decide igual", async () => {
  const cab = "// GENERADO por functions/sync-utils.mjs desde src/utils/fichajes.js — NO EDITAR ACÁ (editá el original y volvé a correr el sync).\n";
  const lf = (s) => s.replace(/\r\n/g, "\n");
  const original = lf(readFileSync(path.join(__dirname, "..", "src", "utils", "fichajes.js"), "utf8"));
  const copia = lf(readFileSync(path.join(__dirname, "lib", "fichajes.mjs"), "utf8"));
  assert.equal(copia, cab + original, "la copia difiere del original: node functions/sync-utils.mjs");
  const F = await import("./lib/fichajes.mjs");
  const ahora = Date.now();
  assert.equal(F.decidirFichaje({ ahora }).tipo, "entrada");
  assert.equal(F.decidirFichaje({ abiertoEntradaMs: ahora - 3600000, ultimoMs: ahora - 3600000, ahora }).tipo, "salida");
  // index.js usa las mismas listas de permisos que el panel
  const index = readFileSync(path.join(__dirname, "index.js"), "utf8");
  const lista = (nombre) => JSON.parse(new RegExp(`const ${nombre} = (\\[[^\\]]*\\]);`).exec(index)[1]);
  assert.deepEqual(lista("PERMISOS_FICHAR"), F.PERMISOS_FICHAR);
  assert.deepEqual(lista("PERMISOS_ADMIN_FICHAJE"), F.PERMISOS_ADMIN_FICHAJE);
});
