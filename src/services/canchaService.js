import {
  collection,
  collectionGroup,
  addDoc,
  getDocs,
  getDoc,
  getCountFromServer,
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
  writeBatch,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { getTodayLocal, horaActualStr } from "../utils/formatDate";
import { horasDeReserva, sumarHoras } from "../utils/tarifas";
import { agruparReservas, mismaReserva, normalizarReserva } from "../utils/reservas";

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

// El turno de las HH:MM ya tiene una reserva viva: `hora` dice cuál (en una reserva de varias horas, la primera ocupada)
export class SlotTakenError extends Error {
  constructor(hora) {
    super(hora ? `El turno de las ${hora} ya está reservado` : "SLOT_TAKEN");
    this.code = "SLOT_TAKEN";
    this.hora = hora || null;
  }
}

// Crea la reserva dentro de una transacción. Una reserva de `turnos` horas seguidas (1 a 3) escribe un documento
// por turno (id = slotId de cada hora) con los campos del grupo: grupoId (id del primer turno), horaInicio, horaFin,
// turnos, precioTotal, precio (el de ese turno), seña (la de toda la reserva, repetida en cada slot) y señaPagada.
// La transacción lee los N turnos primero: si alguno tiene una reserva no cancelada, no escribe nada y falla con
// SlotTakenError(hora). El contacto va por turno a contactosReservas (las reglas lo atan al id de la reserva):
// siempre que reserva un jugador (pisa el de una reserva cancelada anterior en el mismo turno); si reserva el
// club, solo cuando cargó algún dato (un bloqueo borra el contacto viejo del turno).
// reserva: { canchaId, canchaName, fecha, hora, turnos?, precios?: [por turno], precio?, seña?, jugadorUid,
//            nombreJugador, email, telefono, status, ...otros }. Devuelve el grupoId.
export const crearReserva = async (clubId, reserva) => {
  const { publica, contacto } = separarContactoReserva(reserva);
  const turnos = Math.min(3, Math.max(1, Number(publica.turnos) || 1));
  const horas = horasDeReserva(publica.hora, turnos);
  const preciosPorTurno = Array.isArray(publica.precios) ? publica.precios : [];
  const precios = horas.map((_, i) => Number(preciosPorTurno[i] ?? publica.precio ?? 0) || 0);
  const precioTotal = precios.reduce((a, b) => a + b, 0);
  const seña = Math.max(0, Number(publica.seña) || 0);
  const { precios: _p, turnos: _t, ...campos } = publica;
  const refs = horas.map((h) => doc(db, "clubs", clubId, "reservas", slotId(publica.canchaId, publica.fecha, h)));
  const grupoId = refs[0].id;

  await runTransaction(db, async (tx) => {
    const snaps = [];
    for (const ref of refs) snaps.push(await tx.get(ref));
    const ocupado = snaps.findIndex((s) => s.exists() && s.data().status !== "cancelada");
    if (ocupado >= 0) throw new SlotTakenError(horas[ocupado]);
    refs.forEach((ref, i) => {
      tx.set(ref, {
        ...campos,
        hora: horas[i],
        precio: precios[i],
        grupoId,
        horaInicio: horas[0],
        horaFin: sumarHoras(horas[0], turnos),
        turnos,
        precioTotal,
        seña,
        señaPagada: false,
        createdAt: serverTimestamp(),
      });
      const contactoRef = contactoReservaRef(clubId, ref.id);
      if (campos.jugadorUid || Object.keys(contacto).length > 0) {
        tx.set(contactoRef, {
          jugadorUid: campos.jugadorUid || null,
          nombreJugador: campos.nombreJugador || "",
          canchaId: campos.canchaId,
          fecha: campos.fecha,
          hora: horas[i],
          email: contacto.email || "",
          telefono: contacto.telefono || "",
          createdAt: serverTimestamp(),
        });
      } else {
        tx.delete(contactoRef);
      }
    });
  });
  return grupoId;
};

// Los slots de una reserva (por grupoId); una reserva vieja sin grupoId es su propio documento
// Un slot cancelado de una reserva anterior puede conservar el mismo grupoId (el id del primer turno se reutiliza
// al volver a reservar esa hora): solo cuentan los slots que son de la misma reserva que la cabeza del grupo.
const slotsDelGrupo = async (clubId, grupoId) => {
  const col = collection(db, "clubs", clubId, "reservas");
  const cabezaRef = doc(col, grupoId);
  const [cabezaSnap, snap] = await Promise.all([getDoc(cabezaRef), getDocs(query(col, where("grupoId", "==", grupoId)))]);
  const cabeza = cabezaSnap.exists() ? { id: cabezaSnap.id, ...cabezaSnap.data() } : null;
  const refs = snap.docs
    .filter((d) => !cabeza || mismaReserva(cabeza, { id: d.id, ...d.data() }))
    .map((d) => d.ref);
  if (refs.length > 0) return refs;
  return [cabezaRef];
};

// Actualiza TODOS los turnos de una reserva en un batch (status, seña cobrada, etc.). La usan el club y el jugador
// (el jugador solo puede cancelar: { status: "cancelada" }, como dicen las reglas).
export const actualizarReservaGrupo = async (clubId, grupoId, datos) => {
  const refs = await slotsDelGrupo(clubId, grupoId);
  const batch = writeBatch(db);
  refs.forEach((ref) => batch.update(ref, datos));
  await batch.commit();
  return refs.length;
};

export const cancelarReservaGrupo = (clubId, grupoId, extra = {}) =>
  actualizarReservaGrupo(clubId, grupoId, { status: "cancelada", ...extra });

// Marca (o desmarca) la seña como cobrada en todos los turnos de la reserva
export const marcarSeñaPagada = (clubId, grupoId, pagada = true) =>
  actualizarReservaGrupo(clubId, grupoId, { señaPagada: !!pagada });

// Borra todos los turnos de una reserva y sus contactos
export const eliminarReservaGrupo = async (clubId, grupoId) => {
  const refs = await slotsDelGrupo(clubId, grupoId);
  const batch = writeBatch(db);
  refs.forEach((ref) => {
    batch.delete(ref);
    batch.delete(contactoReservaRef(clubId, ref.id));
  });
  await batch.commit();
  return refs.length;
};

// Reservas agrupadas (una por grupoId) a partir de la lista de slots de getReservas
export const getReservasAgrupadas = async (clubId, fecha, opciones) => agruparReservas(await getReservas(clubId, fecha, opciones));

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

// Próxima reserva del jugador (misma consulta de grupo que "Mis reservas"), agrupada (horaInicio – horaFin,
// precioTotal, seña), o null
export const getProximaReservaJugador = async (uid) => {
  const q = query(collectionGroup(db, "reservas"), where("jugadorUid", "==", uid));
  const snap = await getDocs(q);
  const hoy = getTodayLocal();
  const horaAhora = horaActualStr();
  const slots = snap.docs
    .map((d) => normalizarReserva({ id: d.id, clubId: d.ref.parent.parent.id, ...d.data() }))
    .filter((r) => r.status !== "cancelada" && r.fecha);
  const proximas = agruparReservas(slots).filter(
    (r) => r.fecha > hoy || (r.fecha === hoy && (r.horaFin || r.hora || "") > horaAhora),
  );
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
// Clubes para el selector de sede de un torneo ({ id, nombre, ciudad, provincia, cantidadCanchas }), cacheados en
// el módulo durante la sesión (la lista cambia poco y se abre varias veces).
let clubesPublicosCache = null;
export const getClubesPublicos = async ({ recargar = false } = {}) => {
  if (clubesPublicosCache && !recargar) return clubesPublicosCache;
  const snap = await getDocs(collection(db, "clubs"));
  const clubes = await Promise.all(
    snap.docs.map(async (d) => {
      const data = d.data();
      let cantidadCanchas = 0;
      try {
        const cuenta = await getCountFromServer(collection(db, "clubs", d.id, "canchas"));
        cantidadCanchas = cuenta.data().count;
      } catch (err) {
        console.error("Error contando canchas del club:", err);
      }
      return {
        id: d.id,
        nombre: data.nombre || "",
        ciudad: data.ciudad || "",
        provincia: data.provincia || "",
        cantidadCanchas,
      };
    }),
  );
  clubes.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  clubesPublicosCache = clubes;
  return clubes;
};

// Canchas de un club, para elegir las del torneo (mismo documento que getCanchas)
export const getCanchasDeClub = (clubId) => getCanchas(clubId);

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
