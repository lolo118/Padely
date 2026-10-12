import {
  collection,
  collectionGroup,
  addDoc,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  runTransaction,
  setDoc,
  deleteField,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { getTodayLocal, horaActualStr } from "../utils/formatDate";

// --- CANCHAS ---

export const crearCancha = async (clubId, cancha) => {
  const ref = await addDoc(collection(db, "clubs", clubId, "canchas"), {
    ...cancha,
    createdAt: serverTimestamp(),
  });
  return ref.id;
};

export const getCanchas = async (clubId) => {
  const snap = await getDocs(collection(db, "clubs", clubId, "canchas"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const actualizarCancha = async (clubId, canchaId, datos) => {
  await updateDoc(doc(db, "clubs", clubId, "canchas", canchaId), datos);
};

export const eliminarCancha = async (clubId, canchaId) => {
  await deleteDoc(doc(db, "clubs", clubId, "canchas", canchaId));
};

// --- CONFIGURACIÓN DEL CLUB ---

export const getClubConfig = async (clubId) => {
  const snap = await getDoc(doc(db, "clubs", clubId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
};

// El documento clubs/{clubId} es de lectura pública: estos campos viven en clubs/{clubId}/privado/datos
// (solo el dueño) y se borran del documento público si alguna vez estuvieron ahí.
export const CAMPOS_CLUB_PRIVADOS = ["cbu", "alias", "titularCuenta", "cuit", "razonSocial", "usuarios"];

export const actualizarClubConfig = async (clubId, datos) => {
  const publicos = { ...datos };
  CAMPOS_CLUB_PRIVADOS.forEach((k) => {
    publicos[k] = deleteField();
  });
  await updateDoc(doc(db, "clubs", clubId), publicos);
};

export const getClubPrivado = async (clubId) => {
  const snap = await getDoc(doc(db, "clubs", clubId, "privado", "datos"));
  return snap.exists() ? snap.data() : {};
};

export const actualizarClubPrivado = async (clubId, datos) => {
  await setDoc(
    doc(db, "clubs", clubId, "privado", "datos"),
    { ...datos, actualizadoEn: serverTimestamp() },
    { merge: true },
  );
};

// --- RESERVAS ---

// Las reservas las leen todos los jugadores con sesión (grilla de disponibilidad): el email y el teléfono de
// quien reserva viven aparte en clubs/{clubId}/contactosReservas/{reservaId}, que solo lee el club.
export const CAMPOS_CONTACTO_RESERVA = ["email", "telefono"];

const contactoReservaRef = (clubId, reservaId) => doc(db, "clubs", clubId, "contactosReservas", reservaId);

function separarContactoReserva(reserva) {
  const publica = { ...reserva };
  const contacto = {};
  CAMPOS_CONTACTO_RESERVA.forEach((k) => {
    if (publica[k] !== undefined) {
      if (publica[k]) contacto[k] = publica[k];
      delete publica[k];
    }
  });
  return { publica, contacto };
}

// Id determinístico por turno: una cancha + fecha + hora = un solo documento posible
export const slotId = (canchaId, fecha, hora) => `${canchaId}_${fecha}_${hora.replace(":", "")}`;

export class SlotTakenError extends Error {
  constructor() {
    super("SLOT_TAKEN");
    this.code = "SLOT_TAKEN";
  }
}

// Crea la reserva dentro de una transacción: si el turno ya tiene una reserva no cancelada, falla con
// SlotTakenError (evita la doble reserva). El contacto va en la misma transacción a contactosReservas:
// siempre que reserva un jugador (pisa el de una reserva cancelada anterior en el mismo turno); si reserva
// el club, solo cuando cargó algún dato (un bloqueo borra el contacto viejo del turno).
export const crearReserva = async (clubId, reserva) => {
  const { publica, contacto } = separarContactoReserva(reserva);
  const ref = doc(db, "clubs", clubId, "reservas", slotId(publica.canchaId, publica.fecha, publica.hora));
  const contactoRef = contactoReservaRef(clubId, ref.id);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists() && snap.data().status !== "cancelada") throw new SlotTakenError();
    tx.set(ref, { ...publica, createdAt: serverTimestamp() });
    if (publica.jugadorUid || Object.keys(contacto).length > 0) {
      tx.set(contactoRef, {
        jugadorUid: publica.jugadorUid || null,
        nombreJugador: publica.nombreJugador || "",
        canchaId: publica.canchaId,
        fecha: publica.fecha,
        hora: publica.hora,
        email: contacto.email || "",
        telefono: contacto.telefono || "",
        createdAt: serverTimestamp(),
      });
    } else {
      tx.delete(contactoRef);
    }
  });
  return ref.id;
};

// Contactos de las reservas del club ({ [reservaId]: { email, telefono } }), solo el club
export const getContactosReservas = async (clubId) => {
  const snap = await getDocs(collection(db, "clubs", clubId, "contactosReservas"));
  const porId = {};
  snap.docs.forEach((d) => {
    const c = d.data();
    porId[d.id] = { email: c.email || "", telefono: c.telefono || "" };
  });
  return porId;
};

// Reservas del club: de una fecha, o todas ordenadas por fecha. Con { contactos: true } (solo el club)
// suma el email y el teléfono de cada una desde contactosReservas.
export const getReservas = async (clubId, fecha, { contactos = false } = {}) => {
  const q = fecha
    ? query(
        collection(db, "clubs", clubId, "reservas"),
        where("fecha", "==", fecha),
      )
    : query(
        collection(db, "clubs", clubId, "reservas"),
        orderBy("fecha", "asc"),
      );
  const snap = await getDocs(q);
  const reservas = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (!contactos) return reservas;
  const porId = await getContactosReservas(clubId);
  return reservas.map((r) => ({ ...r, ...(porId[r.id] || {}) }));
};

// Reservas pendientes de aprobación de todas las fechas (índice compuesto status + fecha)
export const getReservasPendientes = async (clubId) => {
  const q = query(
    collection(db, "clubs", clubId, "reservas"),
    where("status", "==", "pendiente"),
    orderBy("fecha", "asc"),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const actualizarReserva = async (clubId, reservaId, datos) => {
  await updateDoc(doc(db, "clubs", clubId, "reservas", reservaId), datos);
};

export const eliminarReserva = async (clubId, reservaId) => {
  await deleteDoc(doc(db, "clubs", clubId, "reservas", reservaId));
  await deleteDoc(contactoReservaRef(clubId, reservaId));
};

// Próxima reserva del jugador (misma consulta de grupo que "Mis reservas"), o null
export const getProximaReservaJugador = async (uid) => {
  const q = query(collectionGroup(db, "reservas"), where("jugadorUid", "==", uid));
  const snap = await getDocs(q);
  const hoy = getTodayLocal();
  const horaAhora = horaActualStr();
  const proximas = snap.docs
    .map((d) => ({ id: d.id, clubId: d.ref.parent.parent.id, ...d.data() }))
    .filter(
      (r) =>
        r.status !== "cancelada" &&
        r.fecha &&
        (r.fecha > hoy || (r.fecha === hoy && (r.hora || "") >= horaAhora)),
    )
    .sort((a, b) => (a.fecha + (a.hora || "")).localeCompare(b.fecha + (b.hora || "")));
  const proxima = proximas[0];
  if (!proxima) return null;
  try {
    const clubSnap = await getDoc(doc(db, "clubs", proxima.clubId));
    proxima.clubNombre = clubSnap.exists() ? clubSnap.data().nombre || "" : "";
  } catch (err) {
    console.error("Error cargando el club de la próxima reserva:", err);
    proxima.clubNombre = "";
  }
  return proxima;
};

// --- CANCHAS PÚBLICAS (para el hub del jugador) ---

export const getClubesConCanchas = async () => {
  const snap = await getDocs(collection(db, "clubs"));
  const clubes = [];
  for (const d of snap.docs) {
    const canchasSnap = await getDocs(collection(db, "clubs", d.id, "canchas"));
    if (canchasSnap.docs.length > 0) {
      clubes.push({
        id: d.id,
        ...d.data(),
        canchas: canchasSnap.docs.map((c) => ({ id: c.id, ...c.data() })),
      });
    }
  }
  return clubes;
};
export const getClubByOwner = async (userId) => {
  const q = query(collection(db, "clubs"), where("ownerUid", "==", userId));
  const snap = await getDocs(q);
  if (snap.docs.length === 0) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
};
// --- TURNOS FIJOS ---

// Los turnos fijos los leen los jugadores con sesión (grilla): el teléfono del cliente vive en
// clubs/{clubId}/privado/turnosFijos ({ [turnoId]: { telefono } }), que solo lee el club.
const privadoTurnosRef = (clubId) => doc(db, "clubs", clubId, "privado", "turnosFijos");

function separarTelefono(turnoFijo) {
  const publico = { ...turnoFijo };
  const telefono = publico.telefono;
  delete publico.telefono;
  return { publico, telefono };
}

export const crearTurnoFijo = async (clubId, turnoFijo) => {
  const { publico, telefono } = separarTelefono(turnoFijo);
  const ref = await addDoc(collection(db, "clubs", clubId, "turnosFijos"), {
    ...publico,
    status: "activo",
    createdAt: serverTimestamp(),
  });
  if (telefono !== undefined) {
    await setDoc(privadoTurnosRef(clubId), { [ref.id]: { telefono: telefono || "" } }, { merge: true });
  }
  return ref.id;
};

// Con { contactos: true } (solo el club) suma el teléfono de cada turno desde privado/turnosFijos
export const getTurnosFijos = async (clubId, { contactos = false } = {}) => {
  const snap = await getDocs(collection(db, "clubs", clubId, "turnosFijos"));
  const turnos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (!contactos) return turnos;
  const privado = await getDoc(privadoTurnosRef(clubId));
  const telefonos = privado.exists() ? privado.data() : {};
  return turnos.map((t) => ({ ...t, telefono: telefonos[t.id]?.telefono || "" }));
};

export const actualizarTurnoFijo = async (clubId, turnoFijoId, datos) => {
  const { publico, telefono } = separarTelefono(datos);
  if (Object.keys(publico).length > 0) {
    await updateDoc(doc(db, "clubs", clubId, "turnosFijos", turnoFijoId), publico);
  }
  if (telefono !== undefined) {
    await setDoc(privadoTurnosRef(clubId), { [turnoFijoId]: { telefono: telefono || "" } }, { merge: true });
  }
};

// Borra el turno y su teléfono; si no queda ningún otro teléfono, también el documento privado
export const eliminarTurnoFijo = async (clubId, turnoFijoId) => {
  await deleteDoc(doc(db, "clubs", clubId, "turnosFijos", turnoFijoId));
  const ref = privadoTurnosRef(clubId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const otros = Object.keys(snap.data()).filter((k) => k !== turnoFijoId && k !== "migradoEn");
  if (otros.length === 0) await deleteDoc(ref);
  else await updateDoc(ref, { [turnoFijoId]: deleteField() });
};
