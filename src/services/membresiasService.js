import { collection, collectionGroup, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../lib/firebase";
import { PASE_ID, normalizarPase } from "../utils/membresias";

// Pase Club (P3-16). La configuración: clubs/{c}/planesSocio/pase (lectura pública; la escribe quien configura).
// Los socios (clubs/{c}/socios/{uid}) los escriben las Functions: suscripción por Mercado Pago (débito automático),
// cobros, puntos, nivel y bajas. El jugador y el club solo tocan la postulación al equipo del club.
const llamar = (nombre) => async (datos) => (await httpsCallable(functions, nombre)(datos)).data;
const mpSuscribirPase = llamar("mpSuscribirPase"); // { clubId, email } → { initPoint }
export const cancelarPase = llamar("mpCancelarPase"); // { clubId, uid? }

const sociosRef = (clubId) => collection(db, "clubs", clubId, "socios");
const paseRef = (clubId) => doc(db, "clubs", clubId, "planesSocio", PASE_ID);

export const getPase = async (clubId) => {
  const snap = await getDoc(paseRef(clubId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};

// Guarda la configuración del Pase. Tira Error con el mensaje de validación.
export const guardarPase = async (clubId, datos) => {
  const pase = normalizarPase(datos);
  if (pase.error) throw new Error(pase.error);
  await setDoc(paseRef(clubId), { ...pase, actualizadoEn: serverTimestamp() }, { merge: true });
  return pase;
};

// Suscribirse: Mercado Pago devuelve el link para autorizar el débito automático
export const suscribirPase = async ({ clubId, email }) => {
  const r = await mpSuscribirPase({ clubId, email });
  if (!r?.initPoint) throw new Error("Mercado Pago no devolvió el link");
  window.location.assign(r.initPoint);
  return r;
};

export const getMiSocio = async (clubId, uid) => {
  if (!clubId || !uid) return null;
  try {
    const snap = await getDoc(doc(sociosRef(clubId), uid));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch {
    return null;
  }
};

export const getSocios = async (clubId) => {
  const snap = await getDocs(sociosRef(clubId));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const getSociosActivos = async (clubId) => {
  const snap = await getDocs(query(sociosRef(clubId), where("estado", "==", "activa")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

// Equipo del club (interclubes): el socio se postula; el club marca a quién elige
export const postularEquipo = (clubId, socio, { quiere, categoria = "", posicion = "" }) =>
  updateDoc(doc(sociosRef(clubId), socio.uid), { equipo: { quiere: !!quiere, categoria: String(categoria || "").slice(0, 20), posicion: String(posicion || "").slice(0, 20), seleccionado: socio.equipo?.seleccionado === true, en: serverTimestamp() } });
export const marcarSeleccionado = (clubId, socio, seleccionado) => updateDoc(doc(sociosRef(clubId), socio.id), { equipo: { ...(socio.equipo || {}), seleccionado: !!seleccionado } });

// Últimos movimientos de puntos del socio
export const getPuntos = async (clubId, uid, n = 20) => {
  try {
    const snap = await getDocs(query(collection(db, "clubs", clubId, "socios", uid, "puntos"), orderBy("en", "desc"), limit(n)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch {
    return [];
  }
};

// Jugador: sus Pases en todos los clubes
export const getMisMembresias = async (uid) => {
  if (!uid) return [];
  try {
    const snap = await getDocs(query(collectionGroup(db, "socios"), where("uid", "==", uid)));
    return snap.docs.map((d) => ({ id: d.id, clubId: d.ref.parent.parent.id, ...d.data() }));
  } catch (err) {
    console.error("No se pudieron leer los Pases:", err);
    return [];
  }
};

export const getVerificacionSocio = async (token) => {
  const snap = await getDoc(doc(db, "sociosPublicos", String(token || "x")));
  return snap.exists() ? snap.data() : null;
};
