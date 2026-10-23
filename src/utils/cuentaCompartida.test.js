// node --test src/utils/cuentaCompartida.test.js — participantes, asignación, pagos congelados y saldos (P3-7)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ID_TITULAR,
  asignarLineas,
  calcularTotalesCuenta,
  cobroDe,
  cobroDeLineas,
  cobroRestoAlTitular,
  cobroTodo,
  conPago,
  cuentaDesdeReserva,
  cuentaSaldada,
  dividirPorJugador,
  esLegacyDividida,
  lineaPagada,
  lineasDeVentaParaTodo,
  mensajeInvitacion,
  normalizarCuenta,
  nuevaLinea,
  nuevoPago,
  nuevoParticipante,
  participantesActivos,
  puedeAsignar,
  saldosDeCuenta,
  telefonoWa,
  textoReparto,
  titularDeCuenta,
  totalDeLineas,
  uidsDe,
} from "./cuentas.js";

const ahora = new Date(2026, 9, 23, 20, 0);
const reserva = { id: "k1_2026-10-23_2000", grupoId: "k1_2026-10-23_2000", canchaId: "k1", canchaName: "Cancha 1", fecha: "2026-10-23", horaInicio: "20:00", horaFin: "21:00", turnos: 1, jugadorUid: "u-gomez", nombreJugador: "Gómez", precioTotal: 20000, seña: 4500, señaPagada: true };
const persona = (id, nombre, extra = {}) => nuevoParticipante({ id, nombre, tipo: "jugador", origen: "link", ahora, ...extra });
const linea = (id, nombre, precio, cantidad = 1, extra = {}) => ({ ...nuevaLinea({ productoId: nombre.toLowerCase(), nombre, precio, cantidad, descuento: 0, costo: extra.costo ?? null }, { uid: "staff", nombre: "Club", ahora }), lineaId: id, ...extra });
// n participantes: el titular + n−1 jugadores (p2…pn)
const cuentaCon = (n, { items = [], seña = true, cancha = 20000, extras = {} } = {}) => {
  const c = cuentaDesdeReserva({ ...reserva, precioTotal: cancha, señaPagada: seña }, { agregadoPor: "staff", ahora });
  for (let i = 2; i <= n; i++) c.participantes.push(persona(`p${i}`, `Jugador ${i}`, extras[`p${i}`] || {}));
  c.participantesUids = uidsDe(c.participantes);
  c.items = items;
  c.totales = calcularTotalesCuenta(c);
  return c;
};
const por = (s, id) => s.participantes.find((p) => p.id === id);
const sumaTotales = (s) => s.participantes.reduce((a, p) => a + p.total, 0);
// Cobra a estos participantes y devuelve la cuenta con el pago congelado
const pagar = (c, ids, numero, { etiquetar = null } = {}) => {
  const cobro = cobroDe(c, ids, { etiquetar });
  return { cuenta: conPago(c, nuevoPago({ ventaNumero: numero, participanteIds: ids, piezas: cobro.piezas, medios: [{ medio: "efectivo", monto: cobro.total }], por: "staff", ahora })), cobro };
};

test("la cuenta nace con el titular; la vieja se normaliza en la próxima escritura", () => {
  const c = cuentaDesdeReserva(reserva, { agregadoPor: "staff", ahora });
  assert.equal(c.participantes.length, 1);
  assert.equal(c.participantes[0].id, ID_TITULAR);
  assert.equal(c.participantes[0].tipo, "titular");
  assert.equal(c.participantes[0].uid, "u-gomez");
  assert.deepEqual(c.participantesUids, ["u-gomez"]);
  assert.deepEqual(c.pagos, []);
  const vieja = { jugadorUid: "u-x", nombreJugador: "Acosta", estado: "abierta", items: [], division: { modo: "total", partes: [{ parteId: "p1", total: 100, ventaNumero: null }] } };
  const n = normalizarCuenta(vieja, { agregadoPor: "staff", ahora });
  assert.equal(n.participantes[0].nombre, "Acosta");
  assert.deepEqual(n.participantesUids, ["u-x"]);
  assert.deepEqual(n.pagos, []);
  assert.equal(n.division, null); // división sin partes cobradas: se deja caer
  assert.equal(titularDeCuenta(vieja).uid, "u-x");
  assert.equal(participantesActivos(vieja).length, 1);
  // Ya normalizada: nada que escribir
  assert.deepEqual(normalizarCuenta(c), {});
  // Un participante quitado no cuenta ni aporta su uid
  const q = cuentaCon(3);
  q.participantes[2].estado = "quitado";
  q.participantes[2].uid = "u-q";
  assert.equal(participantesActivos(q).length, 2);
  assert.deepEqual(uidsDe(q.participantes), ["u-gomez"]);
});

