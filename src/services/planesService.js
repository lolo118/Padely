import { addDoc, arrayUnion, collection, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, Timestamp, updateDoc, where, writeBatch } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../lib/firebase";
import { flag } from "./flagsService";
import { canchasActivas } from "../utils/planes";

// Planes (P3-9). clubs/{c}.plan lo escriben solo las Functions y el super-admin (las reglas no dejan que el club lo
// toque). Acá: los datos de pago de Padely, el "Ya pagué, avisar" del dueño y las acciones del super-admin.
// Las fechas del plan van como Timestamp en Firestore y como ms en src/utils/planes.js.

const ts = (v) => (v === null || v === undefined ? null : typeof v === "number" ? Timestamp.fromMillis(v) : v);
export const planAFirestore = (plan) => ({
  ...plan,
  inicio: ts(plan.inicio),
  vence: ts(plan.vence),
  historial: (plan.historial || []).map((h) => ({ ...h, desde: ts(h.desde), hasta: ts(h.hasta) })),
});

// configuracionPadely/facturacion: { alias, cbu, titular, whatsapp, email, nota } (lo edita el super-admin)
export const getDatosFacturacion = async () => {
  const snap = await getDoc(doc(db, "configuracionPadely", "facturacion"));
  return snap.exists() ? snap.data() : {};
};
export const guardarDatosFacturacion = (datos) => setDoc(doc(db, "configuracionPadely", "facturacion"), { ...datos, actualizadoEn: serverTimestamp() }, { merge: true });

// Dueño: "Ya pagué, avisar" → avisosPago (la Function avisa a los super-admins)
export const avisarPago = ({ clubId, clubNombre, uid, nombre, monto = null, nota = "" }) =>
  addDoc(collection(db, "avisosPago"), {
    clubId,
    clubNombre: clubNombre || null,
    creadoPor: uid,
    creadoPorNombre: nombre || null,
    monto: monto === null ? null : Number(monto) || null,
    nota: String(nota || "").slice(0, 300),
    estado: "nuevo",
    creadoEn: serverTimestamp(),
  });

// ----- Super-admin -----
// Clubes con su plan y la cantidad de canchas activas (para el escalón PRO)
export const getClubesConPlan = async () => {
  const snap = await getDocs(collection(db, "clubs"));
  const clubes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const canchas = await Promise.all(clubes.map((c) => getDocs(collection(db, "clubs", c.id, "canchas")).catch(() => null)));
  return clubes.map((c, i) => ({ ...c, canchasActivas: canchas[i] ? canchasActivas(canchas[i].docs.map((d) => d.data())) : 0 }));
};

// P3-14: con la privacidad migrada (flag privacidadMigrada) el plan público lleva solo { tipo, inicio, vence, escalon }
// y las entradas nuevas del historial (con montos) se suman a clubs/{c}/privado/plan; antes, todo junto como siempre.
export const guardarPlan = async (clubId, plan, planAnterior = null) => {
  const p = planAFirestore(plan);
  if (!flag("privacidadMigrada")) return updateDoc(doc(db, "clubs", clubId), { plan: p });
  const { historial = [], ...publico } = p;
  const previas = Array.isArray(planAnterior?.historial) ? planAnterior.historial.length : 0;
  const nuevas = historial.slice(previas);
  const batch = writeBatch(db);
  batch.update(doc(db, "clubs", clubId), { plan: publico });
  if (nuevas.length) batch.set(doc(db, "clubs", clubId, "privado", "plan"), { historial: arrayUnion(...nuevas), actualizadoEn: serverTimestamp() }, { merge: true });
  return batch.commit();
};

// Super-admin (P3-14): migración única de privacidad (tickets con id aleatorio, plan e info de MP a privado/*)
export const migrarPrivacidad = async () => (await httpsCallable(functions, "migrarPrivacidad")({})).data;

export const getAvisosPago = async () => {
  const snap = await getDocs(query(collection(db, "avisosPago"), orderBy("creadoEn", "desc"), limit(50)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};
export const marcarAvisoAtendido = (id, uid) => updateDoc(doc(db, "avisosPago", id), { estado: "atendido", atendidoPor: uid, atendidoEn: serverTimestamp() });

// Torneos para cobrar: los más recientes (con o sin cobro)
export const getTorneosParaCobrar = async (n = 40) => {
  const snap = await getDocs(query(collection(db, "tournaments"), orderBy("createdAt", "desc"), limit(n))).catch(() => getDocs(query(collection(db, "tournaments"), limit(n))));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};
export const marcarCobroTorneo = (id, { monto, estado }) => updateDoc(doc(db, "tournaments", id), { cobro: { monto: Number(monto) || 0, estado, en: serverTimestamp() } });

// Torneos de un club (sede) sin cobrar: para Mi plan
export const getTorneosDeClub = async (clubId) => {
  const snap = await getDocs(query(collection(db, "tournaments"), where("club.id", "==", clubId), limit(20))).catch(() => null);
  return snap ? snap.docs.map((d) => ({ id: d.id, ...d.data() })) : [];
};

// Cuenta de Mercado Pago conectada (P3-14): clubs/{c}/privado/mpCuenta; antes de la migración (o sin permiso), lo que
// todavía esté en el documento público
export const getCuentaMp = async (club) => {
  if (!club?.id) return null;
  const snap = await getDoc(doc(db, "clubs", club.id, "privado", "mpCuenta")).catch(() => null);
  const mp = club.mercadoPago || {};
  return snap && snap.exists() ? { ...snap.data() } : { userId: mp.userId ?? null, nickname: mp.nickname ?? null, esPrueba: mp.esPrueba ?? null, liveMode: mp.liveMode ?? null, conectadoEn: mp.conectadoEn ?? null };
};
