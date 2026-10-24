// node --test src/utils/cuentas.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calcularTotalesCuenta,
  cuentaDesdeReserva,
  estadoPagoDe,
  nuevoParticipante,
  saldosDeCuenta,
  cuentaEditable,
  dividirEnPartesIguales,
  dividirPorJugador,
  divisionCompleta,
  lineasDeVentaParaParte,
  lineasDeVentaParaTodo,
  montoCancha,
  nuevaLinea,
  parteDelJugador,
  repartir,
  redondearA10,
  sincronizarSeña,
  textoTurno,
  totalDeLineas,
  ventanaDeTurno,
  ALERTA_SEÑA_POSTERIOR,
} from "./cuentas.js";

const cuenta = {
  id: "g1",
  canchaNombre: "Cancha 1",
  horaInicio: "20:00",
  horaFin: "22:00",
  nombreJugador: "Gómez",
  jugadorUid: "u-gomez",
  estado: "abierta",
  cancha: { precioTotal: 10000, seña: 3000, señaPagada: false, cobrar: true },
  items: [
    { lineaId: "a1", productoId: "agua", nombre: "Agua", precio: 1040, cantidad: 1, descuento: 0, subtotal: 1040, controlaStock: true },
    { lineaId: "a2", productoId: "agua", nombre: "Agua", precio: 1040, cantidad: 1, descuento: 0, subtotal: 1040, controlaStock: true },
    { lineaId: "c1", productoId: "cerveza", nombre: "Cerveza", precio: 3020, cantidad: 1, descuento: 0, subtotal: 3020, controlaStock: true },
  ],
  division: null,
  ventas: [],
};

test("repartir redondea a $ 10 y deja el resto en la parte 1", () => {
  assert.deepEqual(repartir(10000, 4), [2500, 2500, 2500, 2500]);
  assert.deepEqual(repartir(3020, 4), [740, 760, 760, 760]); // 755 redondea a 760; el resto (740) va a la parte 1
  assert.deepEqual(repartir(1040, 4), [260, 260, 260, 260]);
  assert.deepEqual(repartir(100, 3), [40, 30, 30]);
  assert.deepEqual(repartir(1000, 1), [1000]);
  assert.equal(repartir(12345, 7).reduce((a, b) => a + b, 0), 12345);
  assert.equal(redondearA10(755), 760);
});

test("totales: seña pendiente no se descuenta; pagada sí; sin cobrar cancha solo consumos", () => {
  assert.deepEqual(calcularTotalesCuenta(cuenta), { consumos: 5100, cancha: 10000, seña: 0, total: 15100 });
  const pagada = { ...cuenta, cancha: { ...cuenta.cancha, señaPagada: true } };
  assert.deepEqual(calcularTotalesCuenta(pagada), { consumos: 5100, cancha: 10000, seña: 3000, total: 12100 });
  assert.equal(montoCancha(pagada), 7000);
  const sinCancha = { ...cuenta, cancha: { ...cuenta.cancha, cobrar: false } };
  assert.deepEqual(calcularTotalesCuenta(sinCancha), { consumos: 5100, cancha: 0, seña: 0, total: 5100 });
  assert.equal(textoTurno(cuenta), "Cancha 1 · 20:00–22:00 · Gómez");
});

test("partes iguales: cada línea y la cancha se comparten; la suma cierra", () => {
  const pagada = { ...cuenta, cancha: { ...cuenta.cancha, señaPagada: true } };
  const d = dividirEnPartesIguales(pagada, 4);
  assert.equal(d.modo, "total");
  assert.equal(d.partes.length, 4);
  assert.equal(d.partes[0].nombre, "Gómez");
  assert.equal(d.partes[0].uid, "u-gomez");
  assert.equal(d.partes[1].nombre, "Jugador 2");
  // consumos 5100 → 260+260+740 / 260+260+760 ×3 ; cancha 10000/4 = 2500 ; seña 3000/4 = 750
  assert.deepEqual(d.partes.map((p) => p.consumos), [1260, 1280, 1280, 1280]);
  assert.deepEqual(d.partes.map((p) => p.cancha), [1750, 1750, 1750, 1750]);
  assert.deepEqual(d.partes.map((p) => p.total), [3010, 3030, 3030, 3030]);
  assert.equal(d.partes.reduce((s, p) => s + p.total, 0), calcularTotalesCuenta(pagada).total);
  assert.equal(dividirEnPartesIguales(cuenta, 1).partes.length, 2);
  assert.equal(dividirEnPartesIguales(cuenta, 99).partes.length, 8);
});