test("4 participantes: cancha en partes iguales ($ 10) con la seña a favor del titular; los totales cierran", () => {
  const c = cuentaCon(4, { items: [linea("a1", "Agua", 1040, 2, { costo: 500 }), linea("c1", "Cerveza", 3020, 1, { asignadoA: ["p2"], costo: 1500 })] });
  const s = saldosDeCuenta(c);
  assert.equal(s.legacy, false);
  assert.equal(s.titularId, ID_TITULAR);
  // Cancha 20.000 entre 4 = 5.000; la seña 4.500 baja la del titular a 500
  assert.deepEqual(s.participantes.map((p) => p.canchaBruta), [5000, 5000, 5000, 5000]);
  assert.equal(por(s, ID_TITULAR).seña, 4500);
  assert.equal(por(s, ID_TITULAR).cancha, 500);
  assert.equal(por(s, "p2").cancha, 5000);
  // Agua sin asignar: 2.080 entre 4 → 520 cada uno; Cerveza de p2
  assert.equal(por(s, ID_TITULAR).sinAsignar, 520);
  assert.equal(por(s, "p2").consumos.length, 2);
  assert.equal(por(s, "p2").consumos.find((x) => x.lineaId === "c1").monto, 3020);
  assert.equal(por(s, "p2").consumos.find((x) => x.lineaId === "c1").compartidoCon, 1);
  assert.equal(por(s, "p2").consumos.find((x) => x.lineaId === "a1").compartidoCon, 4);
  assert.deepEqual(s.participantes.map((p) => p.debe), [1020, 8540, 5520, 5520]);
  assert.equal(s.pendiente, 20600);
  assert.equal(s.totalCuenta, calcularTotalesCuenta(c).total); // 20.000 + 5.100 − 4.500
  assert.equal(sumaTotales(s), s.totalCuenta);
  assert.equal(s.asignadoTotal, 3020);
  assert.equal(s.sinAsignarTotal, 2080);
  assert.equal(s.saldada, false);
  assert.equal(textoReparto(s), "Entre 4 · $ 5.000 c/u");
});

test("8 y 12 participantes: pasos de $ 10 y el resto al titular", () => {
  const c8 = cuentaCon(8, { cancha: 21000, seña: false });
  const s8 = saldosDeCuenta(c8);
  // 21.000 / 8 = 2.625 → 2.630 por cabeza (redondeo a $ 10), el titular absorbe la diferencia
  assert.equal(por(s8, "p2").canchaBruta, 2630);
  assert.equal(por(s8, ID_TITULAR).canchaBruta, 21000 - 2630 * 7);
  assert.equal(sumaTotales(s8), 21000);
  const c12 = cuentaCon(12, { cancha: 20000, items: [linea("a1", "Agua", 1000, 7)] });
  const s12 = saldosDeCuenta(c12);
  assert.equal(s12.participantes.length, 12);
  // 20.000 / 12 = 1.666,7 → 1.670 × 11 + resto 1.630 al titular; seña 4.500 > 1.630: el sobrante baja a los demás
  assert.equal(por(s12, "p2").canchaBruta, 1670);
  assert.equal(por(s12, ID_TITULAR).canchaBruta, 20000 - 1670 * 11);
  assert.equal(por(s12, ID_TITULAR).cancha, 0);
  assert.equal(por(s12, ID_TITULAR).seña, 1630);
  // sobrante 2.870 entre 11 → repartir: base 260 ×10 + 270 al primero
  const señasOtros = s12.participantes.filter((p) => p.id !== ID_TITULAR).map((p) => p.seña);
  assert.equal(señasOtros.reduce((a, b) => a + b, 0), 2870);
  assert.ok(señasOtros.every((x) => x === 260 || x === 270));
  // Agua 7.000 sin asignar entre 12: 580 × 11 + 620
  assert.equal(por(s12, "p3").sinAsignar, 580);
  assert.equal(sumaTotales(s12), s12.totalCuenta);
  assert.equal(s12.totalCuenta, 20000 + 7000 - 4500);
});

