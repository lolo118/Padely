import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../lib/firebase";

// Cuenta compartida (P3-7): lo que pasa por Functions porque lo usan el titular y los participantes desde el celular
// (los permisos se verifican en el servidor), más la búsqueda de jugadores y la lista "Jugaste con…".

const llamar = (nombre) => async (datos) => (await httpsCallable(functions, nombre)(datos)).data;

// { clubId, grupoId } → { token, grupoId, url } — crea la cuenta si no existe
export const crearInvitacionTurno = llamar("crearInvitacionTurno");
// { clubId, token, nombre? } → { grupoId, participanteId } — también para sesiones anónimas
export const unirseATurno = llamar("unirseATurno");
// { clubId, grupoId, uid? | nombre? } → { participanteId }
export const sumarJugador = llamar("sumarJugador");
// { clubId, grupoId, participanteId }
export const quitarParticipante = llamar("quitarParticipante");
// { clubId, grupoId, lineaIds, asignadoA }
export const asignarLineasTurno = llamar("asignarLineas");
// Super-admin: vuelve a armar perfilesPublicos desde users
export const reconstruirPerfilesPublicos = llamar("reconstruirPerfilesPublicos");

// Mismo normalizador que la Function: minúsculas, sin acentos, espacios colapsados
export const nombreBusqueda = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// Jugadores registrados y visibles cuyo nombre empieza con el texto (mínimo 3 letras): [{ uid, nombre, foto, ciudad }]
export const buscarPerfiles = async (texto, { max = 8 } = {}) => {
  const q = nombreBusqueda(texto);
  if (q.length < 3) return [];
  const snap = await getDocs(query(collection(db, "perfilesPublicos"), where("visible", "==", true), where("nombreBusqueda", ">=", q), where("nombreBusqueda", "<=", `${q}\uf8ff`), orderBy("nombreBusqueda"), limit(max)));
  return snap.docs.map((d) => ({ uid: d.id, nombre: d.data().nombre || "", foto: d.data().foto || null, ciudad: d.data().ciudad || null }));
};

// "Jugaste con…": users/{uid}/companeros, los más frecuentes primero
export const getCompaneros = async (uid, { max = 12 } = {}) => {
  if (!uid) return [];
  const snap = await getDocs(collection(db, "users", uid, "companeros"));
  return snap.docs
    .map((d) => ({ uid: d.id, ...d.data() }))
    .sort((a, b) => (Number(b.veces) || 0) - (Number(a.veces) || 0) || (b.ultimaVez?.toMillis?.() || 0) - (a.ultimaVez?.toMillis?.() || 0))
    .slice(0, max);
};

// La invitación detrás de un link /t/unirse/:clubId/:token (lectura por id; nunca se lista)
export const getInvitacionTurno = async (clubId, token) => {
  const snap = await getDoc(doc(db, "clubs", clubId, "invitacionesTurno", token));
  return snap.exists() ? { token: snap.id, ...snap.data() } : null;
};
