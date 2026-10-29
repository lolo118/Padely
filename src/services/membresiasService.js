import { Timestamp, collection, collectionGroup, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../lib/firebase";
import { hayCupo, normalizarPlan, registrarPagoSocio } from "../utils/membresias";

// Socios y membresías (P3-16). Planes: clubs/{c}/planesSocio (lectura pública; los escribe quien configura el club).
// Socios: clubs/{c}/socios/{uid | id propio}. El token del QR y el número de socio los pone la Function
// onSocioEscrito; la verificación pública vive en sociosPublicos/{token}. Antes del deploy de las reglas todo
// esto falla sin romper nada: el flag configuracionPadely/flags.membresias lo mantiene oculto.

// Pase familiar y altas por email (P3-16): pasan por Functions (buscan la cuenta de Padely por email)
const llamar = (nombre) => async (datos) => (await httpsCallable(functions, nombre)(datos)).data;
export const agregarIntegrante = llamar("agregarIntegrante"); // { clubId, email, titularUid? } → { uid, nombre }
export const quitarIntegrante = llamar("quitarIntegrante"); // { clubId, uid }
export const altaPasePorEmail = llamar("altaPasePorEmail"); // { clubId, email, planId, monto, medio } → { uid, nombre }

const planesRef = (clubId) => collection(db, "clubs", clubId, "planesSocio");
const sociosRef = (clubId) => collection(db, "clubs", clubId, "socios");
const aTs = (ms) => (ms == null ? null : Timestamp.fromMillis(ms));
// Las entradas viejas del historial vuelven de Firestore como Timestamp: solo se convierten los números
const aTsSiNumero = (v) => (typeof v === "number" ? Timestamp.fromMillis(v) : v ?? null);

export const getPlanesSocio = async (clubId, { soloVisibles = false } = {}) => {
  const snap = await getDocs(planesRef(clubId));
  const lista = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return lista.filter((p) => !soloVisibles || p.visible !== false).sort((a, b) => (a.orden || 0) - (b.orden || 0) || (a.precio || 0) - (b.precio || 0));
};

// Crea o actualiza un plan → id. Tira Error con el mensaje de validación.
export const guardarPlanSocio = async (clubId, datos, planId = null) => {
  const plan = normalizarPlan(datos);
  if (plan.error) throw new Error(plan.error);
  if (planId) {
    await updateDoc(doc(planesRef(clubId), planId), { ...plan, actualizadoEn: serverTimestamp() });
    return planId;
  }
  const ref = doc(planesRef(clubId));
  await setDoc(ref, { ...plan, creadoEn: serverTimestamp() });
  return ref.id;
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

// Jugador: pide ser socio con un plan (o vuelve a pedir después de una baja, un rechazo o un vencimiento)
export const pedirMembresia = async (clubId, plan, { uid, nombre }, existente = null) => {
  const datos = { planId: plan.id, planNombre: plan.nombre, estado: "pendiente", solicitadoEn: serverTimestamp() };
  if (existente) await updateDoc(doc(sociosRef(clubId), uid), datos);
  else await setDoc(doc(sociosRef(clubId), uid), { uid, nombre: String(nombre || "Jugador").slice(0, 80), ...datos });
};

// Jugador: retira su pedido pendiente
export const retirarPedido = (clubId, uid) => updateDoc(doc(sociosRef(clubId), uid), { estado: "cancelada", bajaEn: serverTimestamp() });

// Club: todos los socios (pendientes, activos, vencidos…)
export const getSocios = async (clubId) => {
  const snap = await getDocs(sociosRef(clubId));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

// Club: socios activos (Vender: descuento de socio)
export const getSociosActivos = async (clubId) => {
  const snap = await getDocs(query(sociosRef(clubId), where("estado", "==", "activa")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

const patchPago = (cambios) => ({
  ...cambios,
  desde: aTs(cambios.desde),
  vence: aTs(cambios.vence),
  historial: cambios.historial.map((h) => ({ ...h, en: aTsSiNumero(h.en) })),
  actualizadoEn: serverTimestamp(),
});

// Club: aprueba un pedido o renueva → registra el pago (manual) y activa hasta el nuevo vencimiento
export const registrarPago = async (clubId, socio, plan, opciones = {}) => {
  const cambios = registrarPagoSocio(socio, plan, opciones);
  if (cambios.error) throw new Error(cambios.error);
  await updateDoc(doc(sociosRef(clubId), socio.id), patchPago(cambios));
  return cambios;
};

export const rechazarPedido = (clubId, socioId, motivo = "") => updateDoc(doc(sociosRef(clubId), socioId), { estado: "rechazada", motivo: String(motivo || "").slice(0, 200), actualizadoEn: serverTimestamp() });
export const darDeBaja = (clubId, socioId) => updateDoc(doc(sociosRef(clubId), socioId), { estado: "cancelada", bajaEn: serverTimestamp(), actualizadoEn: serverTimestamp() });

export const cupoOcupado = (socios, planId) => socios.filter((s) => s.planId === planId && (s.estado === "activa" || s.estado === "pendiente")).length;
export const planConCupo = (plan, socios) => hayCupo(plan, cupoOcupado(socios, plan.id));

// Jugador: sus membresías en todos los clubes
export const getMisMembresias = async (uid) => {
  if (!uid) return [];
  try {
    const snap = await getDocs(query(collectionGroup(db, "socios"), where("uid", "==", uid)));
    return snap.docs.map((d) => ({ id: d.id, clubId: d.ref.parent.parent.id, ...d.data() }));
  } catch (err) {
    console.error("No se pudieron leer las membresías:", err);
    return [];
  }
};

// Verificación pública del QR del carnet
export const getVerificacionSocio = async (token) => {
  const snap = await getDoc(doc(db, "sociosPublicos", String(token || "x")));
  return snap.exists() ? snap.data() : null;
};
