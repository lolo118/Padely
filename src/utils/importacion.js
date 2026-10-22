// Importación de productos del bar desde una planilla (XLSX/XLS/CSV): helpers puros, sin Firebase ni React.
// Las filas llegan como arrays de celdas (sheet_to_json con header: 1). Los índices de fila son 0-based dentro del
// array; el número de fila de la planilla (1-based) se calcula con `filaBase` (la primera fila del rango de la hoja).

import { parsearNumero } from "./numeros.js";
import { normalizarNombre, precioDesdeCosto } from "./productos.js";

// Campos que se pueden mapear, en el orden en que se muestran
export const CAMPOS_IMPORTACION = [
  { campo: "nombre", label: "Nombre", requerido: true },
  { campo: "precio", label: "Precio" },
  { campo: "costo", label: "Costo" },
  { campo: "sku", label: "SKU" },
  { campo: "codigoBarras", label: "Código de barras" },
  { campo: "stock", label: "Stock" },
  { campo: "categoria", label: "Categoría" },
  { campo: "stockMinimo", label: "Stock mínimo", opcional: true },
  { campo: "unidad", label: "Unidad", opcional: true },
];

// Nombres conocidos de cada columna (ya normalizados con normalizarEncabezado)
const ALIAS = {
  nombre: ["nombre", "descripcion", "producto", "articulo", "nombre del producto", "detalle"],
  precio: ["precio", "p venta", "pvp", "precio venta", "precio de venta", "precio final", "precio al publico"],
  costo: ["costo", "p costo", "lista", "p lista", "precio lista", "precio de lista", "precio costo", "costo unitario"],
  sku: ["sku", "codigo", "cod", "codigo interno", "cod interno"],
  codigoBarras: ["barras", "ean", "codigo de barras", "cod de barras", "cod barras", "codigo barras", "ean13"],
  stock: ["stock", "cantidad", "cant", "existencia", "existencias"],
  categoria: ["categoria", "rubro", "familia"],
  stockMinimo: ["stock minimo", "stock min", "minimo"],
  unidad: ["unidad", "unidad de medida", "un"],
};

