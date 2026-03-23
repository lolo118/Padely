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
