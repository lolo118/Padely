// node --test src/utils/importacion.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  analizarImportacion,
  armarPlan,
  autoMapear,
  campoDeEncabezado,
  columnasComoTexto,
  detectarDelimitador,
  detectarFilaEncabezado,
  encabezadosDe,
  parsearFilas,
  textoCodigo,
} from "./importacion.js";
import { ENCABEZADOS_PLANTILLA } from "./plantillaProductos.js";

const proveedor = [
  ["Distribuidora El Pique S.R.L. — Lista de precios"],
  ["Vigencia: octubre 2026 · Precios con IVA"],
  ["Cód.", "Descripción", "P. Lista", "Cant."],
  ["B001", "Agua mineral 500 ml", "$ 650,00", 48],
  ["B003", "Gaseosa cola 500 ml", "$ 1.250,00", 36],
  ["", "", "", ""],
  ["B003", "Gaseosa cola (repetida)", "$ 1.300,00", 10],
  ["S006", "Galletitas dulces 150 g", "", 24],
  ["S007", "", "$ 100,00", 1],
];

test("encabezados conocidos, sin acentos ni puntos", () => {
  assert.equal(campoDeEncabezado("Cód."), "sku");
  assert.equal(campoDeEncabezado(" DESCRIPCIÓN "), "nombre");
  assert.equal(campoDeEncabezado("P. Lista"), "costo");
  assert.equal(campoDeEncabezado("Cant."), "stock");
  assert.equal(campoDeEncabezado("Código de barras"), "codigoBarras");
  assert.equal(campoDeEncabezado("PVP"), "precio");
  assert.equal(campoDeEncabezado("Rubro"), "categoria");
  assert.equal(campoDeEncabezado("Vigencia: octubre 2026"), null);
});

test("detecta la fila de encabezado después de los títulos", () => {
  assert.equal(detectarFilaEncabezado(proveedor), 2);
  assert.equal(detectarFilaEncabezado([["hola"], ["chau"]]), 0);
});

test("la plantilla mapea sola todas las columnas", () => {
  const filas = [ENCABEZADOS_PLANTILLA, ["Agua", "Bebidas", 1500, 800, "AG500", "7790001000011", 24, 6, "u"]];
  assert.equal(detectarFilaEncabezado(filas), 0);
  const mapeo = autoMapear(encabezadosDe(filas, 0));
  assert.deepEqual(mapeo, { nombre: 0, categoria: 1, precio: 2, costo: 3, sku: 4, codigoBarras: 5, stock: 6, stockMinimo: 7, unidad: 8 });
});

test("el mapeo guardado del proveedor tiene prioridad (por texto)", () => {
  const enc = encabezadosDe([["Código", "Artículo", "Precio", "Costo"]], 0);
  const mapeo = autoMapear(enc, { nombre: "Artículo", precio: "Costo", costo: "Precio" });
  assert.equal(mapeo.precio, 3);
  assert.equal(mapeo.costo, 2);
  assert.equal(mapeo.sku, 0);
  assert.equal(columnasComoTexto(mapeo, enc).precio, "Costo");
});

test("códigos como texto y delimitador de CSV", () => {
  assert.equal(textoCodigo(7790001000011), "7790001000011");
  assert.equal(textoCodigo("123.0"), "123");
  assert.equal(detectarDelimitador("Nombre;Precio\nAgua;1.500,00"), ";");
  assert.equal(detectarDelimitador("Nombre,Precio\nAgua,1500"), ",");
});

test("filas, coincidencias, duplicadas y errores", () => {
  const fe = detectarFilaEncabezado(proveedor);
  const mapeo = autoMapear(encabezadosDe(proveedor, fe));
  const filas = parsearFilas(proveedor, fe, mapeo);
  assert.equal(filas.length, 5); // la fila vacía se omite
  assert.equal(filas[0].fila, 4);
  assert.equal(filas[0].costo, 650);

  const productos = [
    { id: "p1", nombre: "Agua Mineral 500 ml", nombreNorm: "agua mineral 500 ml", precio: 900, stock: 3, sku: null },
    { id: "p2", nombre: "Otra cosa", nombreNorm: "otra cosa", precio: 1000, stock: 0, sku: "B003" },
  ];
  const a = analizarImportacion(filas, productos, [], { usarMargen: true, multiplicador: 1.6 });
  // Agua: por nombre → precio 650 × 1,6 = 1040
  assert.equal(a.cambios.length, 2);
  assert.equal(a.cambios[0].producto.id, "p1");
  assert.equal(a.cambios[0].despues, 1040);
  assert.equal(a.cambios[0].variacion, 16);
  // B003: por SKU → p2 (2000), y su repetida queda como duplicada
  assert.equal(a.cambios[1].producto.id, "p2");
  assert.equal(a.cambios[1].despues, 2000);
  assert.equal(a.stock.length, 2);
  assert.deepEqual(
    a.errores.map((e) => [e.fila, e.motivo]),
    [
      [7, "Duplicada en el archivo"],
      [8, "Precio inválido"],
      [9, "Sin nombre"],
    ],
  );

  const sinMargen = analizarImportacion(filas, [], [], { usarMargen: false });
  assert.equal(sinMargen.nuevos.length, 0);
});

test("el plan respeta las acciones y la selección", () => {
  const filas = parsearFilas(
    [["Nombre", "Precio", "Stock", "Categoría"], ["Agua", 1500, 10, "bebidas"], ["Hielo", 500, 0, "Varios"]],
    0,
    { nombre: 0, precio: 1, stock: 2, categoria: 3, costo: null, sku: null, codigoBarras: null, stockMinimo: null, unidad: null },
  );
  const a = analizarImportacion(filas, [], [{ id: "c1", nombre: "Bebidas" }]);
  assert.equal(a.nuevos[0].categoriaId, "c1");
  assert.deepEqual(a.categoriasDesconocidas, ["Varios"]);
  const todo = armarPlan(a, new Set(a.nuevos.map((n) => n.clave)));
  assert.equal(todo.crear.length, 2);
  assert.equal(todo.movimientos.length, 1);
  const sinStock = armarPlan(a, new Set(a.nuevos.map((n) => n.clave)), { sumarStock: false });
  assert.equal(sinStock.movimientos.length, 0);
});
