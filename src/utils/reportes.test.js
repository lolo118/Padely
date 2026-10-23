// node --test src/utils/reportes.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { aCsv, diasEntre, filasExportacion, indicadores, margenDe, nombreArchivo, porCanchaLista, porCategoriaConParticipacion, porMedioLista, rangoDePeriodo, seriePorDia, seriePorHora, sumarRollups, tipoLineaDe, topProductos } from "./reportes.js";

test("rango del período", () => {
  // 2026-10-22 es jueves
  assert.deepEqual(rangoDePeriodo("hoy", "2026-10-22"), { desde: "2026-10-22", hasta: "2026-10-22" });
  assert.deepEqual(rangoDePeriodo("ayer", "2026-10-22"), { desde: "2026-10-21", hasta: "2026-10-21" });
  assert.deepEqual(rangoDePeriodo("semana", "2026-10-22"), { desde: "2026-10-19", hasta: "2026-10-22" });
  assert.deepEqual(rangoDePeriodo("semana", "2026-10-25"), { desde: "2026-10-19", hasta: "2026-10-25" }); // domingo
  assert.deepEqual(rangoDePeriodo("mes", "2026-10-22"), { desde: "2026-10-01", hasta: "2026-10-22" });
  assert.deepEqual(rangoDePeriodo("rango", "2026-10-22", { desde: "2026-10-20", hasta: "2026-10-10" }), { desde: "2026-10-10", hasta: "2026-10-20" });
  assert.deepEqual(rangoDePeriodo("rango", "2026-10-22", { desde: "mal" }), { desde: "2026-10-22", hasta: "2026-10-22" });
  assert.deepEqual(diasEntre("2026-10-30", "2026-11-02"), ["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  assert.deepEqual(diasEntre("2026-10-22", "2026-10-21"), []);
});

const dia1 = {
  fecha: "2026-10-21",
  ventas: { cantidad: 3, total: 7000, anuladas: 1, totalAnulado: 1000, lineasSinCosto: 1, totalConCosto: 4000, descuentos: 300 },
  porMedio: { efectivo: 4000, tarjeta: 3000 },
  porCategoria: { bebidas: { cantidad: 4, total: 4000, costo: 2000, totalConCosto: 4000 }, sin: { cantidad: 1, total: 3000, costo: 0, totalConCosto: 0 } },
  porProducto: { agua: { nombre: "Agua", cantidad: 3, total: 3000, costo: 1500, totalConCosto: 3000 }, cerveza: { nombre: "Cerveza", cantidad: 1, total: 1000, costo: 500, totalConCosto: 1000 } },
  porHora: { 20: { cantidad: 2, total: 5000 }, 21: { cantidad: 1, total: 2000 } },
  porCancha: { k1: { nombre: "Cancha 1", total: 10000, consumos: 3000, cobros: 2, cuentas: 1 } },
  cajas: { cierres: [{ cajaId: "c1", dispositivo: "Caja 1", esperadoEfectivo: 9000, efectivoContado: 9000, diferencia: 0 }] },
};
const dia2 = {
  fecha: "2026-10-22",
  ventas: { cantidad: 2, total: 5000, anuladas: 0, totalAnulado: 0, lineasSinCosto: 1, totalConCosto: 2000 },
  porMedio: { efectivo: 1000, qr: 4000 },
  porCategoria: { bebidas: { cantidad: 2, total: 2000, costo: 800, totalConCosto: 2000 } },
  porProducto: { agua: { nombre: "Agua", cantidad: 2, total: 2000, costo: 800, totalConCosto: 2000 }, alfajor: { nombre: "Alfajor", cantidad: 1, total: 3000, costo: 0, totalConCosto: 0 } },
  porHora: { 20: { cantidad: 2, total: 5000 } },
  porCancha: {},
};

test("suma de rollups e indicadores", () => {
  const t = sumarRollups([dia1, dia2, null]);
  assert.equal(t.ventas.cantidad, 5);
  assert.equal(t.ventas.total, 12000);
  assert.equal(t.ventas.anuladas, 1);
  assert.deepEqual(t.porMedio, { efectivo: 5000, transferencia: 0, tarjeta: 3000, qr: 4000 });
  assert.equal(t.porProducto.agua.cantidad, 5);
  assert.equal(t.porProducto.agua.total, 5000);
  assert.equal(t.porHora["20"].total, 10000);
  assert.equal(t.porCancha.k1.cuentas, 1);
  assert.equal(t.cierres.length, 1);
  assert.equal(t.cierres[0].fecha, "2026-10-21");
  assert.deepEqual(t.porDia["2026-10-21"], { cantidad: 2, total: 7000 });
  const i = indicadores(t);
  assert.equal(i.ventas, 4); // 5 − 1 anulada
  assert.equal(i.total, 12000);
  assert.equal(i.ticketPromedio, 3000);
  assert.equal(i.margen, 6000 - 2800); // solo las líneas con costo: totalConCosto (4000+2000) − costo (2000+0+800)
  assert.equal(i.margenParcial, true);
  assert.equal(i.margenEstimado, false);
  assert.equal(i.descuentos, 300);
  assert.equal(i.anuladas, 1);
  assert.equal(indicadores(sumarRollups([dia2])).margenParcial, true);
  assert.equal(indicadores(sumarRollups([])).ticketPromedio, 0);
  assert.equal(indicadores(sumarRollups([])).margen, null);
});

test("top productos, categorías, medios, canchas y series", () => {
  const t = sumarRollups([dia1, dia2]);
  const top = topProductos(t, 2);
  assert.deepEqual(top.map((p) => p.nombre), ["Agua", "Alfajor"]);
  assert.equal(top[0].margen, 5000 - 2300);
  assert.equal(top[1].margen, null); // el Alfajor no tiene costo: "—", nunca sus 3000 completos
  const cats = porCategoriaConParticipacion(t, { bebidas: "Bebidas" });
  assert.equal(cats[0].nombre, "Bebidas");
  assert.equal(cats[0].participacion, 67); // 6000 de 9000
  assert.equal(cats[1].nombre, "Sin categoría");
  assert.deepEqual(porMedioLista(t).map((m) => m.medio), ["efectivo", "tarjeta", "qr"]);
  const canchas = porCanchaLista(t);
  assert.equal(canchas[0].nombre, "Cancha 1");
  assert.equal(canchas[0].cuentas, 1);
  const horas = seriePorHora(t);
  assert.equal(horas[0].name, "08 h");
  assert.equal(horas.find((h) => h.name === "20 h").total, 10000);
  const dias = seriePorDia(t, "2026-10-20", "2026-10-22");
  assert.equal(dias.length, 3);
  assert.deepEqual(dias.map((d) => d.total), [0, 7000, 5000]);
  assert.equal(dias[1].name, "21/10");
});

// Rollups tal como los escribe functions/rollup.js (sus pruebas cubren la agregación; acá, lo que se muestra)
const conCosto = { fecha: "2026-10-22", ventas: { cantidad: 1, total: 5020, totalConCosto: 5020 }, porCategoria: { beb: { cantidad: 3, total: 5020, costo: 2500, totalConCosto: 5020 } }, porProducto: { agua: { nombre: "Agua", cantidad: 2, total: 2000, costo: 1000, totalConCosto: 2000 }, cerveza: { nombre: "Cerveza", cantidad: 1, total: 3020, costo: 1500, totalConCosto: 3020 } } };
const mixta = { fecha: "2026-10-22", ventas: { cantidad: 1, total: 2286, totalConCosto: 1040, lineasSinCosto: 1, descuentos: 254 }, porCategoria: { beb: { cantidad: 1, total: 1040, costo: 500, totalConCosto: 1040 }, kiosco: { cantidad: 1, total: 1500, costo: 0, totalConCosto: 0 } }, porProducto: { agua: { nombre: "Agua", cantidad: 1, total: 1040, costo: 500, totalConCosto: 1040 }, alfajor: { nombre: "Alfajor", cantidad: 1, total: 1500, costo: 0, totalConCosto: 0 } } };
const sinCosto = { fecha: "2026-10-22", ventas: { cantidad: 1, total: 1500, lineasSinCosto: 1 }, porCategoria: { kiosco: { cantidad: 1, total: 1500, costo: 0, totalConCosto: 0 } }, porProducto: { alfajor: { nombre: "Alfajor", cantidad: 1, total: 1500, costo: 0, totalConCosto: 0 } } };
const estimada = { fecha: "2026-10-22", ventas: { cantidad: 1, total: 2286, totalConCosto: 2540, lineasCostoEstimado: 1, descuentos: 254 }, porCategoria: { beb: { cantidad: 1, total: 1040, costo: 500, totalConCosto: 1040 }, kiosco: { cantidad: 1, total: 1500, costo: 600, totalConCosto: 1500 } }, porProducto: { agua: { nombre: "Agua", cantidad: 1, total: 1040, costo: 500, totalConCosto: 1040 }, alfajor: { nombre: "Alfajor", cantidad: 1, total: 1500, costo: 600, totalConCosto: 1500 } } };
const anulada = { fecha: "2026-10-22", ventas: { total: -5020, anuladas: 1, totalAnulado: 5020, totalConCosto: -5020 }, porCategoria: { beb: { cantidad: -3, total: -5020, costo: -2500, totalConCosto: -5020 } }, porProducto: { agua: { nombre: "Agua", cantidad: -2, total: -2000, costo: -1000, totalConCosto: -2000 }, cerveza: { nombre: "Cerveza", cantidad: -1, total: -3020, costo: -1500, totalConCosto: -3020 } } };

test("margen solo sobre costos conocidos: todas con costo, mixtas, ninguna, estimadas y una anulación", () => {
  const todas = indicadores(sumarRollups([conCosto]));
  assert.equal(todas.margen, 5020 - 2500);
  assert.equal(todas.margenParcial, false);
  assert.equal(todas.margenEstimado, false);
  assert.equal(todas.descuentos, 0);

  const mix = indicadores(sumarRollups([mixta]));
  assert.equal(mix.margen, 1040 - 500); // el Alfajor (sin costo) queda fuera, no entra a precio completo
  assert.equal(mix.margenParcial, true);
  assert.equal(mix.descuentos, 254);
  const topMix = topProductos(sumarRollups([mixta]));
  assert.equal(topMix.find((p) => p.nombre === "Alfajor").margen, null);
  assert.equal(topMix.find((p) => p.nombre === "Agua").margen, 540);
  assert.equal(porCategoriaConParticipacion(sumarRollups([mixta]), { beb: "Bebidas", kiosco: "Kiosco" }).find((c) => c.nombre === "Kiosco").margen, null);

  const ninguna = indicadores(sumarRollups([sinCosto]));
  assert.equal(ninguna.margen, null);
  assert.equal(ninguna.margenParcial, true);

  const est = indicadores(sumarRollups([estimada]));
  assert.equal(est.margen, 2540 - 1100);
  assert.equal(est.margenEstimado, true);
  assert.equal(est.margenParcial, false);

  // La anulación de la venta con costo deja solo la mixta
  const trasAnular = indicadores(sumarRollups([conCosto, mixta, anulada]));
  assert.equal(trasAnular.margen, 540);
  assert.equal(trasAnular.ventas, 1);
  assert.equal(trasAnular.total, 2286);
  assert.equal(trasAnular.anuladas, 1);
  assert.equal(topProductos(sumarRollups([conCosto, anulada])).length, 0); // nada vendido: sin filas
  assert.equal(indicadores(sumarRollups([conCosto, anulada])).margen, null);

  // Un rollup anterior a P3-6b (sin totalConCosto) no muestra un margen inventado
  assert.equal(margenDe({ total: 7240, costo: 0 }), null);
  assert.equal(margenDe({ totalConCosto: 0, costo: 650 }), null);
});

test("tipo de línea, filas de exportación y CSV es-AR", () => {
  assert.equal(tipoLineaDe({ tipoLinea: "cancha" }), "cancha");
  assert.equal(tipoLineaDe({ productoId: "a" }), "consumo");
  assert.equal(tipoLineaDe({ productoId: null, subtotal: -3000 }), "seña");
  assert.equal(tipoLineaDe({ productoId: null, subtotal: 10000 }), "cancha");
  const ventas = [
    {
      numero: "D1-000001",
      creadoEn: new Date(2026, 9, 22, 20, 5),
      dispositivo: "Caja 1",
      creadoPorNombre: "Club Test",
      cliente: { nombre: "Gómez" },
      subtotal: 4000,
      descuentoTotal: 200,
      total: 3800,
      estado: "ok",
      cuentaId: "g1",
      items: [
        { nombre: "Agua; fría", precio: 1040, cantidad: 2, subtotal: 2080, costo: 500, productoId: "a", categoriaId: "beb" },
        { nombre: "Cancha 1", precio: 10000, cantidad: 1, subtotal: 10000, tipoLinea: "cancha" },
      ],
      pagos: [{ medio: "efectivo", monto: 3800, ref: null }],
    },
  ];
  const f = filasExportacion(ventas, { beb: "Bebidas" });
  assert.equal(f.ventas.length, 2);
  assert.deepEqual(f.ventas[1].slice(0, 6), ["D1-000001", "22/10/2026", "20:05", "Caja 1", "Club Test", "Gómez"]);
  assert.equal(f.ventas[1][9], "Ok");
  assert.equal(f.items.length, 3);
  assert.deepEqual(f.items[1], ["D1-000001", "Agua; fría", "Bebidas", 2, 1040, 2080, 1000, "consumo"]);
  assert.deepEqual(f.items[2].slice(1, 3), ["Cancha 1", "Cancha"]);
  assert.deepEqual(f.medios[1], ["D1-000001", "efectivo", 3800, ""]);
  const csv = aCsv([["a", "b;c", 1.5], ['x"y', "", 2]]);
  assert.equal(csv, '﻿a;"b;c";1,5\r\n"x""y";;2');
  assert.equal(nombreArchivo("Club Pádel Ñandú", "2026-10-01", "2026-10-22", "xlsx"), "padely-ventas-club-padel-nandu-2026-10-01-2026-10-22.xlsx");
});
