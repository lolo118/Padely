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