test("excluido de la cancha y monto fijo de cancha", () => {
  const c = cuentaCon(5, { seña: false, extras: { p2: { excluirCancha: true }, p3: { canchaFija: 2000 } } });
  const s = saldosDeCuenta(c);
  assert.equal(por(s, "p2").canchaBruta, 0);
  assert.equal(por(s, "p3").canchaBruta, 2000);
  // 20.000 − 2.000 fijos = 18.000 entre titular, p4 y p5 → 6.000
  assert.deepEqual([ID_TITULAR, "p4", "p5"].map((id) => por(s, id).canchaBruta), [6000, 6000, 6000]);
  assert.equal(sumaTotales(s), 20000);
  assert.equal(s.reparto.entre, 3);
  assert.equal(s.reparto.fijos, 1);
  assert.equal(s.reparto.excluidos, 1);
  assert.match(textoReparto(s), /Entre 3 · \$ 6\.000 c\/u · 1 con monto fijo · 1 sin cancha/);
});

test("seña mayor que la parte del titular: el sobrante baja las partes de los demás", () => {
  const c = cuentaCon(4, { cancha: 12000, seña: true }); // seña 4.500; 12.000 / 4 = 3.000
  const s = saldosDeCuenta(c);
  assert.equal(por(s, ID_TITULAR).canchaBruta, 3000);
  assert.equal(por(s, ID_TITULAR).seña, 3000);
  assert.equal(por(s, ID_TITULAR).cancha, 0);
  // sobran 1.500 entre 3 → 500 cada uno
  assert.deepEqual(["p2", "p3", "p4"].map((id) => por(s, id).cancha), [2500, 2500, 2500]);
  assert.equal(sumaTotales(s), 12000 - 4500);
});

test("quien se suma después de que dos pagaron no cambia lo que esos dos pagaron", () => {
  const c = cuentaCon(4, { seña: false, items: [linea("a1", "Agua", 1000, 4)] }); // cancha 20.000 → 5.000 c/u; agua 4.000 → 1.000 c/u
  const { cuenta: c1, cobro: pagoP2 } = pagar(c, ["p2"], "D1-000001");
  assert.equal(pagoP2.total, 6000);
  assert.deepEqual(
    pagoP2.lineas.map((l) => [l.nombre, l.subtotal, l.tipoLinea, l.participanteId]),
    [
      ["Agua (1/4)", 1000, "consumo", "p2"],
      ["Cancha 1 · 20:00–21:00 (1/4)", 5000, "cancha", "p2"],
    ],
  );
  const { cuenta: c2 } = pagar(c1, ["p3"], "D1-000002");
  // Se suma un quinto
  const c3 = { ...c2, participantes: [...c2.participantes, persona("p5", "Tarde")] };
  const s = saldosDeCuenta(c3);
  assert.equal(por(s, "p2").pagado, 6000);
  assert.equal(por(s, "p2").debe, 0);
  assert.equal(por(s, "p3").debe, 0);
  // Resto de cancha 10.000 entre titular, p4 y p5: 3.340 / 3.330 / 3.330; resto del agua 2.000 entre los 3: 660/670/670
  assert.deepEqual([ID_TITULAR, "p4", "p5"].map((id) => por(s, id).canchaBruta), [3340, 3330, 3330]);
  assert.deepEqual([ID_TITULAR, "p4", "p5"].map((id) => por(s, id).sinAsignar), [660, 670, 670]);
  assert.equal(s.pagadoTotal, 12000);
  assert.equal(s.pendiente, 12000);
  assert.equal(sumaTotales(s), 24000);
  assert.equal(s.saldada, false);
  assert.equal(lineaPagada(c3, "a1"), true);
  assert.equal(puedeAsignar({ cuenta: c3, linea: c3.items[0], asignadoA: ["p4"], esStaff: true }), false); // línea con pagos: congelada
});

