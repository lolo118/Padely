// node --test functions/rollup.test.js — el reporte diario cierra y el margen solo cuenta costos conocidos (P3-6b)
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { aporteDeVenta, reconciliar, sumarAporte, tipoLineaDe } = require("./rollup");

// Timestamp mínimo: hora local argentina (UTC−3) del 22/10/2026
const ts = (h, m = 0) => ({ toDate: () => new Date(Date.UTC(2026, 9, 22, h + 3, m)) });
const vacio = () => ({ ventas: {}, porMedio: {}, porCategoria: {}, porProducto: {}, porHora: {}, porCancha: {} });
const acumular = (aportes) => aportes.reduce((acc, a) => sumarAporte(acc, a), vacio());
const cerca = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.05, `${msg || ""} ${a} ≠ ${b}`);

// Venta de mostrador con descuento DE LÍNEA (Agua 2 × 1040 − 80) y una Cerveza; todas las líneas con costo
const ventaA = {
  numero: "D1-000001",
  creadoEn: ts(20, 5),
  items: [
    { productoId: "agua", nombre: "Agua", precio: 1040, cantidad: 2, descuento: 80, subtotal: 2000, costo: 500, categoriaId: "beb", tipoLinea: "consumo" },
    { productoId: "cerveza", nombre: "Cerveza", precio: 3020, cantidad: 1, descuento: 0, subtotal: 3020, costo: 1500, categoriaId: "beb", tipoLinea: "consumo" },
  ],
  subtotal: 5020,
  descuento: null,
  descuentoTotal: 80,
  total: 5020,
  pagos: [{ medio: "efectivo", monto: 5020, entregado: 6000 }],
  estado: "ok",
};
// Venta de mostrador con descuento GENERAL del 10 %; el Alfajor no tiene costo ni categoría (la categoría se lee)
const ventaB = {
  numero: "D1-000002",
  creadoEn: ts(20, 40),
  items: [
    { productoId: "alfajor", nombre: "Alfajor", precio: 1500, cantidad: 1, descuento: 0, subtotal: 1500, costo: null, categoriaId: null },
    { productoId: "agua", nombre: "Agua", precio: 1040, cantidad: 1, descuento: 0, subtotal: 1040, costo: 500, categoriaId: "beb" },
  ],
  subtotal: 2540,
  descuento: { tipo: "porcentaje", valor: 10, monto: 254 },
  descuentoTotal: 254,
  total: 2286,
  pagos: [{ medio: "tarjeta", monto: 2286 }],
  estado: "ok",
};
// Cuenta del turno dividida en 3 partes iguales: 2 Cervezas (3020) + 1 Agua (1040) = 7080 de consumos, cancha
// 15.000 con seña 4.500 ya pagada. Las líneas son las que arma lineasDeVentaParaParte (costo proporcional).
const cuenta = { canchaId: "c1", canchaNombre: "Cancha 1" };
const parte = (numero, cerveza, costoCerveza, agua, costoAgua, minuto) => ({
  numero,
  creadoEn: ts(21, minuto),
  cuentaId: "g1",
  items: [
    { productoId: "cerveza", nombre: "Cerveza (1/3)", precio: cerveza, cantidad: 1, descuento: 0, subtotal: cerveza, costo: costoCerveza, categoriaId: "beb", tipoLinea: "consumo" },
    { productoId: "agua", nombre: "Agua (1/3)", precio: agua, cantidad: 1, descuento: 0, subtotal: agua, costo: costoAgua, categoriaId: "beb", tipoLinea: "consumo" },
    { productoId: null, nombre: "Cancha 1 · 20:00–21:00 (1/3)", precio: 5000, cantidad: 1, descuento: 0, subtotal: 5000, tipoLinea: "cancha", costo: null },
    { productoId: null, nombre: "Seña pagada (1/3)", precio: -1500, cantidad: 1, descuento: 0, subtotal: -1500, tipoLinea: "seña", costo: null },
  ],
  subtotal: 5860,
  descuento: null,
  descuentoTotal: 0,
  total: 5860,
  pagos: [{ medio: "efectivo", monto: 5860 }],
  estado: "ok",
});
const partes = [parte("D1-000003", 2020, 1003.31, 340, 163.46, 0), parte("D1-000004", 2010, 998.34, 350, 168.27, 1), parte("D1-000005", 2010, 998.34, 350, 168.27, 2)];
// Cancha cobrada en el mostrador sin cuenta del turno (línea vieja sin tipoLinea: se infiere cancha)
const ventaC = { numero: "D1-000006", creadoEn: ts(22), items: [{ productoId: null, nombre: "Cancha 2 · 22:00", precio: 12000, cantidad: 1, subtotal: 12000 }], subtotal: 12000, total: 12000, pagos: [{ medio: "qr", monto: 12000 }], estado: "ok" };
const categorias = { alfajor: "kiosco" };

