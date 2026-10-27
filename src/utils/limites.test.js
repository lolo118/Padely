// node --test src/utils/limites.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { LIMITES, VENTANA_MS, minutosParaReintentar, siguienteLimite } from "./limites.js";

const T = Date.UTC(2026, 9, 27, 12);

test("límite: primera vez y ventana vencida abren una ventana nueva", () => {
  assert.deepEqual(siguienteLimite(null, T, "reservas"), { nuevaVentana: true, cuenta: 1, excede: false });
  assert.deepEqual(siguienteLimite({ ventanaInicio: T - VENTANA_MS - 61000, cuenta: 5 }, T, "reservas"), { nuevaVentana: true, cuenta: 1, excede: false });
});

test("límite: dentro de la ventana suma hasta el máximo y después excede", () => {
  let actual = null;
  for (let i = 1; i <= LIMITES.reservas; i++) {
    const r = siguienteLimite(actual, T + i * 1000, "reservas");
    assert.equal(r.excede, false);
    assert.equal(r.cuenta, i);
    actual = { ventanaInicio: actual?.ventanaInicio ?? T + 1000, cuenta: r.cuenta };
  }
  assert.equal(siguienteLimite(actual, T + 60000, "reservas").excede, true);
  // Margen de reloj: justo al vencer (sin el minuto extra) todavía cuenta como la misma ventana
  assert.equal(siguienteLimite(actual, actual.ventanaInicio + VENTANA_MS + 1000, "reservas").excede, true);
  assert.equal(minutosParaReintentar(actual, T + 60000), 11);
});

test("límite: inscripciones tiene su propio máximo y un tipo desconocido usa 5", () => {
  assert.equal(siguienteLimite({ ventanaInicio: T, cuenta: LIMITES.inscripciones }, T + 1, "inscripciones").excede, true);
  assert.equal(siguienteLimite({ ventanaInicio: T, cuenta: 4 }, T + 1, "otro").excede, false);
});
