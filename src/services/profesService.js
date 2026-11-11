import { useEffect, useState } from "react";
import { collection, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, updateDoc, where, deleteDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../lib/firebase";
import { cargarFlags } from "./flagsService";
import { uploadImage } from "./storageService";

// Profes (flags.profes). El perfil, la disponibilidad y el pedido de sumarse a un club los escribe el cliente (las
// reglas lo acotan); todo lo que mueve clases pasa por Functions (functions/index.js, sección PROFES).
const llamar = (nombre) => async (datos) => (await httpsCallable(functions, nombre)(datos)).data;
export const reservarClase = llamar("reservarClase"); // { profeUid, clubId, tipo, fecha, hora, participantes } → { claseId, monto, pagarOnline }
export const cancelarClase = llamar("cancelarClase"); // { claseId, motivo? }
export const marcarClase = llamar("marcarClase"); // { claseId, que: dada | ausente | presente | cobrado, alumnoUid? }
export const repetirClase = llamar("repetirClase"); // { claseId, alumnoUid, semanas } → { resultados: [{ fecha, ok, motivo }] }
export const elogiarClase = llamar("elogiarClase"); // { claseId, tags, comentario }
export const reportarClase = llamar("reportarClase"); // { claseId, texto }
export const invitarProfe = llamar("invitarProfe"); // { clubId, email | profeUid } → { ok, estado | motivo }
const mpPagarClase = llamar("mpPagarClase"); // { claseId } → { initPoint }

// ¿Está prendido flags.profes? null mientras carga
export function useFlagProfes() {
  const [on, setOn] = useState(null);
  useEffect(() => {
    let vivo = true;
    cargarFlags().then((f) => vivo && setOn(f?.profes === true));
    return () => {
      vivo = false;
    };
  }, []);
  return on;
}

const conId = (d) => ({ id: d.id, ...d.data() });

// ----- Perfil -----
export const getProfe = async (uid) => {
  const snap = await getDoc(doc(db, "profes", uid));
  return snap.exists() ? conId(snap) : null;
};
export const getProfes = async () => {
  const snap = await getDocs(query(collection(db, "profes"), where("activo", "==", true)));
  return snap.docs.map(conId);
};
export const getProfesDeClub = async (clubId) => {
  const snap = await getDocs(query(collection(db, "profes"), where("clubIds", "array-contains", clubId)));
  return snap.docs.map(conId).filter((p) => p.activo !== false);
};
// perfil ya normalizado (normalizarPerfil); crea o actualiza sin tocar los campos de las Functions
export const guardarPerfilProfe = async (uid, perfil, { nuevo = false } = {}) => {
  const ref = doc(db, "profes", uid);
  if (nuevo) await setDoc(ref, { ...perfil, uid, creadoEn: serverTimestamp(), actualizadoEn: serverTimestamp() });
  else await updateDoc(ref, { ...perfil, actualizadoEn: serverTimestamp() });
};
export const subirFotoProfe = async (uid, file) => {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  return uploadImage(`profe-fotos/${uid}/foto.${ext}`, file);
};
export const getElogios = async (uid, max = 20) => {
  const snap = await getDocs(query(collection(db, "profes", uid, "elogios"), orderBy("creadoEn", "desc"), limit(max)));
  return snap.docs.map(conId);
};

// ----- Disponibilidad -----
export const getDisponibilidad = async (uid, clubId) => {
  const snap = await getDoc(doc(db, "profes", uid, "disponibilidad", clubId));
  return snap.exists() ? snap.data() : null;
};
export const guardarDisponibilidad = (uid, clubId, disp) => setDoc(doc(db, "profes", uid, "disponibilidad", clubId), { ...disp, actualizadoEn: serverTimestamp() });
// Horas ocupadas del profe desde una fecha (todas sus clases, en todos los clubes)
export const getOcupacion = async (uid, desde) => {
  const snap = await getDocs(query(collection(db, "profesOcupacion"), where("profeUid", "==", uid), where("fecha", ">=", desde)));
  return snap.docs.map((d) => d.data());
};

// ----- Vínculo con clubes -----
export const getVinculo = async (clubId, uid) => {
  const snap = await getDoc(doc(db, "clubs", clubId, "profes", uid));
  return snap.exists() ? conId(snap) : null;
};
export const getVinculosDeClub = async (clubId) => {
  const snap = await getDocs(collection(db, "clubs", clubId, "profes"));
  return snap.docs.map(conId);
};
export const pedirSumarme = (clubId, uid, nombre) =>
  setDoc(doc(db, "clubs", clubId, "profes", uid), { uid, nombre, estado: "pendiente", origen: "profe", cobra: "profe", bloqueaCancha: true, canchas: [], tarifas: {}, creadoEn: serverTimestamp(), actualizadoEn: serverTimestamp() });
// El profe: acepta una invitación ("activo"), se da de baja o vuelve a pedir ("pendiente" después de una baja)
export const cambiarMiVinculo = (clubId, uid, estado) => updateDoc(doc(db, "clubs", clubId, "profes", uid), { estado, actualizadoEn: serverTimestamp() });
// El club: estado y configuración (normalizarVinculo)
export const actualizarVinculo = (clubId, uid, datos) => updateDoc(doc(db, "clubs", clubId, "profes", uid), { ...datos, actualizadoEn: serverTimestamp() });
export const borrarVinculo = (clubId, uid) => deleteDoc(doc(db, "clubs", clubId, "profes", uid));

// ----- Clases -----
export const getClase = async (id) => {
  const snap = await getDoc(doc(db, "clases", id));
  return snap.exists() ? conId(snap) : null;
};
export const getClasesDeProfe = async (uid, desde) => {
  const snap = await getDocs(query(collection(db, "clases"), where("profeUid", "==", uid), where("fecha", ">=", desde), orderBy("fecha", "asc")));
  return snap.docs.map(conId);
};
export const getClasesDeClub = async (clubId, desde) => {
  const snap = await getDocs(query(collection(db, "clases"), where("clubId", "==", clubId), where("fecha", ">=", desde), orderBy("fecha", "asc")));
  return snap.docs.map(conId);
};
export const getMisClases = async (uid, max = 60) => {
  const snap = await getDocs(query(collection(db, "clases"), where("uidsHistorial", "array-contains", uid), orderBy("fecha", "desc"), limit(max)));
  return snap.docs.map(conId);
};
export const getReportesDeClub = async (clubId) => {
  const snap = await getDocs(query(collection(db, "reportesProfes"), where("clubId", "==", clubId)));
  return snap.docs.map(conId).sort((a, b) => (b.creadoEn?.toMillis?.() || 0) - (a.creadoEn?.toMillis?.() || 0));
};

// Pago online (cobra el club con su MP): manda al checkout; vuelve a /mis-clases?mp=ok|pendiente|error
export const pagarClaseOnline = async (claseId) => {
  const r = await mpPagarClase({ claseId });
  if (!r?.initPoint) throw new Error("Mercado Pago no devolvió el link de pago");
  window.location.assign(r.initPoint);
  return r;
};

// "08:00".."23:00" para los selectores de horario
export const HORAS_DIA = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`);