test("tipo de línea", () => {
  assert.equal(tipoLineaDe({ tipoLinea: "seña" }), "seña");
  assert.equal(tipoLineaDe({ productoId: "a" }), "consumo");
  assert.equal(tipoLineaDe({ subtotal: -100 }), "seña");
  assert.equal(tipoLineaDe({ subtotal: 100 }), "cancha");
});

test("M4: el día cierra — Σ productos + Σ canchas + otros − descuentos == total (con descuentos de línea, general, división en 3 y una anulación)", () => {
  const dia = acumular([
    aporteDeVenta(ventaA, { signo: 1 }),
    aporteDeVenta(ventaB, { categorias, signo: 1 }),
    ...partes.map((v) => aporteDeVenta(v, { cuenta, signo: 1 })),
    aporteDeVenta(ventaC, { signo: 1 }),
    aporteDeVenta({ ...ventaA, estado: "anulada" }, { signo: -1 }), // anulación de A
  ]);
  assert.equal(dia.ventas.cantidad, 6);
  assert.equal(dia.ventas.anuladas, 1);
  assert.equal(dia.ventas.totalAnulado, 5020);
  assert.equal(dia.ventas.total, 5020 + 2286 + 3 * 5860 + 12000 - 5020); // 31.866, neto de la anulación
  assert.equal(dia.ventas.descuentos, 254); // el descuento general de B, en su propio cubo
  assert.equal(dia.ventas.otros, 12000); // la cancha cobrada sin cuenta
  assert.equal(dia.porCancha.c1.total, 3 * (5000 - 1500));
  assert.equal(dia.porCancha.c1.consumos, 7080);
  assert.equal(dia.porCancha.c1.cobros, 3);
  assert.equal(dia.porProducto.agua.total, 2000 + 1040 + 340 + 350 + 350 - 2000);
  assert.equal(dia.porProducto.agua.cantidad, 2 + 1 + 3 - 2);
  assert.equal(dia.porProducto.cerveza.total, 3020 + 2020 + 2010 + 2010 - 3020);
  assert.equal(dia.porProducto.alfajor.total, 1500);
  assert.equal(dia.porCategoria.kiosco.total, 1500); // categoría leída del producto
  assert.deepEqual(dia.porMedio, { efectivo: 5020 + 3 * 5860 - 5020, tarjeta: 2286, qr: 12000 });
  assert.equal(dia.porHora["20"].cantidad, 1); // A sumó y restó; queda B
  assert.equal(dia.porHora["21"].cantidad, 3);
  const r = reconciliar(dia);
  assert.equal(r.diferencia, 0, `cubos ${r.cubos} vs total ${r.total}`);
  assert.equal(r.cubos, 31866);
});

test("el descuento general no toca los productos (Top 10 honesto) y una venta de cuenta no tiene descuentos", () => {
  const b = aporteDeVenta(ventaB, { categorias });
  assert.equal(b.porProducto.alfajor.total, 1500);
  assert.equal(b.porProducto.agua.total, 1040);
  assert.equal(b.ventas.descuentos, 254);
  assert.equal(aporteDeVenta(ventaA).ventas.descuentos, undefined); // el descuento de línea ya está neto en el subtotal
  assert.equal(aporteDeVenta(partes[0], { cuenta }).ventas.descuentos, undefined);
  assert.equal(aporteDeVenta(partes[0], { cuenta }).ventas.otros, undefined);
});

test("margen: todas las líneas con costo", () => {
  const a = aporteDeVenta(ventaA);
  assert.equal(a.ventas.totalConCosto, 5020);
  assert.equal(a.ventas.lineasSinCosto, undefined);
  assert.equal(a.ventas.lineasCostoEstimado, undefined);
  assert.equal(a.porCategoria.beb.costo, 2 * 500 + 1500);
  assert.equal(a.porCategoria.beb.totalConCosto, 5020);
  assert.equal(a.porProducto.agua.totalConCosto, 2000);
  assert.equal(a.porProducto.agua.costo, 1000);
  assert.equal(a.ventas.totalConCosto - a.porCategoria.beb.costo, 2520); // margen
});

test("margen: líneas mixtas — la que no tiene costo queda fuera", () => {
  const b = aporteDeVenta(ventaB, { categorias });
  assert.equal(b.ventas.totalConCosto, 1040);
  assert.equal(b.ventas.lineasSinCosto, 1);
  assert.equal(b.porProducto.alfajor.totalConCosto, 0); // → "—" en el Top 10
  assert.equal(b.porProducto.alfajor.costo, 0);
  assert.equal(b.porProducto.agua.totalConCosto, 1040);
  assert.equal(b.porCategoria.beb.totalConCosto - b.porCategoria.beb.costo, 540);
});

test("margen: ninguna línea con costo", () => {
  const solo = aporteDeVenta({ ...ventaB, items: [ventaB.items[0]], subtotal: 1500, descuento: null, descuentoTotal: 0, total: 1500 }, { categorias });
  assert.equal(solo.ventas.totalConCosto, undefined);
  assert.equal(solo.ventas.lineasSinCosto, 1);
  assert.equal(solo.porProducto.alfajor.totalConCosto, 0);
});