test("cada uno lo suyo: asignadas, compartida y cancha en partes iguales (ejemplo del reporte)", () => {
  // Agua → Jugador 1, Agua → Jugador 2, Cerveza compartida, cancha 10000 con seña 30 % pendiente
  const d = dividirPorJugador(cuenta, { a1: 0, a2: 1, c1: "compartido" }, { n: 4 });
  assert.equal(d.modo, "porJugador");
  assert.deepEqual(d.partes.map((p) => p.consumos), [1040 + 740, 1040 + 760, 760, 760]);
  assert.deepEqual(d.partes.map((p) => p.cancha), [2500, 2500, 2500, 2500]);
  assert.deepEqual(d.partes.map((p) => p.total), [4280, 4300, 3260, 3260]);
  assert.equal(d.partes.reduce((s, p) => s + p.total, 0), 15100);
  assert.deepEqual(d.partes[0].items, ["a1"]);
  assert.equal(d.partes[0].compartidos.length, 1);
  assert.equal(d.partes[0].compartidos[0].fraccion, "1/4");
});

test("cada uno lo suyo con la cancha a cargo de uno y seña pagada", () => {
  const pagada = { ...cuenta, cancha: { ...cuenta.cancha, señaPagada: true } };
  const d = dividirPorJugador(pagada, { a1: 0, a2: 1, c1: 2 }, { n: 3, canchaPagaParte: 0, nombres: ["Gómez", "Pérez", "López"] });
  assert.deepEqual(d.partes.map((p) => p.cancha), [7000, 0, 0]);
  assert.deepEqual(d.partes.map((p) => p.total), [1040 + 7000, 1040, 3020]);
  assert.equal(d.partes[1].nombre, "Pérez");
  const lineas = lineasDeVentaParaParte({ ...pagada, division: d }, d.partes[0]);
  assert.deepEqual(
    lineas.map((l) => [l.nombre, l.subtotal, l.controlaStock]),
    [
      ["Agua", 1040, false],
      ["Cancha 1 · 20:00–22:00", 10000, false],
      ["Seña pagada", -3000, false],
    ],
  );
  assert.equal(totalDeLineas(lineas), 8040);
});

test("líneas de venta: todas sin stock, compartidas con fracción, cancha y seña", () => {
  const pagada = { ...cuenta, cancha: { ...cuenta.cancha, señaPagada: true } };
  const todo = lineasDeVentaParaTodo(pagada);
  assert.equal(todo.length, 5);
  assert.ok(todo.every((l) => l.controlaStock === false));
  assert.equal(todo[3].nombre, "Cancha 1 · 20:00–22:00");
  assert.equal(todo[4].subtotal, -3000);
  assert.equal(totalDeLineas(todo), 12100);

  const d = dividirPorJugador(pagada, { a1: 0, a2: 1, c1: "compartido" }, { n: 4 });
  const parte3 = lineasDeVentaParaParte({ ...pagada, division: d }, d.partes[2]);
  assert.deepEqual(
    parte3.map((l) => [l.nombre, l.subtotal]),
    [
      ["Cerveza (1/4)", 760],
      ["Cancha 1 · 20:00–22:00 (1/4)", 2500],
      ["Seña pagada (1/4)", -750],
    ],
  );
  assert.equal(totalDeLineas(parte3), d.partes[2].total);
  // Las 4 ventas suman exactamente el total de la cuenta
  const suma = d.partes.reduce((s, p) => s + totalDeLineas(lineasDeVentaParaParte({ ...pagada, division: d }, p)), 0);
  assert.equal(suma, 12100);
});

