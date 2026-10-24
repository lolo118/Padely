// node --test src/utils/cuentasCerradas.test.js — B-P3-7-1: las cuentas cerradas antes de la cuenta compartida figuran pagadas
import { test } from "node:test";
import assert from "node:assert/strict";
import { ID_TITULAR, cobroDe, conPago, cuentaDesdeReserva, dividirPorJugador, estadoPagoDe, nuevaLinea, nuevoPago, nuevoParticipante, pagosEfectivos, plural, saldosDeCuenta, textoCanchaDe, textoReparto, textoRepartoLargo, ventasSinPago } from "./cuentas.js";

const ahora = new Date(2026, 9, 22, 20, 49);
const reserva = { id: "k1_2026-10-22_1800", grupoId: "k1_2026-10-22_1800", canchaId: "k1", canchaName: "Cancha 1", fecha: "2026-10-22", horaInicio: "18:00", horaFin: "19:00", turnos: 1, jugadorUid: "u-d", nombreJugador: "Jugador Test", precioTotal: 15000, seña: 4500, señaPagada: false };
const linea = (id, nombre, precio, cantidad = 1, extra = {}) => ({ ...nuevaLinea({ productoId: nombre.toLowerCase(), nombre, precio, cantidad, descuento: 0 }, { uid: "staff", nombre: "Club", ahora }), lineaId: id, ...extra });

// La cuenta D …_1800 de C-P3-6: cerrada el 22/10 con "Cobrar todo" (D1-000013, $ 18.020), ANTES de P3-7: sin participantes ni pagos
const legacyCerrada = () => {
  const c = cuentaDesdeReserva(reserva, { agregadoPor: "staff", ahora });
  delete c.participantes;
  delete c.participantesUids;
  delete c.pagos;
  c.items = [linea("c1", "Cerveza", 3020)];
  c.estado = "cerrada";
  c.ventas = ["D1-000013"];
  c.cerradaPor = "staff";
  c.cerradaEn = ahora;
  return c;
};

test("legacy cerrada con Cobrar todo: pagada, nadie debe, seña cobrada con la cuenta", () => {
  const c = legacyCerrada();
  assert.deepEqual(ventasSinPago(c), ["D1-000013"]);
  const pagos = pagosEfectivos(c);
  assert.equal(pagos.length, 1);
  assert.equal(pagos[0].sintetico, true);
  assert.equal(pagos[0].ventaNumero, "D1-000013");
  assert.deepEqual(pagos[0].participanteIds, [ID_TITULAR]);
  assert.equal(pagos[0].total, 18020); // 3.020 + 15.000 (la seña estaba pendiente: se cobró con la cancha)
  const s = saldosDeCuenta(c);
  assert.equal(s.legacy, false);
  assert.equal(s.sinteticos, 1);
  assert.equal(s.participantes.length, 1);
  assert.equal(s.participantes[0].debe, 0);
  assert.equal(s.participantes[0].pagado, 18020);
  assert.equal(s.participantes[0].pagoPropio, 18020);
  assert.equal(s.pendiente, 0);
  assert.equal(s.pagadoTotal, 18020);
  assert.equal(s.saldada, true);
  assert.deepEqual(estadoPagoDe(s.participantes[0], { vos: true }), { tono: "success", texto: "Pagaste" });
  // La cuenta no se toca: pagosEfectivos es de lectura
  assert.equal(c.pagos, undefined);
});

test("legacy cerrada con división en 3 partes cobradas: legacy, pagada, sin pendiente", () => {
  const base = cuentaDesdeReserva({ ...reserva, señaPagada: true }, { agregadoPor: "staff", ahora });
  delete base.participantes;
  base.items = [linea("a1", "Agua", 1040), linea("a2", "Agua", 1040), linea("c1", "Cerveza", 3020)];
  const d = dividirPorJugador(base, { a1: 0, a2: 1, c1: "compartido" }, { n: 3, nombres: ["Gómez", "Pérez", "López"] });
  const c = { ...base, estado: "cerrada", division: { ...d, partes: d.partes.map((p, i) => ({ ...p, ventaNumero: `D1-00002${i}` })) }, ventas: ["D1-000020", "D1-000021", "D1-000022"] };
  const s = saldosDeCuenta(c);
  assert.equal(s.legacy, true);
  assert.equal(s.pendiente, 0);
  assert.equal(s.pagadoTotal, s.totalCuenta);
  assert.equal(s.saldada, true);
  assert.equal(pagosEfectivos(c).length, 0); // la división manda: no se sintetiza nada
  // Una parte sin cobrar en una cuenta cerrada (no debería pasar) tampoco figura como deuda
  const rara = { ...c, division: { ...c.division, partes: c.division.partes.map((p, i) => (i === 2 ? { ...p, ventaNumero: null } : p)) } };
  assert.equal(saldosDeCuenta(rara).pendiente, 0);
});