test("una línea compartida entre 3 y líneas sin asignar", () => {
  const items = [linea("c1", "Cerveza", 3020, 1, { asignadoA: ["p2", "p3", "p4"] }), linea("f1", "Fernet", 5000, 1), linea("a1", "Agua", 1040, 1, { asignadoA: ["p3"] })];
  const c = cuentaCon(4, { seña: false, cancha: 0, items });
  const s = saldosDeCuenta(c);
  // Cerveza 3.020 entre p2, p3, p4 → 1.010 por cabeza (redondeo a $ 10) y el resto, 1.000, al primero de la lista
  assert.deepEqual(["p2", "p3", "p4"].map((id) => por(s, id).consumos.find((x) => x.lineaId === "c1").monto), [1000, 1010, 1010]);
  assert.equal(por(s, ID_TITULAR).consumos.find((x) => x.lineaId === "c1"), undefined);
  // Fernet sin asignar: 5.000 entre los 4 → 1.250 cada uno
  assert.ok(s.participantes.every((p) => p.sinAsignar === 1250));
  assert.equal(por(s, "p3").debe, 1010 + 1250 + 1040);
  assert.equal(sumaTotales(s), 3020 + 5000 + 1040);
  assert.equal(s.canchaTotal, 0);
  assert.equal(s.reparto, null);
});

test("cobrar a Juan, agregarle una línea después: vuelve a deber; la cuenta se cierra sola al último pago", () => {
  const c = cuentaCon(2, { seña: false, cancha: 10000, items: [linea("a1", "Agua", 1000, 1, { asignadoA: ["p2"] })] });
  const { cuenta: c1 } = pagar(c, ["p2"], "D1-000010");
  let s = saldosDeCuenta(c1);
  assert.equal(por(s, "p2").pagado, 6000);
  assert.equal(por(s, "p2").debe, 0);
  assert.equal(s.saldada, false);
  // Nueva Agua para Juan (p2)
  const c2 = { ...c1, items: [...c1.items, linea("a2", "Agua", 1000, 1, { asignadoA: ["p2"] })] };
  c2.totales = calcularTotalesCuenta(c2);
  s = saldosDeCuenta(c2);
  assert.equal(por(s, "p2").debe, 1000);
  assert.equal(por(s, "p2").canchaBruta, 0); // su cancha ya está pagada: congelada
  assert.equal(por(s, "p2").total, 7000);
  const { cuenta: c3 } = pagar(c2, ["p2"], "D1-000011");
  const { cuenta: c4, cobro } = pagar(c3, [ID_TITULAR], "D1-000012");
  assert.equal(cobro.total, 5000);
  assert.equal(cuentaSaldada(c4), true);
  const fin = saldosDeCuenta(c4);
  assert.equal(fin.pendiente, 0);
  assert.equal(fin.pagadoTotal, 12000);
  assert.equal(fin.totalCuenta, 12000);
  assert.ok(fin.participantes.every((p) => p.debe === 0));
});

