// node --test functions/puntos.test.js — copia servidor del motor de torneos (P3-11)
const { test } = require("node:test");
const assert = require("node:assert/strict");
const p = require("./puntos");

test("calcularTabla servidor: un resultado sin ganador no cuenta (igual que el cliente)", () => {
  const a = { id: "a" };
  const b = { id: "b" };
  const tabla = p.calcularTabla({ parejas: [a, b], partidos: [{ pareja1: a, pareja2: b, resultado: { sets: [{ g1: 6, g2: 4 }, { g1: 4, g2: 6 }] } }] });
  assert.deepEqual(tabla.map((f) => [f.id, f.pj, f.pg]), [["a", 0, 0], ["b", 0, 0]]);
  const ganado = p.calcularTabla({ parejas: [a, b], partidos: [{ pareja1: a, pareja2: b, resultado: { sets: [{ g1: 6, g2: 6, tb1: 7, tb2: 3 }] } }] });
  assert.equal(ganado[0].id, "a");
  assert.equal(ganado[0].pg, 1);
  assert.equal(p.getGanador({ sets: [{ g1: 6, g2: 4 }, { g1: 4, g2: 6 }] }), null);
});
