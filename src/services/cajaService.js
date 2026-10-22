import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { ETIQUETA_MEDIO, ETIQUETA_TIPO, MEDIOS_CAJA, TIPOS_MOVIMIENTO_CAJA as TIPOS, TOTALES_CERO } from "../utils/caja";

// Caja del bar: una caja es un turno de un dispositivo (clubs/{c}/cajas) y cada peso que entra o sale es un
// movimiento (clubs/{c}/movimientosCaja). `cajas.totales` lo escribe SOLO la Cloud Function onMovimientoCajaCreated;
// el cliente crea la caja con los totales en cero y nunca los toca (las reglas lo impiden). Las ventas (P3-3)
// llegarán como movimientos "venta"/"anulacion" escritos por otra Function.

const col = (clubId, nombre) => collection(db, "clubs", clubId, nombre);
const ref = (clubId, nombre, id) => doc(db, "clubs", clubId, nombre, id);

export const MEDIOS = [
  { id: "efectivo", label: "Efectivo" },
  { id: "transferencia", label: "Transferencia" },
  { id: "tarjeta", label: "Tarjeta" },
  { id: "qr", label: "QR" },
];
export const TIPOS_MOVIMIENTO_CAJA = TIPOS;
export { ETIQUETA_MEDIO, ETIQUETA_TIPO };

export const DISPOSITIVO_POR_DEFECTO = "Caja 1";
const CLAVE_DISPOSITIVO = "padely-dispositivo";

// Nombre del dispositivo recordado en este navegador
export function dispositivoGuardado() {
  try {
    return String(localStorage.getItem(CLAVE_DISPOSITIVO) || "").trim() || DISPOSITIVO_POR_DEFECTO;
  } catch {
    return DISPOSITIVO_POR_DEFECTO;
  }
}
export function guardarDispositivo(nombre) {
  try {
    localStorage.setItem(CLAVE_DISPOSITIVO, String(nombre || "").trim() || DISPOSITIVO_POR_DEFECTO);
  } catch {
    /* sin localStorage (modo privado): no se recuerda */
  }
}

export class CajaAbiertaError extends Error {
  constructor(caja) {
    super("Este dispositivo ya tiene una caja abierta");
    this.name = "CajaAbiertaError";
    this.caja = caja;
  }
}

const conId = (d) => ({ id: d.id, ...d.data() });

// ----- Cajas -----

const consultaAbiertaDe = (clubId, dispositivo) =>
  query(col(clubId, "cajas"), where("dispositivo", "==", dispositivo), where("estado", "==", "abierta"));

// La caja abierta de este dispositivo (o null), en tiempo real
export const escucharCajaAbierta = (clubId, dispositivo, onDatos, onError) =>
  onSnapshot(
    consultaAbiertaDe(clubId, dispositivo),
    (snap) => {
      // Si por una carrera quedaran dos, se muestra la más vieja (la que tiene movimientos)
      const lista = snap.docs.map(conId).sort((a, b) => (a.abiertaEn?.toMillis?.() || 0) - (b.abiertaEn?.toMillis?.() || 0));
      onDatos(lista[0] || null);
    },
    onError,
  );

// Todas las cajas abiertas del club (cualquier dispositivo), la más reciente primero
export const escucharCajasAbiertas = (clubId, onDatos, onError) =>
  onSnapshot(
    query(col(clubId, "cajas"), where("estado", "==", "abierta"), orderBy("abiertaEn", "desc")),
    (snap) => onDatos(snap.docs.map(conId)),
    onError,
  );