test("cobrar el resto al titular: una venta del titular con las deudas de los demás, etiquetadas", () => {
  const c = cuentaCon(3, { seña: true, cancha: 15000, items: [linea("c1", "Cerveza", 3020, 1, { asignadoA: ["p3"] }), linea("a1", "Agua", 1000, 3)] });
  const { cuenta: c1 } = pagar(c, ["p2"], "D1-000020");
  const cobro = cobroRestoAlTitular(c1);
  assert.deepEqual(cobro.cubreA, [ID_TITULAR, "p3"]);
  const nombres = cobro.lineas.map((l) => l.nombre);
  assert.ok(nombres.includes("Cerveza · de Jugador 3"));
  assert.ok(nombres.includes("Cancha 1 · 20:00–21:00 (1/3) · de Jugador 3"));
  assert.ok(nombres.some((n) => n.startsWith("Agua (1/3)") && !n.includes("de ")));
  assert.ok(nombres.includes("Seña pagada"));
  const s1 = saldosDeCuenta(c1);
  assert.equal(cobro.total, s1.pendiente);
  const c2 = conPago(c1, nuevoPago({ ventaNumero: "D1-000021", participanteIds: [ID_TITULAR], piezas: cobro.piezas, medios: [{ medio: "efectivo", monto: cobro.total }], por: "staff", ahora }));
  assert.equal(cuentaSaldada(c2), true);
  const s2 = saldosDeCuenta(c2);
  assert.equal(por(s2, "p3").pagado, por(s1, "p3").debe); // la deuda de p3 quedó cubierta por el pago del titular
  assert.deepEqual(c2.pagos[1].cubreA, [ID_TITULAR, "p3"]);
  assert.equal(s2.pagadoTotal, s2.totalCuenta);
});

test("ejemplo del reporte: 8 participantes, seña 4.500 del titular, Juan paga primero, se suman 2 más, resto al titular", () => {
  // Cancha 20.000, seña 4.500 pagada; consumos: 6 Aguas sin asignar (6.240), 2 Cervezas de Juan (6.040)
  const c = cuentaCon(8, { cancha: 20000, seña: true, items: [linea("a1", "Agua", 1040, 6), linea("c1", "Cerveza", 3020, 2, { asignadoA: ["p2"] })] });
  c.participantes[1].nombre = "Juan";
  let s = saldosDeCuenta(c);
  // Cancha 20.000 / 8 = 2.500; titular 2.500 − 4.500 → 0, sobran 2.000 entre 7: 290 ×6 + 260 (repartir: 2000/7=285,7→290; resto 2000−1740=260 al primero)
  assert.equal(por(s, ID_TITULAR).cancha, 0);
  assert.equal(por(s, "p2").canchaBruta, 2500);
  const señasOtros = s.participantes.filter((p) => p.id !== ID_TITULAR).map((p) => p.seña);
  assert.equal(señasOtros.reduce((a, b) => a + b, 0), 2000);
  // Aguas 6.240 entre 8 = 780 c/u
  assert.ok(s.participantes.every((p) => p.sinAsignar === 780));
  // Juan: cancha 2.500 − 260 (primero en recibir el sobrante) + aguas 780 + cervezas 6.040
  assert.equal(por(s, "p2").seña, 260);
  assert.equal(por(s, "p2").debe, 2240 + 780 + 6040);
  assert.equal(sumaTotales(s), 20000 + 6240 + 6040 - 4500);
  // Juan paga
  const { cuenta: c1, cobro: cobroJuan } = pagar(c, ["p2"], "D1-000030");
  assert.equal(cobroJuan.total, 9060);
  // Se suman dos más (p9, p10)
  const c2 = { ...c1, participantes: [...c1.participantes, persona("p9", "Nueve"), persona("p10", "Diez")] };
  s = saldosDeCuenta(c2);
  assert.equal(por(s, "p2").debe, 0);
  assert.equal(por(s, "p2").pagado, 9060);
  // Cancha restante 17.500 entre 9 (titular + p3..p10, Juan afuera): 1.940 × 8 + 1.980 al titular
  assert.equal(por(s, "p3").canchaBruta, 1940);
  assert.equal(por(s, ID_TITULAR).canchaBruta, 17500 - 1940 * 8);
  // Seña disponible 4.500 − 260 ya aplicada en el pago de Juan = 4.240: titular 1.980 → 0; sobran 2.260 entre 8
  assert.equal(por(s, ID_TITULAR).cancha, 0);
  assert.equal(s.señaDisponible, 4240);
  // Aguas: pagadas 780 por Juan; restan 5.460 entre 9 → 610 × 8 + 580 al titular
  assert.equal(por(s, "p9").sinAsignar, 610);
  assert.equal(por(s, ID_TITULAR).sinAsignar, 5460 - 610 * 8);
  assert.equal(sumaTotales(s), s.totalCuenta);
  assert.equal(s.pendiente, s.totalCuenta - 9060);
  // Cobrar el resto al titular
  const resto = cobroRestoAlTitular(c2);
  assert.equal(resto.total, s.pendiente);
  assert.equal(resto.cubreA.length, 9);
  const c3 = conPago(c2, nuevoPago({ ventaNumero: "D1-000031", participanteIds: [ID_TITULAR], piezas: resto.piezas, medios: [{ medio: "tarjeta", monto: resto.total }], por: "staff", ahora }));
  assert.equal(cuentaSaldada(c3), true);
  assert.equal(saldosDeCuenta(c3).pagadoTotal, s.totalCuenta);
});