test("legacy anulada: sin deudas ni pagos; una abierta sin pagos sigue debiendo", () => {
  const c = { ...legacyCerrada(), estado: "anulada", ventas: [], anulacion: { motivo: "prueba" } };
  const s = saldosDeCuenta(c);
  assert.equal(s.anulada, true);
  assert.equal(s.pendiente, 0);
  assert.equal(s.pagadoTotal, 0);
  assert.equal(s.participantes[0].debe, 0);
  assert.equal(s.sinteticos, 0);
  assert.deepEqual(estadoPagoDe(s.participantes[0]), { tono: "success", texto: "Al día" });
  const abierta = { ...legacyCerrada(), estado: "abierta", ventas: [] };
  const sa = saldosDeCuenta(abierta);
  assert.equal(sa.pendiente, 18020);
  assert.equal(sa.participantes[0].debe, 18020);
  assert.equal(sa.saldada, false);
});

test("cerrada con pagos reales y una venta extra (cerrada a mano): solo la venta que falta se sintetiza", () => {
  const c = cuentaDesdeReserva({ ...reserva, señaPagada: true }, { agregadoPor: "staff", ahora });
  c.participantes.push(nuevoParticipante({ id: "p2", nombre: "Juan", tipo: "jugador", ahora }));
  c.items = [linea("c1", "Cerveza", 3020, 1, { asignadoA: ["p2"] })];
  const cobro = cobroDe(c, ["p2"]);
  const c1 = conPago(c, nuevoPago({ ventaNumero: "D1-000030", participanteIds: ["p2"], piezas: cobro.piezas, medios: [], por: "staff", ahora }));
  const cerrada = { ...c1, estado: "cerrada", ventas: ["D1-000030", "D1-000031"] };
  const pagos = pagosEfectivos(cerrada);
  assert.equal(pagos.length, 2);
  assert.equal(pagos[1].ventaNumero, "D1-000031");
  assert.equal(pagos[1].sintetico, true);
  const s = saldosDeCuenta(cerrada);
  assert.equal(s.pendiente, 0);
  assert.ok(s.participantes.every((p) => p.debe === 0));
  assert.equal(s.pagadoTotal, s.totalCuenta);
  // Juan pagó lo suyo; el titular, el resto (sintético)
  assert.equal(s.participantes.find((p) => p.id === "p2").pagoPropio, cobro.total);
});

test("'Lo pagó Gómez': cubierto por el pago de otro", () => {
  const c = cuentaDesdeReserva({ ...reserva, señaPagada: true }, { agregadoPor: "staff", ahora });
  c.participantes.push(nuevoParticipante({ id: "p2", nombre: "Martín", tipo: "invitado", ahora }));
  c.items = [linea("a1", "Agua", 1040, 1, { asignadoA: ["p2"] })];
  const s0 = saldosDeCuenta(c);
  const todos = cobroDe(c, s0.participantes.map((p) => p.id), { saldos: s0, etiquetar: (id) => id !== ID_TITULAR });
  const c1 = conPago(c, nuevoPago({ ventaNumero: "D1-000040", participanteIds: [ID_TITULAR], piezas: todos.piezas, medios: [], por: "staff", ahora }));
  const s = saldosDeCuenta(c1);
  const martin = s.participantes.find((p) => p.id === "p2");
  assert.equal(martin.debe, 0);
  assert.ok(martin.pagado > 0);
  assert.equal(martin.pagoPropio, 0);
  assert.equal(martin.cubiertoPor, ID_TITULAR);
  assert.equal(martin.cubiertoPorNombre, "Jugador Test");
  assert.deepEqual(estadoPagoDe(martin), { tono: "success", texto: "Lo pagó Jugador Test", cubierto: true });
  const titular = s.participantes.find((p) => p.id === ID_TITULAR);
  assert.equal(titular.cubiertoPor, null);
  assert.equal(estadoPagoDe(titular).texto, "Pagó");
  assert.equal(estadoPagoDe({ debe: 2620 }).texto, "Debe $ 2.620");
});

test("textos: cancha con seña, plurales y reparto largo", () => {
  assert.equal(textoCanchaDe({ canchaBruta: 3000, seña: 380, cancha: 2620, canchaFija: null }), "Cancha $ 3.000 − seña $ 380 = $ 2.620");
  assert.equal(textoCanchaDe({ canchaBruta: 2500, seña: 0, cancha: 2500, canchaFija: 2500 }), "Cancha $ 2.500 (fijo)");
  assert.equal(textoCanchaDe({ canchaPagada: true }), "Cancha pagada");
  assert.equal(textoCanchaDe({ excluirCancha: true }), "Sin cancha");
  assert.equal(plural(1, "ya pagó", "ya pagaron"), "1 ya pagó");
  assert.equal(plural(2, "ya pagó", "ya pagaron"), "2 ya pagaron");
  const s = { reparto: { entre: 4, cabezas: 5, cuota: 3130, fijos: 0, excluidos: 1, pagaron: 1 }, canchaTotal: 15000, señaCredito: 4500 };
  assert.equal(textoReparto(s), "Entre 4 · $ 3.130 c/u · 1 sin cancha · 1 ya pagó");
  assert.equal(textoRepartoLargo(s), "La cancha ($ 15.000) se reparte en partes iguales; ahora entre 4 personas que faltan pagar; 1 no paga cancha; 1 ya pagó la suya. La seña ($ 4.500) va a favor de quien reservó.");
  assert.equal(textoRepartoLargo({ reparto: { entre: 6, cabezas: 6, cuota: 2500, fijos: 0, excluidos: 0, pagaron: 0 }, canchaTotal: 15000, señaCredito: 0 }), "La cancha ($ 15.000) se reparte en partes iguales; entre 6 personas.");
});
