// node --test src/utils/senas.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { POLITICA_SEÑA_DEFECTO, creditoDisponible, inicioDelTurnoMs, politicaDe, resolverSeñaCancelada } from "./senas.js";

const H = 60 * 60 * 1000;
const turno = inicioDelTurnoMs("2026-10-28", "21:00");

test("inicio del turno en hora argentina", () => {
  assert.equal(new Date(turno).toISOString(), "2026-10-29T00:00:00.000Z");
  assert.equal(inicioDelTurnoMs("", "21:00"), null);
});

test("política: defecto y valores raros", () => {
  assert.deepEqual(politicaDe({}), POLITICA_SEÑA_DEFECTO);
  assert.deepEqual(politicaDe({ politicaSeña: { reembolso: "nunca" } }), { reembolso: "nunca", horas: 24 });
  assert.deepEqual(politicaDe({ politicaSeña: { reembolso: "x", horas: -3 } }), POLITICA_SEÑA_DEFECTO);
  assert.deepEqual(politicaDe({ politicaSeña: { reembolso: "hasta_horas", horas: 6 } }), { reembolso: "hasta_horas", horas: 6 });
});

test("cancela el club: siempre se devuelve (MP → devolución, efectivo → crédito)", () => {
  const base = { canceladaPor: "club", politica: { reembolso: "nunca", horas: 24 }, inicioTurnoMs: turno, ahoraMs: turno - H, señaPagada: true, monto: 6000 };
  assert.equal(resolverSeñaCancelada({ ...base, medio: "mercadopago" }).accion, "reembolso_mp");
  assert.equal(resolverSeñaCancelada({ ...base, medio: null }).accion, "credito");
});

test("cancela el jugador según la política", () => {
  const base = { canceladaPor: "jugador", inicioTurnoMs: turno, señaPagada: true, monto: 6000, medio: "mercadopago" };
  assert.equal(resolverSeñaCancelada({ ...base, politica: { reembolso: "siempre", horas: 24 }, ahoraMs: turno - H }).accion, "reembolso_mp");
  assert.equal(resolverSeñaCancelada({ ...base, politica: { reembolso: "nunca", horas: 24 }, ahoraMs: turno - 48 * H }).accion, "queda_club");
  assert.equal(resolverSeñaCancelada({ ...base, politica: { reembolso: "hasta_horas", horas: 24 }, ahoraMs: turno - 25 * H }).accion, "reembolso_mp");
  assert.equal(resolverSeñaCancelada({ ...base, politica: { reembolso: "hasta_horas", horas: 24 }, ahoraMs: turno - 23 * H }).accion, "queda_club");
  assert.equal(resolverSeñaCancelada({ ...base, medio: "efectivo", politica: { reembolso: "hasta_horas", horas: 24 }, ahoraMs: turno - 30 * H }).accion, "credito");
});

test("sin seña pagada no pasa nada", () => {
  assert.equal(resolverSeñaCancelada({ canceladaPor: "club", señaPagada: false, monto: 6000 }).accion, "nada");
  assert.equal(resolverSeñaCancelada({ canceladaPor: "club", señaPagada: true, monto: 0 }).accion, "nada");
});

test("crédito disponible por club", () => {
  const cs = [{ clubId: "a", monto: 3000, estado: "disponible" }, { clubId: "a", monto: 1000, estado: "usado" }, { clubId: "b", monto: 500, estado: "disponible" }, { clubId: "a", monto: "1500", estado: "disponible" }];
  assert.equal(creditoDisponible(cs, "a"), 4500);
  assert.equal(creditoDisponible(cs, "c"), 0);
});