test("cobrar todo sin pagos previos es el ticket de siempre; cobrar seleccionados a un pagador", () => {
  const c = cuentaCon(1, { items: [linea("a1", "Agua", 1040, 2, { costo: 500 })] });
  const todo = cobroTodo(c);
  const clasico = lineasDeVentaParaTodo(c);
  assert.deepEqual(
    todo.lineas.map((l) => [l.nombre, l.subtotal, l.tipoLinea]),
    clasico.map((l) => [l.nombre, l.subtotal, l.tipoLinea]),
  );
  assert.equal(todo.total, totalDeLineas(clasico));
  assert.equal(todo.lineas[0].participanteId, ID_TITULAR);
  assert.deepEqual(todo.cubreA, [ID_TITULAR]);
  // Con varios participantes y sin pagos, el ticket sigue siendo el clásico pero las piezas quedan por persona
  const c3 = cuentaCon(3, { seña: false, cancha: 9000, items: [linea("f1", "Fernet", 3000, 1)] });
  const todo3 = cobroTodo(c3);
  assert.equal(todo3.lineas.length, 2); // Fernet + Cancha, como siempre
  assert.equal(todo3.piezas.filter((p) => p.tipo === "cancha").length, 3);
  assert.equal(todo3.total, 12000);
  const cerrada = conPago(c3, nuevoPago({ ventaNumero: "D1-000040", participanteIds: [ID_TITULAR], piezas: todo3.piezas, medios: [], por: "staff", ahora }));
  assert.equal(cuentaSaldada(cerrada), true);
  // Seleccionados: p3 paga el Fernet entero (las partes de los 3)
  const sel = cobroDeLineas(c3, ["f1"], "p3");
  assert.equal(sel.total, 3000);
  assert.deepEqual(sel.cubreA.sort(), [ID_TITULAR, "p2", "p3"].sort());
  assert.ok(sel.lineas.some((l) => l.nombre === "Fernet (1/3) · de Gómez"));
  assert.ok(sel.lineas.some((l) => l.nombre === "Fernet (1/3)" && l.participanteId === "p3"));
  const c3b = conPago(c3, nuevoPago({ ventaNumero: "D1-000041", participanteIds: ["p3"], piezas: sel.piezas, medios: [], por: "staff", ahora }));
  const s3b = saldosDeCuenta(c3b);
  assert.equal(por(s3b, ID_TITULAR).sinAsignar, 0);
  assert.equal(por(s3b, ID_TITULAR).debe, 3000); // solo su cancha
  assert.equal(s3b.pendiente, 9000);
});

