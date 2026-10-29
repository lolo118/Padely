import { test } from "node:test";
import assert from "node:assert/strict";
import {
  descuentoCanchaPara,
  diasAnticipacionCon,
  estadoSocio,
  nombreCorto,
  normalizarPlan,
  preciosConSocio,
  registrarPagoSocio,
  señaConSocio,
  sumarMesesAr,
  textoFranja,
  textosBeneficios,
} from "./membresias.js";

const AR = (s) => new Date(`${s}-03:00`).getTime();

test("normalizarPlan: valida nombre, precio, período y al menos un beneficio", () => {
  assert.match(normalizarPlan({ nombre: "", precio: 1 }).error, /nombre/);
  assert.match(normalizarPlan({ nombre: "Socio", precio: -1 }).error, /precio/);
  assert.match(normalizarPlan({ nombre: "Socio", precio: 1000, beneficios: {} }).error, /beneficio/);
  const p = normalizarPlan({ nombre: " Socio ", precio: "15000", periodo: "anual", cupo: "", beneficios: { descuentoCanchaPct: 150, extras: ["Estacionamiento", " ", "x".repeat(200)] } });
  assert.equal(p.nombre, "Socio");
  assert.equal(p.precio, 15000);
  assert.equal(p.cupo, null);
  assert.equal(p.beneficios.descuentoCanchaPct, 100);
  assert.deepEqual(p.beneficios.extras.map((t) => t.length), [15, 80]);
});

test("franja inválida se descarta; textoFranja", () => {
  const p = normalizarPlan({ nombre: "Mañana", precio: 0, beneficios: { descuentoCanchaPct: 20, franja: { dias: [1, 2, 3, 4, 5], desde: "08:00", hasta: "17:00" } } });
  assert.equal(textoFranja(p.beneficios.franja), "Lun a vie de 08:00 a 17:00");
  const q = normalizarPlan({ nombre: "X", precio: 0, beneficios: { descuentoCanchaPct: 20, franja: { dias: [2], desde: "18:00", hasta: "10:00" } } });
  assert.equal(q.beneficios.franja, null);
});

test("descuento de cancha por franja y precios por turno", () => {
  const b = { descuentoCanchaPct: 25, franja: { dias: [6], desde: "10:00", hasta: "12:00" } };
  assert.equal(descuentoCanchaPara(b, "2026-10-31", "10:00"), 25); // sábado
  assert.equal(descuentoCanchaPara(b, "2026-10-31", "12:00"), 0);
  assert.equal(descuentoCanchaPara(b, "2026-10-30", "10:00"), 0); // viernes
  const r = preciosConSocio([20000, 20000, 20000], b, "2026-10-31", ["10:00", "11:00", "12:00"]);
  assert.deepEqual(r.precios, [15000, 15000, 20000]);
  assert.equal(r.descuento, 10000);
  assert.equal(r.pct, 25);
  assert.deepEqual(preciosConSocio([1000], null, "2026-10-31", ["10:00"]).precios, [1000]);
});

test("estadoSocio: activa, por vencer y vencida por fecha", () => {
  const ahora = AR("2026-10-29T12:00:00");
  assert.equal(estadoSocio({ estado: "activa", vence: AR("2026-11-29T23:59:59") }, ahora).activa, true);
  const pv = estadoSocio({ estado: "activa", vence: AR("2026-11-01T23:59:59") }, ahora);
  assert.equal(pv.porVencer, true);
  assert.equal(pv.diasRestantes, 4);
  assert.equal(estadoSocio({ estado: "activa", vence: AR("2026-10-28T23:59:59") }, ahora).estado, "vencida");
  assert.equal(estadoSocio({ estado: "pendiente" }, ahora).activa, false);
});

test("sumarMesesAr: fin de mes y fin del día argentino", () => {
  assert.equal(sumarMesesAr(AR("2026-01-31T10:00:00"), 1), AR("2026-02-28T23:59:59"));
  assert.equal(sumarMesesAr(AR("2026-10-29T22:30:00"), 12), AR("2027-10-29T23:59:59"));
});

test("registrarPagoSocio: alta desde hoy, renovación vigente suma desde el vencimiento", () => {
  const ahora = AR("2026-10-29T12:00:00");
  const plan = { id: "p1", nombre: "Socio", precio: 15000, periodo: "mensual", beneficios: { descuentoBarPct: 10 } };
  const alta = registrarPagoSocio({ estado: "pendiente", historial: [] }, plan, { ahora, por: "u1" });
  assert.equal(alta.estado, "activa");
  assert.equal(alta.vence, AR("2026-11-29T23:59:59"));
  assert.equal(alta.historial[0].tipo, "alta");
  assert.equal(alta.historial[0].monto, 15000);
  const renov = registrarPagoSocio({ ...alta }, plan, { ahora: AR("2026-11-20T09:00:00"), monto: 14000 });
  assert.equal(renov.vence, AR("2026-12-29T23:59:59"));
  assert.equal(renov.historial[1].tipo, "renovacion");
  assert.equal(renov.desde, alta.desde);
  const tarde = registrarPagoSocio({ ...alta }, plan, { ahora: AR("2026-12-05T09:00:00") });
  assert.equal(tarde.vence, AR("2027-01-05T23:59:59"));
});

test("anticipación, seña y textos", () => {
  assert.equal(diasAnticipacionCon({ diasAnticipacion: 7 }, { diasExtraReserva: 7 }), 14);
  assert.equal(diasAnticipacionCon({}, null), 7);
  assert.equal(señaConSocio(4500, { sinSeña: true }), 0);
  assert.equal(señaConSocio(4500, null), 4500);
  assert.deepEqual(textosBeneficios({ descuentoCanchaPct: 10, franja: null, descuentoBarPct: 5, diasExtraReserva: 1, sinSeña: true, extras: ["Estacionamiento"] }), [
    "10 % off en la cancha",
    "Reservás sin seña",
    "Reservás 1 día antes que el resto",
    "5 % off en el bar",
    "Estacionamiento",
  ]);
  assert.equal(nombreCorto("Juan Carlos Pérez"), "Juan P.");
  assert.equal(nombreCorto(""), "Socio");
});

test("pase familiar: integrantes, lugares y copia para el integrante", async () => {
  const { normalizarPlan: np, lugaresFamilia, copiaParaIntegrante, textoIntegrantes } = await import("./membresias.js");
  const p = np({ nombre: "Familia", precio: 30000, integrantes: 9, beneficios: { sinSeña: true } });
  assert.equal(p.integrantes, 6);
  assert.equal(np({ nombre: "Uno", precio: 1, beneficios: { sinSeña: true } }).integrantes, 1);
  assert.equal(textoIntegrantes({ integrantes: 4 }), "Pase familiar · hasta 4 personas");
  assert.equal(textoIntegrantes({ integrantes: 1 }), null);
  assert.equal(lugaresFamilia({ familia: [{ uid: "a" }] }, { integrantes: 4 }), 2);
  assert.equal(lugaresFamilia({}, { integrantes: 1 }), 0);
  const c = copiaParaIntegrante({ uid: "t1", nombre: "Ana López", estado: "activa", planId: "p", planNombre: "Familia", periodo: "mensual", beneficios: { descuentoBarPct: 10 }, desde: 1, vence: 2 });
  assert.equal(c.titularId, "t1");
  assert.equal(c.beneficios.descuentoBarPct, 10);
  assert.equal(c.estado, "activa");
});