test("estado de la división y parte del jugador", () => {
  const d = dividirPorJugador(cuenta, { a1: 0, a2: 1, c1: "compartido" }, { n: 2, nombres: ["Gómez", "Pérez"] });
  const c = { ...cuenta, division: d };
  assert.equal(cuentaEditable(c), true);
  assert.equal(divisionCompleta(c), false);
  const pagadaUna = { ...c, division: { ...d, partes: d.partes.map((p, i) => (i === 0 ? { ...p, ventaNumero: "D1-000010" } : p)) } };
  assert.equal(cuentaEditable(pagadaUna), false);
  assert.equal(divisionCompleta(pagadaUna), false);
  const todas = { ...c, division: { ...d, partes: d.partes.map((p) => ({ ...p, ventaNumero: "D1-000011" })) } };
  assert.equal(divisionCompleta(todas), true);
  assert.equal(parteDelJugador(c, "u-gomez").nombre, "Gómez");
  assert.equal(parteDelJugador(c, "otro", "pérez").nombre, "Pérez");
  assert.equal(parteDelJugador(c, "otro", "Nadie"), null);
  assert.equal(parteDelJugador(cuenta, "u-gomez"), null);
});

test("ventana del turno y cuenta desde la reserva", () => {
  const hoy = new Date(2026, 9, 22, 19, 45);
  const fecha = "2026-10-22";
  const r = { fecha, horaInicio: "20:00", horaFin: "22:00", turnos: 2 };
  assert.equal(ventanaDeTurno(r, hoy), true); // 15 min antes
  assert.equal(ventanaDeTurno(r, new Date(2026, 9, 22, 19, 20)), false);
  assert.equal(ventanaDeTurno(r, new Date(2026, 9, 22, 22, 59)), true); // hasta 60 min después
  assert.equal(ventanaDeTurno(r, new Date(2026, 9, 22, 23, 1)), false);
  assert.equal(ventanaDeTurno({ ...r, fecha: "2026-10-21" }, hoy), false);
  const c = cuentaDesdeReserva({ id: "slot1", grupoId: "slot1", canchaId: "k1", canchaName: "Cancha 1", fecha, horaInicio: "20:00", horaFin: "22:00", turnos: 2, jugadorUid: null, nombreJugador: "Gómez", precioTotal: 10000, seña: 3000, señaPagada: false });
  assert.equal(c.reservaGrupoId, "slot1");
  assert.equal(c.cancha.cobrar, true);
  assert.deepEqual(calcularTotalesCuenta(c), { consumos: 0, cancha: 10000, seña: 0, total: 10000 });
  const l = nuevaLinea({ productoId: "agua", nombre: "Agua", precio: 1040, cantidad: 2, descuento: 80 }, { uid: "u1", nombre: "Club" });
  assert.equal(l.subtotal, 2000);
  assert.equal(l.estado, "entregado");
  assert.ok(l.lineaId.length > 8);
});

