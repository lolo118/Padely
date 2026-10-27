import { addDoc, collection, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, Timestamp, updateDoc, where } from "firebase/firestore";
import { db } from "../lib/firebase";
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

export const guardarPlan = (clubId, plan) => updateDoc(doc(db, "clubs", clubId), { plan: planAFirestore(plan) });

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
