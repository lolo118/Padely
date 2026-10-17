// IMPORTANT: Firebase rules needed for notifications:
// match /users/{userId}/notifications/{notifId} {
//   allow read: if request.auth != null && request.auth.uid == userId;
//   allow create: if request.auth != null;
//   allow update: if request.auth != null && request.auth.uid == userId;
// }

import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  updateDoc,
  doc,
  serverTimestamp,
  limit,
  writeBatch,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { formatDiaCorto } from "../utils/formatDate";

export const crearNotificacion = async (uid, notificacion) => {
  try {
    await addDoc(collection(db, "users", uid, "notifications"), {
      ...notificacion,
      leida: false,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.error("Error creando notificación:", err);
  }
};

export const getNotificaciones = async (uid) => {
  try {
    const q = query(
      collection(db, "users", uid, "notifications"),
      orderBy("createdAt", "desc"),
      limit(20)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error("Error obteniendo notificaciones:", err);
    return [];
  }
};

export const getNoLeidas = async (uid) => {
  try {
    const q = query(
      collection(db, "users", uid, "notifications"),
      where("leida", "==", false)
    );
    const snap = await getDocs(q);
    return snap.size;
  } catch (err) {
    console.error("Error contando no leídas:", err);
    return 0;
  }
};

export const marcarLeida = async (uid, notifId) => {
  try {
    await updateDoc(doc(db, "users", uid, "notifications", notifId), {
      leida: true,
    });
  } catch (err) {
    console.error("Error marcando leída:", err);
  }
};

export const marcarTodasLeidas = async (uid) => {
  try {
    const q = query(
      collection(db, "users", uid, "notifications"),
      where("leida", "==", false)
    );
    const snap = await getDocs(q);
    const batch = writeBatch(db);
    snap.docs.forEach((d) => {
      batch.update(d.ref, { leida: true });
    });
    await batch.commit();
  } catch (err) {
    console.error("Error marcando todas leídas:", err);
  }
};

// --- Helper functions for specific notification types ---

export const notificarReservaConfirmada = async (jugadorUid, clubNombre, cancha, fecha, hora) => {
  await crearNotificacion(jugadorUid, {
    tipo: "reserva_confirmada",
    titulo: "Reserva confirmada",
    mensaje: `Tu reserva en ${clubNombre} (${cancha}, ${fecha} ${hora}) fue confirmada.`,
    link: "/mis-reservas",
    icono: "✅",
  });
};

export const notificarReservaRechazada = async (jugadorUid, clubNombre, cancha, fecha, hora) => {
  await crearNotificacion(jugadorUid, {
    tipo: "reserva_rechazada",
    titulo: "Reserva rechazada",
    mensaje: `Tu reserva en ${clubNombre} (${cancha}, ${fecha} ${hora}) fue rechazada.`,
    link: "/mis-reservas",
    icono: "❌",
  });
};

export const notificarReservaCanceladaPorJugador = async (ownerUid, nombreJugador, cancha, fecha, hora) => {
  await crearNotificacion(ownerUid, {
    tipo: "reserva_cancelada_jugador",
    titulo: "Reserva cancelada por el jugador",
    mensaje: `${nombreJugador || "Un jugador"} canceló su reserva de ${cancha} (${fecha} ${hora}).`,
    link: "/admin/canchas",
    icono: "🚫",
  });
};

export const notificarNuevaReserva = async (clubOwnerUid, jugadorNombre, cancha, fecha, hora) => {
  await crearNotificacion(clubOwnerUid, {
    tipo: "nueva_reserva",
    titulo: "Nueva reserva",
    mensaje: `${jugadorNombre} reservó ${cancha} para el ${fecha} a las ${hora}.`,
    link: "/admin/canchas",
    icono: "📅",
  });
};

export const notificarInscripcionTorneo = async (organizadorUid, jugadorNombre, torneoNombre, torneoId) => {
  await crearNotificacion(organizadorUid, {
    tipo: "nueva_inscripcion",
    titulo: "Nueva inscripción",
    mensaje: `${jugadorNombre} se inscribió al torneo "${torneoNombre}".`,
    link: `/t/${torneoId}`,
    icono: "📝",
  });
};

export const notificarInscripcionConfirmada = async (uid, torneoNombre, torneoId) => {
  await crearNotificacion(uid, {
    tipo: "inscripcion_confirmada",
    titulo: "Inscripción confirmada",
    mensaje: `Tu inscripción al torneo "${torneoNombre}" fue confirmada por el organizador.`,
    link: `/torneos/${torneoId}`,
    icono: "✅",
  });
};

export const notificarInscripcionRechazada = async (uid, torneoNombre, torneoId, motivo) => {
  await crearNotificacion(uid, {
    tipo: "inscripcion_rechazada",
    titulo: "Inscripción rechazada",
    mensaje: `Tu inscripción al torneo "${torneoNombre}" fue rechazada${motivo ? `. Motivo: ${motivo}` : "."}`,
    link: `/torneos/${torneoId}`,
    icono: "❌",
  });
};

export const notificarReclamoContra = async (jugadorUid, torneoNombre, torneoId) => {
  await crearNotificacion(jugadorUid, {
    tipo: "reclamo",
    titulo: "Reclamo en tu contra",
    mensaje: `Abrieron un reclamo contra tu pareja en el torneo "${torneoNombre}". Podés dejar un descargo.`,
    link: `/torneos/${torneoId}`,
    icono: "⚠️",
  });
};

export const notificarNuevoReclamo = async (organizadorUid, torneoNombre, torneoId) => {
  await crearNotificacion(organizadorUid, {
    tipo: "nuevo_reclamo",
    titulo: "Nuevo reclamo",
    mensaje: `Se abrió un nuevo reclamo en el torneo "${torneoNombre}".`,
    link: `/t/${torneoId}`,
    icono: "⚠️",
  });
};

export const notificarResultadoCargado = async (jugadorUid, torneoNombre, torneoId) => {
  await crearNotificacion(jugadorUid, {
    tipo: "resultado_cargado",
    titulo: "Resultado cargado",
    mensaje: `Se cargó un resultado en tu partido del torneo "${torneoNombre}".`,
    link: `/torneos/${torneoId}`,
    icono: "🎾",
  });
};

// cancha es el nombre de la cancha ("Cancha 2"); un valor solo numérico (datos viejos) se muestra como "Cancha N".
// dia ("YYYY-MM-DD") es opcional: con él el mensaje dice el día.
export const notificarPartidoListo = async (jugadorUid, torneoNombre, torneoId, hora, cancha, rival, dia) => {
  const nombreCancha = cancha ? (/^\d+$/.test(String(cancha).trim()) ? `Cancha ${String(cancha).trim()}` : cancha) : "";
  const cuando = dia ? `el ${formatDiaCorto(dia)} a las ${hora}` : `a las ${hora}`;
  await crearNotificacion(jugadorUid, {
    tipo: "partido_listo",
    titulo: "¡Tu partido está listo!",
    mensaje: `${torneoNombre}: jugás ${cuando}${nombreCancha ? ` en ${nombreCancha}` : ""} contra ${rival}.`,
    link: `/torneos/${torneoId}`,
    icono: "🎾",
  });
};

// --- Sede del torneo (vínculo torneo–club) ---

// Al dueño del club: un organizador pide jugar su torneo en el club
export const notificarSolicitudSede = async (ownerUid, torneoNombre, organizadorNombre, torneoId) => {
  await crearNotificacion(ownerUid, {
    tipo: "solicitud_sede",
    titulo: "Pedido de sede",
    mensaje: `${organizadorNombre || "Un organizador"} quiere jugar el torneo "${torneoNombre}" en tu club.`,
    link: "/admin/torneos?tab=solicitudes",
    torneoId,
  });
};

// Al organizador: el club aceptó o rechazó ser sede
export const notificarSedeRespondida = async (organizerUid, clubNombre, estado, torneoId) => {
  const acepto = estado === "aceptado";
  await crearNotificacion(organizerUid, {
    tipo: "sede_respondida",
    titulo: acepto ? "Sede confirmada" : "Sede rechazada",
    mensaje: acepto
      ? `${clubNombre} aceptó ser la sede de tu torneo. Los partidos programados bloquean sus turnos.`
      : `${clubNombre} no puede ser la sede de tu torneo. Elegí otra sede.`,
    link: `/t/${torneoId}`,
    estado,
  });
};

// Al organizador: partidos programados sobre turnos que el club ya tenía reservados
export const notificarConflictoTurno = async (organizerUid, torneoNombre, torneoId, cantidad) => {
  const n = Number(cantidad) || 0;
  await crearNotificacion(organizerUid, {
    tipo: "conflicto_turno",
    titulo: n === 1 ? "Un turno ya reservado" : `${n} turnos ya reservados`,
    mensaje: `En "${torneoNombre}" hay ${n === 1 ? "un partido programado" : `${n} partidos programados`} en turnos que el club ya tenía reservados. Cambiá el horario o pedile al club que libere el turno.`,
    link: `/t/${torneoId}`,
  });
};