test("B-P3-7b-1: la seña marcada después de abrir la cuenta se acredita si nadie pagó cancha; si no, alerta", () => {
  // Cuenta abierta con la seña pendiente (foto al nacer): cobra la cancha completa
  const abierta = { ...cuenta, participantes: [{ id: "titular", uid: "u-gomez", nombre: "Gómez", tipo: "titular", estado: "activo" }] };
  assert.equal(calcularTotalesCuenta(abierta).total, 15100);
  // El club marca la seña cobrada en la reserva
  const r1 = sincronizarSeña(abierta, { seña: 3000, señaPagada: true });
  assert.equal(r1.alerta, null);
  assert.equal(r1.cambios.cancha.señaPagada, true);
  assert.equal(r1.cambios.cancha.seña, 3000);
  assert.equal(r1.cambios.totales.total, 12100); // 15.100 − 3.000: la seña ya no se cobra dos veces
  assert.equal(r1.cambios.totales.seña, 3000);
  // Sin cambios: nada que escribir
  assert.deepEqual(sincronizarSeña({ ...abierta, cancha: r1.cambios.cancha }, { seña: 3000, señaPagada: true }), { cambios: null, alerta: null });
  // Si cambia el monto de la seña (sigue pendiente) también se copia
  const r2 = sincronizarSeña(abierta, { seña: 4500, señaPagada: false });
  assert.equal(r2.cambios.cancha.seña, 4500);
  assert.equal(r2.cambios.totales.total, 15100);
  // Alguien ya pagó su parte de cancha: el dinero congelado no se toca, queda la alerta
  const conCanchaPagada = { ...abierta, pagos: [{ id: "x", ventaNumero: "D1-000001", participanteIds: ["titular"], total: 5000, lineas: [{ lineaId: null, tipo: "cancha", monto: 5000, participanteId: "titular" }] }] };
  const r3 = sincronizarSeña(conCanchaPagada, { seña: 3000, señaPagada: true });
  assert.equal(r3.cambios, null);
  assert.equal(r3.alerta, ALERTA_SEÑA_POSTERIOR);
  // Solo consumos pagados: la cancha sigue libre, se acredita
  const conConsumoPagado = { ...abierta, pagos: [{ id: "y", ventaNumero: "D1-000002", participanteIds: ["titular"], total: 1040, lineas: [{ lineaId: "a1", tipo: "consumo", monto: 1040, participanteId: "titular" }] }] };
  assert.equal(sincronizarSeña(conConsumoPagado, { seña: 3000, señaPagada: true }).cambios.totales.total, 12100);
  // Cerrada o anulada: no se toca
  assert.deepEqual(sincronizarSeña({ ...abierta, estado: "cerrada" }, { seña: 3000, señaPagada: true }), { cambios: null, alerta: null });
});

test("P3-8: quien pagó por Mercado Pago figura 'Pagó · Mercado Pago'", () => {
  const cuenta = cuentaDesdeReserva({ id: "g", grupoId: "g", canchaId: "k1", canchaName: "Cancha 1", fecha: "2026-10-24", horaInicio: "20:00", horaFin: "21:00", turnos: 1, jugadorUid: "u1", nombreJugador: "Gómez", precioTotal: 10000, seña: 0, señaPagada: false }, { agregadoPor: "t" });
  cuenta.participantes.push(nuevoParticipante({ id: "p2", nombre: "Juan", tipo: "jugador" }));
  const pagoMp = { id: "mp_1", ventaNumero: "MP-000001", participanteIds: ["p2"], total: 5000, medios: [{ medio: "mercadopago", monto: 5000 }], lineas: [{ lineaId: null, tipo: "cancha", monto: 5000, participanteId: "p2" }] };
  const s = saldosDeCuenta({ ...cuenta, pagos: [pagoMp] });
  const juan = s.participantes.find((p) => p.id === "p2");
  assert.equal(juan.debe, 0);
  assert.equal(juan.medioPago, "mercadopago");
  assert.equal(estadoPagoDe(juan).texto, "Pagó · Mercado Pago");
  assert.equal(estadoPagoDe(juan, { vos: true }).texto, "Pagaste · Mercado Pago");
  assert.equal(s.participantes.find((p) => p.id === "titular").medioPago, null);
  // Un pago del mostrador y otro de MP a nombre de la misma persona: "mixto" (sin coletilla)
  const mostrador = { id: "m", ventaNumero: "D1-000001", participanteIds: ["titular"], total: 5000, medios: [{ medio: "efectivo", monto: 5000 }], lineas: [{ lineaId: null, tipo: "cancha", monto: 5000, participanteId: "titular" }] };
  const s2 = saldosDeCuenta({ ...cuenta, pagos: [pagoMp, mostrador, { ...pagoMp, id: "mp_2", participanteIds: ["titular"], lineas: [{ lineaId: "x", tipo: "consumo", monto: 100, participanteId: "titular" }] }], items: [{ lineaId: "x", nombre: "Agua", cantidad: 1, subtotal: 100, asignadoA: ["titular"] }] });
  assert.equal(s2.participantes.find((p) => p.id === "titular").medioPago, "mixto");
  assert.equal(estadoPagoDe(s2.participantes.find((p) => p.id === "titular")).texto, "Pagó");
});
