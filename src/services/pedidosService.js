import {
  addDoc,
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { normalizarReserva, agruparReservas } from "../utils/reservas";
import { getTodayLocal } from "../utils/formatDate";
import { ESTADOS_ACTIVOS, generarToken, reservaEnJuego, transicionValida } from "../utils/pedidos";

// Pedidos a la barra (clubs/{c}/pedidos): los crea el jugador (o un anónimo en la cancha, vía QR); la barra los
// acepta (cuentasService.aceptarPedido suma los items a la cuenta del turno), rechaza con motivo, marca listo y
// entregado. Lo que mantienen las Functions: pedidosPendientes de la cuenta, el qrToken (se borra), las
// notificaciones y los rechazos automáticos (fuera de horario, más de 3 en espera, cuenta cerrada).

const col = (clubId, nombre) => collection(db, "clubs", clubId, nombre);
const ref = (clubId, id) => doc(db, "clubs", clubId, "pedidos", id);
const conId = (d) => ({ id: d.id, ...d.data() });
const ordenCreado = (a, b) => (b.creadoEn?.toMillis?.() || 0) - (a.creadoEn?.toMillis?.() || 0);

const CLAVE_NOMBRE = "padely-nombre-pedido";
export const nombreAnonimoGuardado = () => {
  try {
    return localStorage.getItem(CLAVE_NOMBRE) || "";
  } catch {
    return "";
  }
};
export const guardarNombreAnonimo = (nombre) => {
  try {
    localStorage.setItem(CLAVE_NOMBRE, String(nombre || "").trim());
  } catch {
    /* sin localStorage */
  }
};

// ----- Jugador -----

export const crearPedido = async (clubId, datos) => {
  const nuevo = await addDoc(col(clubId, "pedidos"), {
    ...datos,
    estado: "pendiente",
    rechazo: null,
    tiempos: { creado: serverTimestamp(), aceptado: null, listo: null, entregado: null, cancelado: null, rechazado: null },
    atendidoPor: null,
    atendidoPorNombre: null,
    lineaIds: [],
    creadoEn: serverTimestamp(),
    actualizadoEn: serverTimestamp(),
  });
  return nuevo.id;
};

// Mis pedidos de un turno (la regla de lectura es por jugadorUid: la consulta lo lleva siempre)
export const escucharMisPedidosDeCuenta = (clubId, cuentaId, uid, onDatos, onError) =>
  onSnapshot(
    query(col(clubId, "pedidos"), where("jugadorUid", "==", uid), where("cuentaId", "==", cuentaId)),
    (snap) => onDatos(snap.docs.map(conId).sort(ordenCreado)),
    onError,
  );

// Mis pedidos en cualquier club (grupo de colecciones), los no terminados y los recién terminados
export const escucharMisPedidos = (uid, onDatos, onError) =>
  onSnapshot(
    query(collectionGroup(db, "pedidos"), where("jugadorUid", "==", uid), where("estado", "in", ["pendiente", "aceptado", "listo", "entregado", "rechazado"])),
    (snap) => onDatos(snap.docs.map((d) => ({ ...conId(d), clubId: d.ref.parent.parent.id })).sort(ordenCreado)),
    onError,
  );

export const cancelarPedido = async (clubId, id) => {
  await updateDoc(ref(clubId, id), { estado: "cancelado", "tiempos.cancelado": serverTimestamp(), actualizadoEn: serverTimestamp() });
};

// ----- Barra -----

export const escucharPedidosActivos = (clubId, onDatos, onError) =>
  onSnapshot(
    query(col(clubId, "pedidos"), where("estado", "in", ESTADOS_ACTIVOS), orderBy("creadoEn", "asc")),
    (snap) => onDatos(snap.docs.map(conId)),
    onError,
  );

export const escucharPedidosDeCuenta = (clubId, cuentaId, onDatos, onError) =>
  onSnapshot(query(col(clubId, "pedidos"), where("cuentaId", "==", cuentaId), orderBy("creadoEn", "desc")), (snap) => onDatos(snap.docs.map(conId)), onError);

export const rechazarPedido = async (clubId, id, { motivo, uid, nombre }) => {
  const texto = String(motivo || "").trim();
  if (!texto) throw new Error("El rechazo lleva motivo");
  await updateDoc(ref(clubId, id), {
    estado: "rechazado",
    rechazo: { motivo: texto, por: uid, porNombre: String(nombre || "").trim() || null },
    "tiempos.rechazado": serverTimestamp(),
    atendidoPor: uid,
    atendidoPorNombre: String(nombre || "").trim() || null,
    actualizadoEn: serverTimestamp(),
  });
};

// listo / entregado (aceptar es cuentasService.aceptarPedido: suma los items a la cuenta en la misma transacción)
export const avanzarPedido = async (clubId, pedido, nuevoEstado, { uid, nombre }) => {
  if (!transicionValida(pedido.estado, nuevoEstado) || nuevoEstado === "aceptado" || nuevoEstado === "rechazado" || nuevoEstado === "cancelado") {
    throw new Error(`No se puede pasar de ${pedido.estado} a ${nuevoEstado}`);
  }
  await updateDoc(ref(clubId, pedido.id), {
    estado: nuevoEstado,
    [`tiempos.${nuevoEstado}`]: serverTimestamp(),
    atendidoPor: uid,
    atendidoPorNombre: String(nombre || "").trim() || null,
    actualizadoEn: serverTimestamp(),
  });
};

// ----- QR de la cancha -----

// La reserva en juego en una cancha ahora (confirmada, de hoy, ±15 min), o null
export const getReservaEnJuego = async (clubId, canchaId, ahora = new Date()) => {
  const snap = await getDocs(query(col(clubId, "reservas"), where("canchaId", "==", canchaId), where("fecha", "==", getTodayLocal()), where("status", "==", "confirmada")));
  const grupos = agruparReservas(snap.docs.map((d) => normalizarReserva({ id: d.id, clubId, ...d.data() })));
  return reservaEnJuego(grupos, canchaId, ahora);
};

export const getCancha = async (clubId, canchaId) => {
  const snap = await getDoc(doc(db, "clubs", clubId, "canchas", canchaId));
  return snap.exists() ? conId(snap) : null;
};

// Token del QR de la cancha; se crea la primera vez que el club lo imprime
export const asegurarQrToken = async (clubId, canchaId) => {
  const cancha = await getCancha(clubId, canchaId);
  if (!cancha) throw new Error("La cancha no existe");
  if (cancha.qrToken) return cancha.qrToken;
  const token = generarToken();
  await updateDoc(doc(db, "clubs", clubId, "canchas", canchaId), { qrToken: token, qrTokenEn: serverTimestamp() });
  return token;
};

// Un token nuevo: el QR impreso antes deja de servir
export const regenerarQrToken = async (clubId, canchaId) => {
  const token = generarToken();
  await updateDoc(doc(db, "clubs", clubId, "canchas", canchaId), { qrToken: token, qrTokenEn: serverTimestamp() });
  return token;
};

export const urlQr = (clubId, canchaId, token, origen = typeof window !== "undefined" ? window.location.origin : "https://padely.netlify.app") =>
  `${origen}/c/${clubId}/${canchaId}?t=${encodeURIComponent(token || "")}`;
