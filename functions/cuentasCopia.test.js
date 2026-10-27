// node --test functions/cuentasCopia.test.js — la copia functions/lib/cuentas.mjs es idéntica a src/utils/cuentas.js
// (si falla: node functions/sync-utils.mjs). También comprueba que la copia se importa y calcula igual que el cliente.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");

const CABECERA = "// GENERADO por functions/sync-utils.mjs desde src/utils/cuentas.js — NO EDITAR ACÁ (editá el original y volvé a correr el sync).\n";
const lf = (s) => s.replace(/\r\n/g, "\n");

test("functions/lib/cuentas.mjs está al día con src/utils/cuentas.js", () => {
  const original = lf(readFileSync(path.join(__dirname, "..", "src", "utils", "cuentas.js"), "utf8"));
  const copia = lf(readFileSync(path.join(__dirname, "lib", "cuentas.mjs"), "utf8"));
  assert.ok(copia.startsWith(CABECERA), "la copia lleva la cabecera GENERADO");
  assert.equal(copia.slice(CABECERA.length), original, "la copia difiere del original: node functions/sync-utils.mjs");
});

test("la copia se importa desde CommonJS y calcula saldos", async () => {
  const util = await import("./lib/cuentas.mjs");
  assert.equal(typeof util.saldosDeCuenta, "function");
  assert.equal(typeof util.cobroDe, "function");
  const cuenta = util.cuentaDesdeReserva({ id: "g", grupoId: "g", canchaId: "k1", canchaName: "Cancha 1", fecha: "2026-10-24", horaInicio: "20:00", horaFin: "21:00", turnos: 1, jugadorUid: "u1", nombreJugador: "Gómez", precioTotal: 10000, seña: 0, señaPagada: false }, { agregadoPor: "fn" });
  cuenta.participantes.push(util.nuevoParticipante({ id: "p2", nombre: "Juan", tipo: "jugador" }));
  const s = util.saldosDeCuenta(cuenta);
  assert.equal(s.participantes.length, 2);
  assert.equal(s.participantes[1].debe, 5000);
  const cobro = util.cobroDe(cuenta, ["p2"], { saldos: s });
  assert.equal(cobro.total, 5000);
  assert.equal(cobro.lineas.length, cobro.piezas.length); // 1:1 — el webhook aplica piezas por índice
});

test("functions/lib/planes.mjs está al día con src/utils/planes.js (P3-9)", () => {
  const cab = "// GENERADO por functions/sync-utils.mjs desde src/utils/planes.js — NO EDITAR ACÁ (editá el original y volvé a correr el sync).\n";
  const original = lf(readFileSync(path.join(__dirname, "..", "src", "utils", "planes.js"), "utf8"));
  const copia = lf(readFileSync(path.join(__dirname, "lib", "planes.mjs"), "utf8"));
  assert.equal(copia, cab + original, "la copia difiere del original: node functions/sync-utils.mjs");
});
