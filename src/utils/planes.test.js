// node --test src/utils/planes.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { COMISION_FREE_PCT, ESCALONES_PRO, aMs, canchasActivas, cambiarPlan, comisionPct, escalonDe, estadoPlan, iniciarPrueba, planInicial, precioAnual, puedeUsar, registrarPago, sumarMeses, tienePro, transicionVencida } from "./planes.js";

const DIA = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 9, 27, 12, 0, 0);

test("escalones PRO por canchas activas", () => {
  assert.equal(escalonDe(0).precio, 35000);
  assert.equal(escalonDe(4).precio, 35000);
  assert.equal(escalonDe(5).precio, 50000);
  assert.equal(escalonDe(8).precio, 50000);
  assert.equal(escalonDe(9).precio, 65000);
  assert.equal(escalonDe(10).id, "pro-9");
  assert.equal(precioAnual(ESCALONES_PRO[0]), 350000);
  assert.equal(canchasActivas([{ activa: true }, {}, { activa: false }, null]), 2);
});

test("club sin plan = legacy: PRO sin bloqueos ni comisión", () => {
  const e = estadoPlan({ nombre: "Club Padely Central" }, T0);
  assert.equal(e.tipo, "legacy");
  assert.equal(e.pro, true);
  assert.equal(puedeUsar({}, "bar", T0), true);
  assert.equal(comisionPct({ mercadoPago: { comisionPadelyPct: 0 } }, T0), 0);
});

test("prueba: arranca con la primera reserva, aviso desde el día 20, vence a los 30", () => {
  const club = { plan: planInicial() };
  assert.equal(estadoPlan(club, T0).sinEmpezar, true);
  assert.equal(tienePro(club, T0), true);
  const empezada = iniciarPrueba(club.plan, T0);
  assert.equal(empezada.vence - empezada.inicio, 30 * DIA);
  assert.equal(iniciarPrueba(empezada, T0 + DIA), null, "no reinicia una prueba ya empezada");
  assert.equal(iniciarPrueba({ tipo: "pro" }, T0), null);
  const c = { plan: empezada };
  assert.equal(estadoPlan(c, T0 + 19 * DIA).avisoPrueba, false);
  assert.equal(estadoPlan(c, T0 + 20 * DIA).avisoPrueba, true);
  assert.equal(estadoPlan(c, T0 + 20 * DIA).diasRestantes, 10);
  assert.equal(estadoPlan(c, T0 + 30 * DIA + 1).pro, false);
  assert.equal(estadoPlan(c, T0 + 30 * DIA + 1).vencido, true);
});

test("transiciones del barrido: prueba vencida y pro sin pagar (7 días de gracia) pasan a free", () => {
  const prueba = iniciarPrueba(planInicial(), T0);
  assert.equal(transicionVencida(prueba, T0 + 29 * DIA), null);
  const free = transicionVencida(prueba, T0 + 31 * DIA);
  assert.equal(free.tipo, "free");
  assert.equal(free.historial.at(-1).tipo, "prueba");
  assert.equal(transicionVencida(planInicial(), T0 + 400 * DIA), null, "una prueba sin empezar no vence");
  const pro = { tipo: "pro", inicio: T0, vence: T0 + 30 * DIA, historial: [] };
  assert.equal(transicionVencida(pro, T0 + 36 * DIA), null, "en gracia sigue pro");
  assert.equal(estadoPlan({ plan: pro }, T0 + 36 * DIA).enGracia, true);
  assert.equal(transicionVencida(pro, T0 + 38 * DIA).tipo, "free");
  assert.equal(transicionVencida({ tipo: "free" }, T0), null);
});

test("FREE: bar y staff bloqueados, comisión 2,5 % salvo override del super-admin", () => {
  const club = { plan: { tipo: "free" } };
  assert.equal(puedeUsar(club, "bar", T0), false);
  assert.equal(puedeUsar(club, "staff", T0), false);
  assert.equal(puedeUsar(club, "canchas", T0), true);
  assert.equal(comisionPct(club, T0), COMISION_FREE_PCT);
  assert.equal(comisionPct({ ...club, mercadoPago: { comisionOverridePct: 1 } }, T0), 1);
  assert.equal(comisionPct({ plan: { tipo: "pro", vence: T0 + DIA } }, T0), 0);
  assert.equal(comisionPct({ plan: planInicial() }, T0), 0);
  // Una comisión puesta antes de los planes (comisionPadelyPct > 0) se respeta aunque el club sea "de antes"
  assert.equal(comisionPct({ mercadoPago: { comisionPadelyPct: 5 } }, T0), 5);
  assert.equal(comisionPct({ plan: { tipo: "free" }, mercadoPago: { comisionPadelyPct: 0 } }, T0), COMISION_FREE_PCT);
});

test("pago recibido: +1 mes desde el vencimiento vigente o desde hoy; anual = 12 meses a precio de 10", () => {
  const e = escalonDe(6);
  const desdeFree = registrarPago({ tipo: "free", inicio: T0 - 50 * DIA, historial: [] }, { escalon: e, ahora: T0, por: "sa" });
  assert.equal(desdeFree.tipo, "pro");
  assert.equal(desdeFree.vence, sumarMeses(T0, 1));
  assert.equal(desdeFree.escalon, "pro-5-8");
  assert.deepEqual(desdeFree.historial.map((h) => h.tipo), ["free", "pago"]);
  assert.equal(desdeFree.historial.at(-1).monto, 50000);
  // Renovación anticipada: suma desde el vencimiento actual
  const renovado = registrarPago(desdeFree, { escalon: e, ahora: T0 + 10 * DIA });
  assert.equal(renovado.vence, sumarMeses(desdeFree.vence, 1));
  const anual = registrarPago({ tipo: "prueba", inicio: T0, vence: T0 + 30 * DIA }, { escalon: escalonDe(2), anual: true, ahora: T0 + 5 * DIA });
  assert.equal(anual.vence, sumarMeses(T0 + 5 * DIA, 12));
  assert.equal(anual.historial.at(-1).monto, 350000);
  assert.equal(anual.historial.at(-1).meses, 12);
});

test("sumarMeses respeta fin de mes y aMs entiende Timestamps", () => {
  assert.equal(new Date(sumarMeses(Date.UTC(2026, 0, 31, 15), 1)).getUTCDate(), 28);
  assert.equal(new Date(sumarMeses(Date.UTC(2028, 0, 31, 15), 1)).getUTCDate(), 29);
  // 30/01 22:00 en Argentina (31/01 01:00 UTC) + 1 mes = 28/02 22:00 en Argentina, no el 27
  const r = sumarMeses(Date.UTC(2026, 0, 31, 1), 1);
  assert.equal(new Date(r - 3 * 3600000).getUTCDate(), 28);
  assert.equal(new Date(r - 3 * 3600000).getUTCHours(), 22);
  assert.equal(aMs({ toMillis: () => 5 }), 5);
  assert.equal(aMs({ seconds: 2, nanoseconds: 0 }), 2000);
  assert.equal(aMs(null), null);
  const c = cambiarPlan({ tipo: "pro", inicio: T0, vence: T0 + DIA }, { tipo: "free", ahora: T0, por: "sa" });
  assert.equal(c.tipo, "free");
  assert.equal(c.historial.length, 1);
});
