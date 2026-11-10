import { collection, deleteDoc, doc, getDoc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from "firebase/firestore";
import { db } from "../lib/firebase";

// Mini torneo de un turno (clubs/{c}/miniTorneos/{id}): lo escriben el cliente y las reglas, ninguna Function lo
// escucha (no suma puntos, rankings ni Pase). Lectura pública (el link para WhatsApp). La clave del link para cargar
// resultados vive en miniTorneos/{id}/privado/edicion (la lee solo quien lo creó); quien entra con esa clave queda
// anotado en miniTorneos/{id}/editores/{uid}.
const col = (clubId) => collection(db, "clubs", clubId, "miniTorneos");
const ref = (clubId, id) => doc(db, "clubs", clubId, "miniTorneos", id);
const refClave = (clubId, id) => doc(db, "clubs", clubId, "miniTorneos", id, "privado", "edicion");

const claveAleatoria = () => {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
};

// Crea el mini torneo y su clave de edición en una sola escritura. Devuelve el id.
export async function crearMiniTorneo(clubId, datos) {
  const nuevo = doc(col(clubId));
  const batch = writeBatch(db);
  batch.set(nuevo, { ...datos, clubId, estado: "en_curso", creadoEn: serverTimestamp(), actualizadoEn: serverTimestamp() });
  batch.set(refClave(clubId, nuevo.id), { clave: claveAleatoria(), creadoEn: serverTimestamp() });
  await batch.commit();
  return nuevo.id;
}

export const escucharMiniTorneo = (clubId, id, onDatos, onError) => onSnapshot(ref(clubId, id), (snap) => onDatos(snap.exists() ? { id: snap.id, ...snap.data() } : null), onError);

// Los mini torneos de una reserva (por grupoId), para Mis reservas y Mi cuenta
export const escucharMinisDeReserva = (clubId, grupoId, onDatos, onError) =>
  onSnapshot(query(col(clubId), where("reservaGrupoId", "==", grupoId)), (snap) => onDatos(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError);

// Resultados: lo que puede tocar cualquier editor (partidos, cuadro y estado)
export const guardarResultados = (clubId, id, { partidos, llave, estado }) => updateDoc(ref(clubId, id), { partidos, llave: llave || null, estado, actualizadoEn: serverTimestamp() });

// Ajustes de quien lo creó (edicionAbierta, editoresUids, nombre)
export const actualizarMiniTorneo = (clubId, id, cambios) => updateDoc(ref(clubId, id), { ...cambios, actualizadoEn: serverTimestamp() });

export const leerClaveEdicion = async (clubId, id) => {
  const snap = await getDoc(refClave(clubId, id));
  return snap.exists() ? snap.data().clave || null : null;
};

// Nueva clave: el link anterior deja de servir para sumarse (quienes ya se sumaron siguen mientras la carga esté abierta)
export const renovarClaveEdicion = async (clubId, id) => {
  const clave = claveAleatoria();
  await setDoc(refClave(clubId, id), { clave, creadoEn: serverTimestamp() });
  return clave;
};

// Entrar con el link de carga: deja el uid anotado como editor (las reglas comparan la clave)
export const sumarmeComoEditor = (clubId, id, uid, clave) => setDoc(doc(db, "clubs", clubId, "miniTorneos", id, "editores", uid), { clave, creadoEn: serverTimestamp() });

export const soyEditorPorLink = async (clubId, id, uid) => {
  try {
    return (await getDoc(doc(db, "clubs", clubId, "miniTorneos", id, "editores", uid))).exists();
  } catch {
    return false;
  }
};

export async function borrarMiniTorneo(clubId, id) {
  await deleteDoc(refClave(clubId, id)).catch(() => {});
  await deleteDoc(ref(clubId, id));
}