test("asignar: quién puede qué", () => {
  const c = cuentaCon(3, { cancha: 0, items: [linea("a1", "Agua", 1000, 1), linea("c1", "Cerveza", 3000, 1, { asignadoA: ["p2"], pedidoUid: "u-p2" })] });
  c.participantes[1].uid = "u-p2";
  const p2 = c.participantes[1];
  const p3 = c.participantes[2];
  const [agua, cerveza] = c.items;
  assert.equal(puedeAsignar({ cuenta: c, linea: agua, asignadoA: ["p3"], esStaff: true }), true);
  assert.equal(puedeAsignar({ cuenta: c, linea: agua, asignadoA: ["p3"], esTitular: true }), true);
  // p2 puede compartir su cerveza o quedársela, no empujarla a p3 sola
  assert.equal(puedeAsignar({ cuenta: c, linea: cerveza, asignadoA: ["p2", "p3"], participante: p2 }), true);
  assert.equal(puedeAsignar({ cuenta: c, linea: cerveza, asignadoA: [], participante: p2 }), true);
  assert.equal(puedeAsignar({ cuenta: c, linea: cerveza, asignadoA: ["p3"], participante: p2 }), false);
  // p3 no toca la cerveza de p2, pero sí puede tomar la agua sin asignar (lo incluye)
  assert.equal(puedeAsignar({ cuenta: c, linea: cerveza, asignadoA: ["p3"], participante: p3 }), false);
  assert.equal(puedeAsignar({ cuenta: c, linea: agua, asignadoA: ["p3"], participante: p3 }), false); // no lo incluye hoy ni es su pedido
  const items = asignarLineas(c.items, ["a1"], ["p2", "p3", "p3"]);
  assert.deepEqual(items[0].asignadoA, ["p2", "p3"]);
  assert.deepEqual(items[1].asignadoA, ["p2"]);
  const cerradaC = { ...c, estado: "cerrada" };
  assert.equal(puedeAsignar({ cuenta: cerradaC, linea: agua, asignadoA: [], esStaff: true }), false);
});

test("legacy: una cuenta dividida con partes cobradas no se toca", () => {
  const base = cuentaCon(1, { seña: false, cancha: 10000, items: [linea("a1", "Agua", 1000, 2)] });
  const d = dividirPorJugador(base, { a1: 0 }, { n: 2, nombres: ["Gómez", "Pérez"] });
  const legacy = { ...base, participantes: undefined, division: { ...d, partes: d.partes.map((p, i) => (i === 0 ? { ...p, ventaNumero: "D1-000050" } : p)) } };
  assert.equal(esLegacyDividida(legacy), true);
  const s = saldosDeCuenta(legacy);
  assert.equal(s.legacy, true);
  assert.deepEqual(s.participantes, []);
  assert.equal(s.totalCuenta, 12000);
  assert.equal(s.pagadoTotal, d.partes[0].total);
  assert.equal(s.pendiente, 12000 - d.partes[0].total);
  assert.equal(s.saldada, false);
  assert.deepEqual(normalizarCuenta(legacy, { ahora }).division, undefined); // la división se conserva
  assert.equal(normalizarCuenta(legacy, { ahora }).participantes.length, 1); // el titular igual se completa
  // Sin partes cobradas la división ya no manda
  assert.equal(esLegacyDividida({ ...base, division: d }), false);
});

test("WhatsApp: número argentino y mensaje", () => {
  assert.equal(telefonoWa("385 412-3456"), "5493854123456");
  assert.equal(telefonoWa("0385 15 412 3456"), "5493854123456");
  assert.equal(telefonoWa("+54 9 385 412 3456"), "5493854123456");
  assert.equal(telefonoWa("11 5555 1234"), "5491155551234");
  assert.equal(telefonoWa("12345"), "");
  assert.equal(telefonoWa(""), "");
  const msg = mensajeInvitacion({ fechaTexto: "vie 23 oct", hora: "20:00", clubNombre: "Club Padely Central", canchaNombre: "Cancha 1", url: "https://padely.app/t/unirse/c/tok" });
  assert.equal(msg, "Sumate al turno del vie 23 oct · 20:00 en Club Padely Central (Cancha 1). Entrá acá para ver lo que te toca pagar y pedir a la barra: https://padely.app/t/unirse/c/tok");
});
