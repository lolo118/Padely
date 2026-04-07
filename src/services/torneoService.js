import {
  collection,
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
} from "firebase/firestore";
import { db } from "../lib/firebase";

export const crearTorneo = async (datos, userId) => {
  const ref = await addDoc(collection(db, "tournaments"), {
    ...datos,
    organizerId: userId,
    status: "inscripcion",
    createdAt: serverTimestamp(),
  });
  return ref.id;
};

export const getTorneosByOrganizer = async (userId) => {
  const q = query(
    collection(db, "tournaments"),
    where("organizerId", "==", userId),
    orderBy("createdAt", "desc"),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const getTorneoById = async (id) => {
  const snap = await getDoc(doc(db, "tournaments", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
};

export const actualizarTorneo = async (id, datos) => {
  await updateDoc(doc(db, "tournaments", id), datos);
};

export const agregarPareja = async (torneoId, pareja) => {
  const ref = await addDoc(collection(db, "tournaments", torneoId, "pairs"), {
    ...pareja,
    createdAt: serverTimestamp(),
  });
  return ref.id;
};

export const getParejas = async (torneoId) => {
  const snap = await getDocs(collection(db, "tournaments", torneoId, "pairs"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const eliminarPareja = async (torneoId, parejaId) => {
  await deleteDoc(doc(db, "tournaments", torneoId, "pairs", parejaId));
};

export const guardarGrupos = async (torneoId, grupos) => {
  const snap = await getDocs(collection(db, "tournaments", torneoId, "groups"));
  const deletePromises = snap.docs.map((d) =>
    deleteDoc(doc(db, "tournaments", torneoId, "groups", d.id)),
  );
  await Promise.all(deletePromises);

  const createPromises = grupos.map((grupo) =>
    addDoc(collection(db, "tournaments", torneoId, "groups"), {
      ...grupo,
      createdAt: serverTimestamp(),
    }),
  );
  const refs = await Promise.all(createPromises);
  return refs.map((r) => r.id);
};

export const getGrupos = async (torneoId) => {
  const snap = await getDocs(collection(db, "tournaments", torneoId, "groups"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const actualizarGrupo = async (torneoId, grupoId, datos) => {
  await updateDoc(doc(db, "tournaments", torneoId, "groups", grupoId), datos);
};

// ✅ Modificadas: almacenan el bracket como JSON string
export const guardarBracket = async (torneoId, bracket) => {
  const ref = doc(db, "tournaments", torneoId);
  await updateDoc(ref, { bracketJson: JSON.stringify(bracket) });
};

export const getBracket = async (torneoId) => {
  const snap = await getDoc(doc(db, "tournaments", torneoId));
  if (!snap.exists()) return null;
  const data = snap.data();
  if (data.bracketJson) return JSON.parse(data.bracketJson);
  return null;
};
export const crearSolicitudInscripcion = async (torneoId, solicitud) => {
  const ref = await addDoc(
    collection(db, "tournaments", torneoId, "inscripciones"),
    {
      ...solicitud,
      status: "esperando_companero",
      createdAt: serverTimestamp(),
    },
  );
  return ref.id;
};

export const getInscripciones = async (torneoId) => {
  const snap = await getDocs(
    collection(db, "tournaments", torneoId, "inscripciones"),
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const actualizarInscripcion = async (torneoId, inscripcionId, datos) => {
  await updateDoc(
    doc(db, "tournaments", torneoId, "inscripciones", inscripcionId),
    datos,
  );
};

export const getInscripcionesByJugador = async (userId) => {
  const q = query(
    collection(db, "tournaments"),
    where("inscripcionAbierta", "==", true),
  );
  const snap = await getDocs(q);
  const resultados = [];

  for (const torneoDoc of snap.docs) {
    const inscSnap = await getDocs(
      collection(db, "tournaments", torneoDoc.id, "inscripciones"),
    );
    inscSnap.docs.forEach((d) => {
      const data = d.data();
      if (data.jugador1Uid === userId || data.jugador2Uid === userId) {
        resultados.push({
          id: d.id,
          torneoId: torneoDoc.id,
          torneoNombre: torneoDoc.data().nombre,
          ...data,
        });
      }
    });
  }

  return resultados;
};

export const getTorneosPublicos = async () => {
  const q = query(
    collection(db, "tournaments"),
    where("inscripcionAbierta", "==", true),
    orderBy("createdAt", "desc"),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const getTodosLosTorneos = async () => {
  const q = query(collection(db, "tournaments"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};
// ========== RECLAMOS ==========

export const crearReclamo = async (torneoId, reclamo) => {
  const ref = await addDoc(
    collection(db, "tournaments", torneoId, "reclamos"),
    {
      ...reclamo,
      estado: "abierto",
      adheridos: [],
      descargo: null,
      decision: null,
      motivoDecision: null,
      creadoEn: new Date().toISOString(),
    },
  );
  return ref.id;
};

export const getReclamos = async (torneoId) => {
  const snap = await getDocs(
    collection(db, "tournaments", torneoId, "reclamos"),
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const adherirseAReclamo = async (torneoId, reclamoId, pareja) => {
  const ref = doc(db, "tournaments", torneoId, "reclamos", reclamoId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data();
  const yaAdherido = (data.adheridos || []).some((a) => a.id === pareja.id);
  if (yaAdherido) return;
  await updateDoc(ref, {
    adheridos: [...(data.adheridos || []), pareja],
  });
};

export const dejarDescargo = async (torneoId, reclamoId, descargo) => {
  await updateDoc(doc(db, "tournaments", torneoId, "reclamos", reclamoId), {
    descargo,
  });
};

export const resolverReclamo = async (
  torneoId,
  reclamoId,
  decision,
  motivoDecision,
) => {
  await updateDoc(doc(db, "tournaments", torneoId, "reclamos", reclamoId), {
    estado: "resuelto",
    decision,
    motivoDecision,
    resueltaEn: new Date().toISOString(),
  });
};

// ========== SISTEMA DE PUNTOS Y RANKING ==========

const CATEGORIAS_ORDEN = ["8va", "7ma", "6ta", "5ta", "4ta", "3era", "2da", "1era", "Libre"];

const PUNTOS = {
  ganarPartido: 10,
  ganarSet: 3,
  perderPartido: 2,
  campeon: 50,
  subcampeon: 25,
};

function getMultiplicadorCategoria(categoriaJugador, categoriaTorneo) {
  const idxJugador = CATEGORIAS_ORDEN.indexOf(categoriaJugador);
  const idxTorneo = CATEGORIAS_ORDEN.indexOf(categoriaTorneo);
  if (idxJugador === -1 || idxTorneo === -1) return 1;
  const diff = idxTorneo - idxJugador;
  if (diff >= 2) return 2;
  if (diff === 1) return 1.5;
  return 1;
}

export function puedeInscribirse(categoriaJugador, categoriaTorneo) {
  const idxJugador = CATEGORIAS_ORDEN.indexOf(categoriaJugador);
  const idxTorneo = CATEGORIAS_ORDEN.indexOf(categoriaTorneo);
  if (idxJugador === -1 || idxTorneo === -1) return true;
  // No puede inscribirse en categoría menor
  return idxTorneo >= idxJugador;
}

export const actualizarPuntosPartido = async (jugadorUid, setsGanados, ganoPartido, categoriaTorneo) => {
  if (!jugadorUid) return;
  try {
    const userRef = doc(db, "users", jugadorUid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) return;
    const data = snap.data();

    const multiplicador = getMultiplicadorCategoria(data.nivel || "8va", categoriaTorneo || "8va");

    let puntosPartido = 0;
    puntosPartido += setsGanados * PUNTOS.ganarSet;
    puntosPartido += ganoPartido ? PUNTOS.ganarPartido : PUNTOS.perderPartido;
    puntosPartido = Math.round(puntosPartido * multiplicador);

    const updates = {
      puntos: (data.puntos || 0) + puntosPartido,
      partidosGanados: (data.partidosGanados || 0) + (ganoPartido ? 1 : 0),
      partidosPerdidos: (data.partidosPerdidos || 0) + (ganoPartido ? 0 : 1),
    };

    await updateDoc(userRef, updates);
  } catch (err) {
    console.error("Error actualizando puntos:", err);
  }
};

export const actualizarPuntosTorneo = async (jugadorUid, posicion, categoriaTorneo) => {
  if (!jugadorUid) return;
  try {
    const userRef = doc(db, "users", jugadorUid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) return;
    const data = snap.data();

    const multiplicador = getMultiplicadorCategoria(data.nivel || "8va", categoriaTorneo || "8va");

    let bonus = 0;
    if (posicion === 1) bonus = Math.round(PUNTOS.campeon * multiplicador);
    else if (posicion === 2) bonus = Math.round(PUNTOS.subcampeon * multiplicador);

    const torneosGanadosEnCategoria = (data.torneosGanadosEnCategoria || 0) + (posicion === 1 ? 1 : 0);

    const updates = {
      puntos: (data.puntos || 0) + bonus,
      torneosJugados: (data.torneosJugados || 0) + 1,
      torneosGanados: (data.torneosGanados || 0) + (posicion === 1 ? 1 : 0),
      torneosGanadosEnCategoria,
    };

    await updateDoc(userRef, updates);

    // Evaluar ascenso
    await evaluarAscenso(jugadorUid);
  } catch (err) {
    console.error("Error actualizando puntos torneo:", err);
  }
};

// ========== VINCULACIÓN DE JUGADORES ==========

export const vincularJugadorAPareja = async (torneoId, parejaId, posicion, uid) => {
  const ref = doc(db, "tournaments", torneoId, "pairs", parejaId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return false;
  const campo = posicion === 1 ? "jugador1Uid" : "jugador2Uid";
  await updateDoc(ref, { [campo]: uid });
  return true;
};

export const getParejaById = async (torneoId, parejaId) => {
  const snap = await getDoc(doc(db, "tournaments", torneoId, "pairs", parejaId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
};

export const evaluarAscenso = async (jugadorUid) => {
  try {
    const userRef = doc(db, "users", jugadorUid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) return;
    const data = snap.data();

    const categoriaActual = data.nivel || "";
    const puntos = data.puntos || 0;
    const torneosGanadosEnCategoria = data.torneosGanadosEnCategoria || 0;

    const idxActual = CATEGORIAS_ORDEN.indexOf(categoriaActual);
    if (idxActual === -1 || idxActual >= CATEGORIAS_ORDEN.length - 1) return;

    // Vía A: 150+ puntos + 2 torneos ganados en categoría
    const viaA = puntos >= 150 && torneosGanadosEnCategoria >= 2;
    // Vía B: 300+ puntos + 1 torneo ganado en categoría
    const viaB = puntos >= 300 && torneosGanadosEnCategoria >= 1;
    // Vía C: 500+ puntos sin necesidad de ganar torneos (ascenso por experiencia)
    const viaC = puntos >= 500;

    if (viaA || viaB || viaC) {
      const nuevaCategoria = CATEGORIAS_ORDEN[idxActual + 1];
      const via = viaA ? "A (puntos + victorias)" : viaB ? "B (puntos + victoria)" : "C (experiencia)";
      await updateDoc(userRef, {
        nivel: nuevaCategoria,
        torneosGanadosEnCategoria: 0,
        ascensos: [...(data.ascensos || []), {
          de: categoriaActual,
          a: nuevaCategoria,
          fecha: new Date().toISOString(),
          puntos,
          torneosGanados: torneosGanadosEnCategoria,
          via,
        }],
      });
      console.log(`Jugador ${jugadorUid} ascendió de ${categoriaActual} a ${nuevaCategoria} por vía ${via}`);
    }
  } catch (err) {
    console.error("Error evaluando ascenso:", err);
  }
};
