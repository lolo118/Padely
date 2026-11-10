import { collection, getDocs, limit, onSnapshot, orderBy, query, Timestamp, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../lib/firebase";

// Fichaje de empleados (bar / caja). Todo se escribe con Functions (la hora es la del servidor y las correcciones
// dejan auditoría); el cliente solo lee empleados, turnos y auditoría (quien gestiona el equipo). Modelo en
// src/utils/fichajes.js.
const llamar = (nombre) => async (datos) => (await httpsCallable(functions, nombre)(datos)).data;

// { clubId, pin } → { nombre, tipo: 'entrada'|'salida', hora, minutos, cerroOlvido }
export const fichar = llamar("fichar");
// { clubId } → { token, venceEn }
export const pedirTokenQr = llamar("fichajeQrToken");
// { clubId, token } → { nombre, tipo, hora, minutos, club }
export const ficharConQr = llamar("ficharConQr");
// { clubId, empleadoId?, nombre, activo, staffUid?, pin?, quitarPin? } → { empleadoId, tienePin }
export const guardarEmpleado = llamar("guardarEmpleado");
// { clubId, accion: 'crear'|'editar'|'borrar', fichajeId?, empleadoId?, entrada, salida, nota }
export const editarFichaje = llamar("editarFichaje");

const conId = (d) => ({ id: d.id, ...d.data() });

export const escucharEmpleados = (clubId, cb, onError) =>
  onSnapshot(
    collection(db, "clubs", clubId, "empleados"),
    (snap) => cb(snap.docs.map(conId).sort((a, b) => String(a.nombre || "").localeCompare(String(b.nombre || ""), "es"))),
    onError,
  );

// Quién está trabajando ahora: los turnos abiertos
export const escucharAbiertos = (clubId, cb, onError) =>
  onSnapshot(
    query(collection(db, "clubs", clubId, "fichajes"), where("salida", "==", null)),
    (snap) => cb(snap.docs.map(conId).sort((a, b) => (a.entrada?.toMillis?.() || 0) - (b.entrada?.toMillis?.() || 0))),
    onError,
  );

// Turnos con entrada en [desdeMs, hastaMs), en vivo (el período que mira el admin)
export const escucharFichajesEntre = (clubId, desdeMs, hastaMs, cb, onError) =>
  onSnapshot(
    query(collection(db, "clubs", clubId, "fichajes"), where("entrada", ">=", Timestamp.fromMillis(desdeMs)), where("entrada", "<", Timestamp.fromMillis(hastaMs)), orderBy("entrada", "asc"), limit(2000)),
    (snap) => cb(snap.docs.map(conId)),
    onError,
  );

// Los últimos cambios manuales (auditoría)
export const getAuditoria = async (clubId, n = 100) => {
  const snap = await getDocs(query(collection(db, "clubs", clubId, "fichajesAuditoria"), orderBy("en", "desc"), limit(n)));
  return snap.docs.map(conId);
};

// Mensaje legible de un error de callable
export const mensajeError = (err, alternativa = "No se pudo. Probá de nuevo.") => {
  const m = err?.message;
  if (!m || /^(internal|INTERNAL)$/.test(m) || err?.code === "functions/internal") return alternativa;
  return m;
};