// Abre una caja para este dispositivo. Si ya tiene una abierta, no abre otra (CajaAbiertaError).
export const abrirCaja = async (clubId, { dispositivo, fondoInicial = 0, uid, nombre }) => {
  const nombreDispositivo = String(dispositivo || "").trim() || DISPOSITIVO_POR_DEFECTO;
  const abiertas = await getDocs(consultaAbiertaDe(clubId, nombreDispositivo));
  if (!abiertas.empty) throw new CajaAbiertaError(conId(abiertas.docs[0]));
  const fondo = Math.max(0, Number(fondoInicial) || 0);
  const nueva = await addDoc(col(clubId, "cajas"), {
    estado: "abierta",
    dispositivo: nombreDispositivo,
    abiertaPor: uid,
    abiertaPorNombre: String(nombre || "").trim() || null,
    abiertaEn: serverTimestamp(),
    fondoInicial: fondo,
    cerradaPor: null,
    cerradaPorNombre: null,
    cerradaEn: null,
    totales: { ...TOTALES_CERO },
    arqueo: null,
    esperadoEfectivo: null,
    diferencia: null,
    observaciones: null,
    creadoEn: serverTimestamp(),
    actualizadoEn: serverTimestamp(),
  });
  guardarDispositivo(nombreDispositivo);
  return nueva.id;
};

export const renombrarDispositivo = async (clubId, cajaId, dispositivo) => {
  const nombreDispositivo = String(dispositivo || "").trim();
  if (!nombreDispositivo) throw new Error("El dispositivo necesita un nombre");
  await updateDoc(ref(clubId, "cajas", cajaId), { dispositivo: nombreDispositivo, actualizadoEn: serverTimestamp() });
  guardarDispositivo(nombreDispositivo);
};

// Cierra la caja con el arqueo. El cliente calcula y guarda esperadoEfectivo y diferencia para el ticket.
export const cerrarCaja = async (clubId, cajaId, { efectivoContado, esperadoEfectivo, observaciones, uid, nombre }) => {
  const contado = Number(efectivoContado) || 0;
  const esperado = Number(esperadoEfectivo) || 0;
  await updateDoc(ref(clubId, "cajas", cajaId), {
    estado: "cerrada",
    cerradaPor: uid,
    cerradaPorNombre: String(nombre || "").trim() || null,
    cerradaEn: serverTimestamp(),
    arqueo: { efectivoContado: contado },
    esperadoEfectivo: esperado,
    diferencia: contado - esperado,
    observaciones: String(observaciones || "").trim() || null,
    actualizadoEn: serverTimestamp(),
  });
};

// Historial: las últimas cajas cerradas (por fecha de apertura)
export const getCajasCerradas = async (clubId, { max = 50 } = {}) => {
  const snap = await getDocs(query(col(clubId, "cajas"), where("estado", "==", "cerrada"), orderBy("abiertaEn", "desc"), limit(max)));
  return snap.docs.map(conId);
};

// ----- Movimientos -----

const consultaMovimientos = (clubId, cajaId) =>
  query(col(clubId, "movimientosCaja"), where("cajaId", "==", cajaId), orderBy("creadoEn", "desc"));

export const escucharMovimientosCaja = (clubId, cajaId, onDatos, onError) =>
  onSnapshot(consultaMovimientos(clubId, cajaId), (snap) => onDatos(snap.docs.map(conId)), onError);

export const getMovimientosCaja = async (clubId, cajaId) => {
  const snap = await getDocs(consultaMovimientos(clubId, cajaId));
  return snap.docs.map(conId);
};

// Registra un retiro, ingreso o gasto. `aplicado` nace false: la Function lo aplica a los totales y lo marca.
export const crearMovimientoCaja = async (clubId, { cajaId, tipo, medio, monto, nota = null, uid, nombre }) => {
  if (!TIPOS.includes(tipo)) throw new Error(`Tipo de movimiento inválido: ${tipo}`);
  if (!MEDIOS_CAJA.includes(medio)) throw new Error(`Medio inválido: ${medio}`);
  const valor = Number(monto);
  if (!Number.isFinite(valor) || valor <= 0) throw new Error("El monto tiene que ser mayor que 0");
  const texto = String(nota || "").trim() || null;
  if (tipo !== "ingreso" && !texto) throw new Error("Los retiros y gastos llevan nota");
  const nuevo = await addDoc(col(clubId, "movimientosCaja"), {
    cajaId,
    tipo,
    medio,
    monto: valor,
    ref: null,
    nota: texto,
    creadoPor: uid,
    creadoPorNombre: String(nombre || "").trim() || null,
    creadoEn: serverTimestamp(),
    aplicado: false,
  });
  return nuevo.id;
};

export { serverTimestamp };
