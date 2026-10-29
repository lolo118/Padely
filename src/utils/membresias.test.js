import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cambiosBaja,
  descuentoCanchaPara,
  diasAnticipacionCon,
  estadoSocio,
  inscripcionConPase,
  nivelPorPuntos,
  nombreCorto,
  normalizarPase,
  preciosConSocio,
  proximoNivel,
  puntosPorGasto,
  registrarCobroPase,
  señaConSocio,
  sumarMesesAr,
  sumarPuntos,
  textoFranja,
  textosBeneficios,
} from "./membresias.js";

const AR = (s) => new Date(`${s}-03:00`).getTime();
const PASE = normalizarPase({
  precio: 15000,
  meses: 1,
  umbrales: { plata: 150, oro: 400 },
  beneficios: { bronce: { descuentoBarPct: 5 }, plata: { descuentoBarPct: 10, descuentoCanchaPct: 10 }, oro: { descuentoBarPct: 15, torneoGratis: true, extras: ["Prioridad de estacionamiento"] } },
});

test("normalizarPase: precio, meses, umbrales y al menos un beneficio", () => {
  assert.match(normalizarPase({ precio: 0 }).error, /precio/);
  assert.match(normalizarPase({ precio: 1000, meses: 2 }).error, /1, 3, 6 o 12/);
  assert.match(normalizarPase({ precio: 1000, umbrales: { plata: 300, oro: 200 }, beneficios: { bronce: { sinSeña: true } } }).error, /Oro/);
  assert.match(normalizarPase({ precio: 1000 }).error, /beneficio/);
  assert.equal(PASE.precio, 15000);
  assert.deepEqual(PASE.umbrales, { plata: 150, oro: 400 });
  assert.equal(PASE.beneficios.oro.torneoGratis, true);
  assert.equal(PASE.beneficios.bronce.descuentoTorneoPct, 0);
});

test("puntos → nivel y próximo nivel", () => {
  assert.equal(puntosPorGasto(20000), 20);
  assert.equal(puntosPorGasto(999), 0);
  assert.equal(nivelPorPuntos(0, PASE.umbrales), "bronce");
  assert.equal(nivelPorPuntos(150, PASE.umbrales), "plata");
  assert.equal(nivelPorPuntos(400, PASE.umbrales), "oro");
  assert.deepEqual(proximoNivel(100, PASE.umbrales), { siguiente: "plata", faltan: 50 });
  assert.equal(proximoNivel(500, PASE.umbrales), null);
  const s = sumarPuntos({ puntos: 140 }, PASE, 20);
  assert.deepEqual(s, { puntos: 160, nivel: "plata", subio: true });
});

test("cobro del Pase: alta desde hoy, renovación desde el vencimiento, beneficios del nivel", () => {
  const ahora = AR("2026-10-29T12:00:00");
  const alta = registrarCobroPase(null, PASE, { ahora, paymentId: "p1" });
  assert.equal(alta.estado, "activa");
  assert.equal(alta.vence, AR("2026-11-29T23:59:59"));
  assert.equal(alta.nivel, "bronce");
  assert.equal(alta.beneficios.descuentoBarPct, 5);
  assert.equal(alta.historial[0].tipo, "alta");
  const conPuntos = { ...alta, puntos: 420 };
  const renov = registrarCobroPase(conPuntos, PASE, { ahora: AR("2026-11-25T09:00:00") });
  assert.equal(renov.vence, AR("2026-12-29T23:59:59"));
  assert.equal(renov.nivel, "oro");
  assert.equal(renov.beneficios.torneoGratis, true);
  // Baja y vuelta después de 90 días → puntos en 0
  const baja = { ...renov, ...cambiosBaja(AR("2026-12-01T10:00:00")) };
  assert.equal(baja.beneficios, null);
  const vuelve = registrarCobroPase(baja, PASE, { ahora: AR("2027-03-15T10:00:00") });
  assert.equal(vuelve.puntos, 0);
  assert.equal(vuelve.nivel, "bronce");
  const vuelvePronto = registrarCobroPase(baja, PASE, { ahora: AR("2027-01-15T10:00:00") });
  assert.equal(vuelvePronto.puntos, 420);
});

test("estadoSocio y sumarMesesAr", () => {
  const ahora = AR("2026-10-29T12:00:00");
  assert.equal(estadoSocio({ estado: "activa", vence: AR("2026-10-28T23:59:59") }, ahora).estado, "vencida");
  assert.equal(estadoSocio({ estado: "activa", vence: AR("2026-11-01T23:59:59") }, ahora).diasRestantes, 4);
  assert.equal(sumarMesesAr(AR("2026-01-31T10:00:00"), 1), AR("2026-02-28T23:59:59"));
});

test("descuentos: cancha por franja, seña, anticipación, torneo", () => {
  const b = { descuentoCanchaPct: 25, franja: { dias: [6], desde: "10:00", hasta: "12:00" } };
  assert.equal(descuentoCanchaPara(b, "2026-10-31", "10:00"), 25);
  assert.equal(descuentoCanchaPara(b, "2026-10-30", "10:00"), 0);
  assert.deepEqual(preciosConSocio([20000, 20000, 20000], b, "2026-10-31", ["10:00", "11:00", "12:00"]).precios, [15000, 15000, 20000]);
  assert.equal(señaConSocio(4500, { sinSeña: true }), 0);
  assert.equal(diasAnticipacionCon({ diasAnticipacion: 7 }, { diasExtraReserva: 7 }), 14);
  assert.equal(inscripcionConPase(30000, { descuentoTorneoPct: 20 }), 24000);
  assert.equal(inscripcionConPase(30000, { torneoGratis: true }), 0);
  assert.equal(inscripcionConPase(30000, null), 30000);
  assert.equal(textoFranja({ dias: [1, 2, 3, 4, 5], desde: "08:00", hasta: "17:00" }), "Lun a vie de 08:00 a 17:00");
  assert.deepEqual(textosBeneficios(PASE.beneficios.oro), ["15 % off en el bar", "Inscripción gratis a los torneos del club", "Prioridad de estacionamiento"]);
  assert.equal(nombreCorto("Juan Carlos Pérez"), "Juan P.");
});

test("sponsors por nivel y puntos de los últimos 12 meses", async () => {
  const { normalizarPase: np, beneficiosDeNivel, puntosVigentes, textosBeneficios: tb } = await import("./membresias.js");
  const p = np({ precio: 15000, sponsors: [{ nombre: "Deportes Norte", detalle: "paletas y ropa", pct: { bronce: 0, plata: 10, oro: 15 } }, { nombre: "", pct: { oro: 5 } }] });
  assert.equal(p.sponsors.length, 1);
  assert.deepEqual(beneficiosDeNivel(p, "bronce").sponsors, []);
  assert.deepEqual(tb(beneficiosDeNivel(p, "oro")), ["15 % off en Deportes Norte (paletas y ropa)"]);
  const ahora = AR("2026-10-29T12:00:00");
  assert.equal(puntosVigentes([{ cantidad: 100, en: AR("2026-01-10T10:00:00") }, { cantidad: 50, en: AR("2025-10-01T10:00:00") }], ahora), 100);
});