// "  Cód. " → "cod" · "P. Lista" → "p lista" · "Precio venta ($)" → "precio venta"
export function normalizarEncabezado(texto) {
  return normalizarNombre(texto)
    .replace(/\./g, "")
    .replace(/[^a-z0-9ñ ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// El campo que corresponde a un texto de encabezado, o null
export function campoDeEncabezado(texto) {
  const n = normalizarEncabezado(texto);
  if (!n) return null;
  for (const [campo, alias] of Object.entries(ALIAS)) if (alias.includes(n)) return campo;
  return null;
}

const celdaVacia = (v) => v === null || v === undefined || String(v).trim() === "";

// Primera fila (de las primeras `maxFilas`) con al menos 2 celdas que son encabezados conocidos; 0 si no hay
export function detectarFilaEncabezado(filas, maxFilas = 30) {
  const tope = Math.min(filas.length, maxFilas);
  for (let i = 0; i < tope; i++) {
    const fila = filas[i] || [];
    const conocidas = fila.filter((c) => !celdaVacia(c) && campoDeEncabezado(c)).length;
    if (conocidas >= 2) return i;
  }
  return 0;
}

// Encabezados de una fila como [{ indice, texto }] (texto vacío para las columnas sin título)
export function encabezadosDe(filas, filaEncabezado) {
  const fila = filas[filaEncabezado] || [];
  const ancho = Math.max(fila.length, ...filas.slice(filaEncabezado, filaEncabezado + 50).map((f) => (f || []).length), 0);
  return Array.from({ length: ancho }, (_, indice) => ({ indice, texto: String(fila[indice] ?? "").trim() }));
}

// Letra de columna de planilla: 0 → "A", 26 → "AA"
export function letraColumna(indice) {
  let n = indice + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// Mapeo automático { campo: índice de columna | null } a partir de los encabezados; cada columna se usa una sola vez
export function autoMapear(encabezados, columnasGuardadas = null) {
  const mapeo = Object.fromEntries(CAMPOS_IMPORTACION.map(({ campo }) => [campo, null]));
  const usadas = new Set();
  // 1) El mapeo guardado del proveedor (por texto de encabezado)
  if (columnasGuardadas) {
    for (const { campo } of CAMPOS_IMPORTACION) {
      const texto = normalizarEncabezado(columnasGuardadas[campo]);
      if (!texto) continue;
      const enc = encabezados.find((e) => !usadas.has(e.indice) && normalizarEncabezado(e.texto) === texto);
      if (enc) {
        mapeo[campo] = enc.indice;
        usadas.add(enc.indice);
      }
    }
  }
  // 2) La detección por nombres conocidos para lo que falte
  for (const enc of encabezados) {
    if (usadas.has(enc.indice)) continue;
    const campo = campoDeEncabezado(enc.texto);
    if (campo && mapeo[campo] === null) {
      mapeo[campo] = enc.indice;
      usadas.add(enc.indice);
    }
  }
  return mapeo;
}

// Mapeo por índices → { campo: texto de encabezado } para guardarlo en el proveedor
export function columnasComoTexto(mapeo, encabezados) {
  const out = {};
  for (const [campo, indice] of Object.entries(mapeo)) {
    const texto = indice === null || indice === undefined ? "" : encabezados.find((e) => e.indice === indice)?.texto || "";
    out[campo] = texto || null;
  }
  return out;
}

// SKU / código de barras como texto: 7790001000011 → "7790001000011", "123.0" → "123"
export function textoCodigo(valor) {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "number") {
    if (!Number.isFinite(valor)) return "";
    return Number.isInteger(valor) ? valor.toFixed(0) : String(valor);
  }
  return String(valor).trim().replace(/\.0+$/, "");
}

// Delimitador de un CSV mirando las primeras líneas: ";" o ","
export function detectarDelimitador(texto) {
  const lineas = String(texto || "").split(/\r?\n/).filter((l) => l.trim()).slice(0, 10);
  let pc = 0;
  let c = 0;
  for (const l of lineas) {
    pc += (l.match(/;/g) || []).length;
    c += (l.match(/,/g) || []).length;
  }
  return pc >= c && pc > 0 ? ";" : ",";
}

// Filas de datos (después del encabezado) → [{ fila, nombre, precio, costo, sku, codigoBarras, stock, categoria,
// stockMinimo, unidad, stockInvalido, precioInvalido }]. Las filas sin nada en las columnas mapeadas se omiten.
export function parsearFilas(filas, filaEncabezado, mapeo, { filaBase = 0 } = {}) {
  const celda = (fila, campo) => (mapeo[campo] === null || mapeo[campo] === undefined ? "" : fila[mapeo[campo]]);
  const out = [];
  for (let i = filaEncabezado + 1; i < filas.length; i++) {
    const fila = filas[i] || [];
    const crudo = Object.fromEntries(CAMPOS_IMPORTACION.map(({ campo }) => [campo, celda(fila, campo)]));
    if (Object.values(crudo).every(celdaVacia)) continue;
    const precio = parsearNumero(crudo.precio);
    const costo = parsearNumero(crudo.costo);
    const stock = parsearNumero(crudo.stock);
    const stockMinimo = parsearNumero(crudo.stockMinimo);
    const unidad = normalizarNombre(crudo.unidad);
    out.push({
      fila: i + filaBase + 1,
      nombre: String(crudo.nombre ?? "").trim(),
      precio,
      costo,
      sku: textoCodigo(crudo.sku),
      codigoBarras: textoCodigo(crudo.codigoBarras),
      stock,
      categoria: String(crudo.categoria ?? "").trim(),
      stockMinimo,
      unidad: ["u", "kg", "l"].includes(unidad) ? unidad : unidad.startsWith("kilo") ? "kg" : unidad.startsWith("lit") ? "l" : "u",
      precioInvalido: !celdaVacia(crudo.precio) && precio === null,
      stockInvalido: !celdaVacia(crudo.stock) && stock === null,
    });
  }
  return out;
}

const claveCodigo = (s) => String(s || "").trim().toLowerCase();

// Índices de los productos existentes por SKU, código de barras y nombre normalizado
export function indexarProductos(productos = []) {
  const porSku = new Map();
  const porBarras = new Map();
  const porNombre = new Map();
  for (const p of productos) {
    if (p.sku && !porSku.has(claveCodigo(p.sku))) porSku.set(claveCodigo(p.sku), p);
    if (p.codigoBarras && !porBarras.has(claveCodigo(p.codigoBarras))) porBarras.set(claveCodigo(p.codigoBarras), p);
    const n = p.nombreNorm || normalizarNombre(p.nombre);
    if (n && !porNombre.has(n)) porNombre.set(n, p);
  }
  return { porSku, porBarras, porNombre };
}

// Producto existente que corresponde a una fila: por SKU, después código de barras, después nombre
export function buscarProducto(fila, indice) {
  if (fila.sku && indice.porSku.has(claveCodigo(fila.sku))) return indice.porSku.get(claveCodigo(fila.sku));
  if (fila.codigoBarras && indice.porBarras.has(claveCodigo(fila.codigoBarras))) return indice.porBarras.get(claveCodigo(fila.codigoBarras));
  const n = normalizarNombre(fila.nombre);
  if (n && indice.porNombre.has(n)) return indice.porNombre.get(n);
  return null;
}

// Categoría existente con ese nombre (sin mayúsculas ni acentos), o null
export function buscarCategoria(nombre, categorias = []) {
  const n = normalizarNombre(nombre);
  if (!n) return null;
  return categorias.find((c) => normalizarNombre(c.nombre) === n) || null;
}

// Variación porcentual entera: 1000 → 1300 = 30
export function variacionPorcentaje(antes, despues) {
  const a = Number(antes);
  const d = Number(despues);
  if (!Number.isFinite(a) || !Number.isFinite(d) || a <= 0) return null;
  return Math.round(((d - a) / a) * 100);
}

// Análisis de las filas contra los productos existentes.
// opciones: { usarMargen, multiplicador }
// → { nuevos, cambios, stock, errores, sinCambios, categoriasDesconocidas }
//   nuevos:  [{ clave, fila, nombre, precio, precioDerivado, costo, sku, codigoBarras, stock, categoriaId, categoria,
//              stockMinimo, unidad }]
//   cambios: [{ clave, fila, producto, antes, despues, precioDerivado, costo, variacion }]
//   stock:   [{ clave, fila, producto, actual, cantidad, costo }] (solo productos existentes)
//   errores: [{ fila, nombre, motivo }]
export function analizarImportacion(filas, productos = [], categorias = [], { usarMargen = true, multiplicador = 1.6 } = {}) {
  const indice = indexarProductos(productos);
  const vistos = new Set();
  const nuevos = [];
  const cambios = [];
  const stock = [];
  const errores = [];
  const categoriasDesconocidas = new Set();
  let sinCambios = 0;

  for (const f of filas) {
    if (!f.nombre) {
      errores.push({ fila: f.fila, nombre: f.sku || f.codigoBarras || "", motivo: "Sin nombre" });
      continue;
    }
    const existente = buscarProducto(f, indice);
    const claves = existente
      ? [`p:${existente.id}`]
      : [f.sku && `s:${claveCodigo(f.sku)}`, f.codigoBarras && `b:${claveCodigo(f.codigoBarras)}`, `n:${normalizarNombre(f.nombre)}`].filter(Boolean);
    if (claves.some((k) => vistos.has(k))) {
      errores.push({ fila: f.fila, nombre: f.nombre, motivo: "Duplicada en el archivo" });
      continue;
    }
    claves.forEach((k) => vistos.add(k));

    if (f.stockInvalido) {
      errores.push({ fila: f.fila, nombre: f.nombre, motivo: "Stock inválido" });
      continue;
    }
    let precio = f.precio !== null && f.precio >= 0 ? f.precio : null;
    let precioDerivado = false;
    if (precio === null && !f.precioInvalido && usarMargen && f.costo !== null) {
      precio = precioDesdeCosto(f.costo, multiplicador);
      precioDerivado = precio !== null;
    }

    if (!existente) {
      if (precio === null) {
        errores.push({ fila: f.fila, nombre: f.nombre, motivo: "Precio inválido" });
        continue;
      }
      const cat = f.categoria ? buscarCategoria(f.categoria, categorias) : null;
      if (f.categoria && !cat) categoriasDesconocidas.add(f.categoria);
      nuevos.push({
        clave: `n:${f.fila}`,
        fila: f.fila,
        nombre: f.nombre,
        precio,
        precioDerivado,
        costo: f.costo,
        sku: f.sku,
        codigoBarras: f.codigoBarras,
        stock: f.stock,
        categoriaId: cat?.id || null,
        categoria: f.categoria,
        stockMinimo: f.stockMinimo,
        unidad: f.unidad,
      });
      continue;
    }

    // Producto existente: sin precio válido en el archivo simplemente no cambia el precio
    let hizoAlgo = false;
    if (precio !== null && Number(existente.precio) !== precio) {
      cambios.push({
        clave: `c:${f.fila}`,
        fila: f.fila,
        producto: existente,
        antes: Number(existente.precio) || 0,
        despues: precio,
        precioDerivado,
        costo: f.costo,
        variacion: variacionPorcentaje(existente.precio, precio),
      });
      hizoAlgo = true;
    }
    if (f.stock !== null && f.stock !== 0) {
      stock.push({
        clave: `s:${f.fila}`,
        fila: f.fila,
        producto: existente,
        actual: Number(existente.stock) || 0,
        cantidad: f.stock,
        costo: f.costo,
      });
      hizoAlgo = true;
    }
    if (!hizoAlgo) sinCambios++;
  }

  return { nuevos, cambios, stock, errores, sinCambios, categoriasDesconocidas: [...categoriasDesconocidas] };
}

// Lo que se va a escribir según las acciones elegidas y las filas marcadas (seleccion: Set de claves marcadas)
// → { crear: nuevos[], actualizar: cambios[], movimientos: [{ nuevo? , productoId?, cantidad, costo }] }
export function armarPlan(analisis, seleccion, { crear = true, actualizarPrecios = true, sumarStock = true } = {}) {
  const marcada = (x) => seleccion.has(x.clave);
  const nuevos = crear ? analisis.nuevos.filter(marcada) : [];
  const actualizar = actualizarPrecios ? analisis.cambios.filter(marcada) : [];
  const movimientos = [];
  if (sumarStock) {
    for (const n of nuevos) if (n.stock !== null && n.stock !== 0) movimientos.push({ nuevo: n, cantidad: n.stock, costo: n.costo });
    for (const s of analisis.stock.filter(marcada)) movimientos.push({ productoId: s.producto.id, cantidad: s.cantidad, costo: s.costo });
  }
  return { crear: nuevos, actualizar, movimientos };
}