test("margen: recálculo con costos estimados — la línea sin costo toma el costo actual del producto", () => {
  const b = aporteDeVenta(ventaB, { categorias, costosActuales: { alfajor: 600, agua: 999 } });
  assert.equal(b.ventas.totalConCosto, 2540);
  assert.equal(b.ventas.lineasCostoEstimado, 1);
  assert.equal(b.ventas.lineasSinCosto, undefined);
  assert.equal(b.porProducto.alfajor.costo, 600);
  assert.equal(b.porProducto.alfajor.totalConCosto, 1500);
  assert.equal(b.porProducto.agua.costo, 500); // el costo guardado en la línea manda sobre el actual
  // Un producto sin costo tampoco en el catálogo: sigue sin costo
  const sin = aporteDeVenta(ventaB, { categorias, costosActuales: { agua: 500 } });
  assert.equal(sin.ventas.lineasSinCosto, 1);
  assert.equal(sin.ventas.lineasCostoEstimado, undefined);
});

test("margen: la anulación de una venta con costo resta lo mismo que sumó", () => {
  const dia = acumular([aporteDeVenta(ventaA), aporteDeVenta(ventaB, { categorias }), aporteDeVenta({ ...ventaA, estado: "anulada" }, { signo: -1 })]);
  assert.equal(dia.ventas.totalConCosto, 1040);
  assert.equal(dia.ventas.lineasSinCosto, 1);
  assert.equal(dia.porProducto.cerveza.total, 0);
  assert.equal(dia.porProducto.cerveza.costo, 0);
  assert.equal(dia.porProducto.cerveza.totalConCosto, 0);
  assert.equal(dia.porProducto.agua.totalConCosto, 1040);
  assert.equal(dia.porCategoria.beb.costo, 500);
  assert.equal(dia.ventas.anuladas, 1);
  assert.equal(dia.ventas.total, 2286);
  assert.equal(reconciliar(dia).diferencia, 0);
});

test("margen de las partes de una cuenta: costos proporcionales", () => {
  const dia = acumular(partes.map((v) => aporteDeVenta(v, { cuenta })));
  assert.equal(dia.ventas.totalConCosto, 7080);
  cerca(dia.porProducto.cerveza.costo, 3000, "costo cerveza");
  cerca(dia.porProducto.agua.costo, 500, "costo agua");
  assert.equal(dia.porProducto.cerveza.totalConCosto, 6040);
  assert.equal(dia.ventas.lineasSinCosto, undefined);
});

test("M3 (P3-8b): la seña cobrada online (venta MP con línea seña) y la venta de la cuenta con su 'Seña pagada' cierran el día", () => {
  const señaOnline = { numero: "MP-000003", creadoEn: ts(10), cuentaId: null, reservaId: "r1", items: [{ productoId: null, nombre: "Seña · Cancha 1 · lun 26 oct 19:00", precio: 6000, cantidad: 1, descuento: 0, subtotal: 6000, tipoLinea: "seña", costo: null }], subtotal: 6000, total: 6000, pagos: [{ medio: "mercadopago", monto: 6000 }], estado: "ok" };
  const ventaCuenta = { numero: "D1-000010", creadoEn: ts(21), cuentaId: "g2", items: [{ productoId: null, nombre: "Cancha 1 · 19:00–21:00", precio: 20000, cantidad: 1, descuento: 0, subtotal: 20000, tipoLinea: "cancha", costo: null }, { productoId: null, nombre: "Seña pagada", precio: -6000, cantidad: 1, descuento: 0, subtotal: -6000, tipoLinea: "seña", costo: null }], subtotal: 14000, total: 14000, pagos: [{ medio: "efectivo", monto: 14000 }], estado: "ok" };
  const dia = acumular([aporteDeVenta(señaOnline), aporteDeVenta(ventaCuenta, { cuenta: { canchaId: "c1", canchaNombre: "Cancha 1" } })]);
  assert.equal(dia.ventas.total, 20000); // lo que entró en total: 6.000 online + 14.000 en el mostrador
  assert.equal(dia.ventas.otros, 6000); // la seña online no tiene cuenta todavía: va a "otros"
  assert.equal(dia.porCancha.c1.total, 14000); // la cancha neta de la seña
  assert.equal(dia.porMedio.mercadopago, 6000);
  assert.equal(dia.porMedio.efectivo, 14000);
  assert.deepEqual(reconciliar(dia), { cubos: 20000, total: 20000, diferencia: 0 });
  // Devolver la seña (anular su venta) resta exactamente lo que sumó
  const conAnulacion = acumular([aporteDeVenta(señaOnline), aporteDeVenta(señaOnline, { signo: -1 })]);
  assert.equal(conAnulacion.ventas.total, 0);
  assert.equal(conAnulacion.ventas.otros, 0);
  assert.equal(conAnulacion.porMedio.mercadopago, 0);
});
