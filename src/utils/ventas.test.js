// node --test src/utils/ventas.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bloqueAgotado,
  bloqueNecesitaReserva,
  calcularLinea,
  calcularPagos,
  calcularTotales,
  formatearNumero,
  numerosLibres,
  resolverDescuento,
  siguienteNumero,
  telefonoWhatsApp,
  textoTicketWhatsApp,
  unirBloques,
} from "./ventas.js";

test("línea: bruto, descuento acotado y subtotal", () => {
  const l = calcularLinea({ precio: 1500, cantidad: 2, descuento: 300 });
  assert.equal(l.bruto, 3000);
  assert.equal(l.descuento, 300);
  assert.equal(l.subtotal, 2700);
  assert.equal(calcularLinea({ precio: 1500, cantidad: 1, descuento: 99999 }).subtotal, 0);
  assert.equal(calcularLinea({ precio: 1500, cantidad: 0 }).subtotal, 0);
});

test("descuento por porcentaje y por monto, con tope", () => {
  assert.deepEqual(resolverDescuento("porcentaje", 10, 2000, 100), { tipo: "porcentaje", valor: 10, monto: 200, excedido: false });
  assert.equal(resolverDescuento("monto", 500, 2000).monto, 500);
  assert.equal(resolverDescuento("monto", 5000, 2000).monto, 2000);
  assert.equal(resolverDescuento("porcentaje", 15, 2000, 10).excedido, true);
  assert.equal(resolverDescuento("porcentaje", 10, 2000, 10).excedido, false);
  assert.equal(resolverDescuento("porcentaje", 0, 2000).monto, 0);
});

test("totales del ticket con descuentos de línea y general", () => {
  const items = [
    { productoId: "a", nombre: "Agua", precio: 1500, cantidad: 2, descuento: 0 },
    { productoId: "b", nombre: "Alfajor", precio: 1100, cantidad: 1, descuento: 110 },
  ];
  const t = calcularTotales(items, { tipo: "monto", valor: 200 }, 100);
  assert.equal(t.bruto, 4100);
  assert.equal(t.descuentoLineas, 110);
  assert.equal(t.subtotal, 3990);
  assert.equal(t.descuento.monto, 200);
  assert.equal(t.descuentoTotal, 310);
  assert.equal(t.total, 3790);
  assert.equal(t.excedido, false);
  // Un cajero con 10 %: 310 de 4100 es 7,6 % → ok; con 20 % general ya no
  assert.equal(calcularTotales(items, { tipo: "monto", valor: 200 }, 10).excedido, false);
  assert.equal(calcularTotales(items, { tipo: "porcentaje", valor: 20 }, 10).excedido, true);
  assert.equal(calcularTotales([], null).total, 0);
  assert.equal(calcularTotales(items, null).descuento, null);
});

test("pagos: efectivo con vuelto, mixto, falta y excedente", () => {
  let p = calcularPagos([{ medio: "efectivo", monto: 10000 }], 3790);
  assert.equal(p.pagado, 3790);
  assert.equal(p.vuelto, 6210);
  assert.equal(p.falta, 0);
  assert.equal(p.valido, true);
  assert.deepEqual(p.pagos, [{ medio: "efectivo", monto: 3790, entregado: 10000, ref: null }]);

  p = calcularPagos([{ medio: "tarjeta", monto: 3000, ref: "1234" }, { medio: "efectivo", monto: 1000 }], 3790);
  assert.equal(p.pagado, 3790);
  assert.equal(p.vuelto, 210);
  assert.equal(p.pagos[0].ref, "1234");
  assert.equal(p.pagos[1].monto, 790);
  assert.equal(p.valido, true);

  p = calcularPagos([{ medio: "qr", monto: 1000 }], 3790);
  assert.equal(p.falta, 2790);
  assert.equal(p.valido, false);

  p = calcularPagos([{ medio: "tarjeta", monto: 5000 }], 3790);
  assert.equal(p.excedente, 1210);
  assert.equal(p.valido, false);

  p = calcularPagos([], 0);
  assert.equal(p.valido, true);
  assert.equal(p.pagado, 0);

  p = calcularPagos([{ medio: "efectivo", monto: 0 }], 100);
  assert.equal(p.valido, false);
});

test("numeración por bloques", () => {
  assert.equal(formatearNumero("D1", 123), "D1-000123");
  assert.equal(formatearNumero("D12", 1), "D12-000001");
  assert.equal(bloqueAgotado(null), true);
  const b = { codigo: "D1", desde: 1, hasta: 100, proximo: 1 };
  assert.equal(numerosLibres(b), 100);
  assert.equal(bloqueNecesitaReserva(b), false);
  const s = siguienteNumero(b);
  assert.equal(s.numero, "D1-000001");
  assert.equal(s.bloque.proximo, 2);
  const casi = { codigo: "D1", desde: 1, hasta: 100, proximo: 92 };
  assert.equal(numerosLibres(casi), 9);
  assert.equal(bloqueNecesitaReserva(casi), true);
  const fin = { codigo: "D1", desde: 1, hasta: 100, proximo: 101 };
  assert.equal(bloqueAgotado(fin), true);
  assert.equal(siguienteNumero(fin), null);
  assert.equal(bloqueNecesitaReserva(null), true);
});

test("un bloque contiguo se suma al actual; uno salteado lo reemplaza", () => {
  const actual = { codigo: "D1", desde: 1, hasta: 100, proximo: 95 };
  const unido = unirBloques(actual, { codigo: "D1", desde: 101, hasta: 200 });
  assert.deepEqual(unido, { codigo: "D1", desde: 1, hasta: 200, proximo: 95 });
  const nuevo = unirBloques(null, { codigo: "D2", desde: 1, hasta: 100 });
  assert.deepEqual(nuevo, { codigo: "D2", desde: 1, hasta: 100, proximo: 1 });
  const salto = unirBloques({ codigo: "D1", desde: 1, hasta: 100, proximo: 101 }, { codigo: "D1", desde: 201, hasta: 300 });
  assert.equal(salto.proximo, 201);
});

test("texto de WhatsApp y teléfono", () => {
  const venta = {
    numero: "D1-000001",
    estado: "ok",
    items: [{ nombre: "Agua", cantidad: 2, subtotal: 3000, descuento: 0 }],
    subtotal: 3000,
    descuento: null,
    total: 3000,
    pagos: [{ medio: "efectivo", monto: 3000, entregado: 5000 }],
    vuelto: 2000,
  };
  const texto = textoTicketWhatsApp(venta, { nombre: "Club Padely Central", ticket: { alias: "padely.central.mp" } });
  assert.match(texto, /Ticket D1-000001/);
  assert.match(texto, /2 x Agua — \$ 3\.000/);
  assert.match(texto, /TOTAL: \$ 3\.000/);
  assert.match(texto, /Efectivo: \$ 5\.000 \(vuelto \$ 2\.000\)/);
  assert.match(texto, /Transferencias: padely\.central\.mp/);
  assert.match(texto, /Gracias por venir/);
  assert.equal(telefonoWhatsApp("385 444-5555"), "5493854445555");
  assert.equal(telefonoWhatsApp("15 444-5555"), "5494445555");
  assert.equal(telefonoWhatsApp("+54 9 385 444 5555"), "5493854445555");
  assert.equal(telefonoWhatsApp("0385 4445555"), "5493854445555");
  assert.equal(telefonoWhatsApp(""), "");
});
