import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { normalizarNombre } from "../utils/productos";

// Bar: productos, categorías, proveedores y movimientos de stock de un club (clubs/{c}/…).
// El stock de un producto lo escribe SOLO la Cloud Function onMovimientoStockCreated a partir de movimientosStock:
// el cliente crea productos con stock 0 y nunca toca ese campo (las reglas lo impiden).

const col = (clubId, nombre) => collection(db, "clubs", clubId, nombre);
const ref = (clubId, nombre, id) => doc(db, "clubs", clubId, nombre, id);

export const UNIDADES = [
  { value: "u", label: "Unidad" },
  { value: "kg", label: "Kilo" },
  { value: "l", label: "Litro" },
];
export const TIPOS_MOVIMIENTO = ["compra", "ajuste", "merma", "importacion"];
export const CATEGORIAS_SUGERIDAS = ["Bebidas", "Comidas", "Snacks", "Pádel", "Servicios"];

const numOrNull = (v) => (v === "" || v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));
const textoOrNull = (v) => {
  const t = String(v ?? "").trim();
  return t ? t : null;
};

// Campos editables de un producto (sin stock), normalizados
export function datosDeProducto(d) {
  return {
    nombre: String(d.nombre || "").trim(),
    nombreNorm: normalizarNombre(d.nombre),
    categoriaId: d.categoriaId || null,
    precio: numOrNull(d.precio) ?? 0,
    costo: numOrNull(d.costo),
    sku: textoOrNull(d.sku),
    codigoBarras: textoOrNull(d.codigoBarras),
    controlaStock: d.controlaStock !== false,
    stockMinimo: numOrNull(d.stockMinimo),
    unidad: ["u", "kg", "l"].includes(d.unidad) ? d.unidad : "u",
    favorito: !!d.favorito,
    orden: numOrNull(d.orden) ?? 0,
    activo: d.activo !== false,
  };
}

// ----- Productos -----

