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
    link: `/admin/torneos/${torneoId}`,
    icono: "📝",
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
    link: `/admin/torneos/${torneoId}`,
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

export const notificarPartidoListo = async (jugadorUid, torneoNombre, torneoId, hora, cancha, rival) => {
  await crearNotificacion(jugadorUid, {
    tipo: "partido_listo",
    titulo: "¡Tu partido está listo!",
    mensaje: `${torneoNombre}: jugás a las ${hora}${cancha ? ` en Cancha ${cancha}` : ""} contra ${rival}.`,
    link: `/torneos/${torneoId}`,
    icono: "🎾",
  });
};