// Lista en tiempo real (el stock lo actualiza la Function unos segundos después de cada movimiento)
export const escucharProductos = (clubId, onDatos, onError) =>
  onSnapshot(
    col(clubId, "productos"),
    (snap) => onDatos(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError,
  );

export const getProductos = async (clubId) => {
  const snap = await getDocs(col(clubId, "productos"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

// Crea el producto con stock 0; si hay stock inicial lo carga como movimiento (compra o ajuste)
export const crearProducto = async (clubId, datos, { stockInicial = null, tipoInicial = "compra", uid } = {}) => {
  const nuevo = await addDoc(col(clubId, "productos"), {
    ...datosDeProducto(datos),
    stock: 0,
    creadoEn: serverTimestamp(),
    actualizadoEn: serverTimestamp(),
  });
  const cantidad = Number(stockInicial);
  if (Number.isFinite(cantidad) && cantidad !== 0) {
    await crearMovimiento(clubId, {
      productoId: nuevo.id,
      tipo: tipoInicial === "ajuste" ? "ajuste" : "compra",
      cantidad,
      costoUnitario: tipoInicial === "ajuste" ? null : datosDeProducto(datos).costo,
      nota: tipoInicial === "ajuste" ? "Stock inicial" : null,
      uid,
    });
  }
  return nuevo.id;
};

export const actualizarProducto = async (clubId, id, datos) => {
  await updateDoc(ref(clubId, "productos", id), { ...datosDeProducto(datos), actualizadoEn: serverTimestamp() });
};

// Cambios puntuales (activo, favorito, orden…): nunca stock
export const actualizarCamposProducto = async (clubId, id, campos) => {
  const { stock: _s, ...resto } = campos || {};
  await updateDoc(ref(clubId, "productos", id), { ...resto, actualizadoEn: serverTimestamp() });
};

// ----- Movimientos de stock (registro solo de alta: las correcciones son movimientos nuevos) -----

export const crearMovimiento = async (clubId, { productoId, tipo, cantidad, costoUnitario = null, proveedorId = null, nota = null, uid }) => {
  if (!TIPOS_MOVIMIENTO.includes(tipo)) throw new Error("Tipo de movimiento inválido");
  const n = Number(cantidad);
  if (!Number.isFinite(n) || n === 0) throw new Error("La cantidad no puede ser 0");
  const r = await addDoc(col(clubId, "movimientosStock"), {
    productoId,
    tipo,
    cantidad: n,
    costoUnitario: numOrNull(costoUnitario),
    proveedorId: proveedorId || null,
    nota: textoOrNull(nota),
    creadoPor: uid,
    creadoEn: serverTimestamp(),
    aplicado: false,
  });
  return r.id;
};

// Últimos movimientos del club, o de un producto
export const getMovimientos = async (clubId, { productoId = null, max = 100 } = {}) => {
  const q = productoId
    ? query(col(clubId, "movimientosStock"), where("productoId", "==", productoId), orderBy("creadoEn", "desc"), limit(max))
    : query(col(clubId, "movimientosStock"), orderBy("creadoEn", "desc"), limit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

// ----- Categorías -----

export const getCategorias = async (clubId) => {
  const snap = await getDocs(col(clubId, "categoriasProductos"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
};

export const crearCategoria = async (clubId, nombre, orden = 0) => {
  const r = await addDoc(col(clubId, "categoriasProductos"), { nombre: String(nombre || "").trim(), orden });
  return r.id;
};

export const crearCategoriasSugeridas = async (clubId) => {
  const batch = writeBatch(db);
  CATEGORIAS_SUGERIDAS.forEach((nombre, i) => batch.set(doc(col(clubId, "categoriasProductos")), { nombre, orden: i }));
  await batch.commit();
};

export const actualizarCategoria = async (clubId, id, datos) => {
  await updateDoc(ref(clubId, "categoriasProductos", id), datos);
};

// Intercambia el orden de dos categorías
export const intercambiarOrden = async (clubId, a, b) => {
  const batch = writeBatch(db);
  batch.update(ref(clubId, "categoriasProductos", a.id), { orden: b.orden ?? 0 });
  batch.update(ref(clubId, "categoriasProductos", b.id), { orden: a.orden ?? 0 });
  await batch.commit();
};

export const eliminarCategoria = async (clubId, id) => {
  await deleteDoc(ref(clubId, "categoriasProductos", id));
};

// ----- Proveedores -----

export const getProveedores = async (clubId) => {
  const snap = await getDocs(col(clubId, "proveedores"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es"));
};

export const crearProveedor = async (clubId, d) => {
  const r = await addDoc(col(clubId, "proveedores"), {
    nombre: String(d.nombre || "").trim(),
    contacto: textoOrNull(d.contacto),
    telefono: textoOrNull(d.telefono),
    mapeoImportacion: null,
  });
  return r.id;
};

export const actualizarProveedor = async (clubId, id, d) => {
  await updateDoc(ref(clubId, "proveedores", id), {
    nombre: String(d.nombre || "").trim(),
    contacto: textoOrNull(d.contacto),
    telefono: textoOrNull(d.telefono),
  });
};

// Solo el mapeo (lo permiten también quienes tienen 'importar')
export const guardarMapeoProveedor = async (clubId, id, mapeo) => {
  await updateDoc(ref(clubId, "proveedores", id), { mapeoImportacion: mapeo || null });
};

export const eliminarProveedor = async (clubId, id) => {
  await deleteDoc(ref(clubId, "proveedores", id));
};

// ----- Escritura en lotes (importación) -----

// ops: [(batch) => void]; de a 400 escrituras por lote; onProgreso(hechos, total)
export const escribirEnLotes = async (ops, onProgreso) => {
  for (let i = 0; i < ops.length; i += 400) {
    const batch = writeBatch(db);
    ops.slice(i, i + 400).forEach((op) => op(batch));
    await batch.commit();
    onProgreso?.(Math.min(i + 400, ops.length), ops.length);
  }
};

export const refNuevoProducto = (clubId) => doc(col(clubId, "productos"));
export const refProducto = (clubId, id) => ref(clubId, "productos", id);
export const refNuevoMovimiento = (clubId) => doc(col(clubId, "movimientosStock"));
export { serverTimestamp };
