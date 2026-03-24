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

export const actualizarClubConfig = async (clubId, datos) => {
  await updateDoc(doc(db, "clubs", clubId), datos);
};

// --- RESERVAS ---

export const crearReserva = async (clubId, reserva) => {
  const ref = await addDoc(collection(db, "clubs", clubId, "reservas"), {
    ...reserva,
    createdAt: serverTimestamp(),
  });
  return ref.id;
};

export const getReservas = async (clubId, fecha) => {
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
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const actualizarReserva = async (clubId, reservaId, datos) => {
  await updateDoc(doc(db, "clubs", clubId, "reservas", reservaId), datos);
};

export const eliminarReserva = async (clubId, reservaId) => {
  await deleteDoc(doc(db, "clubs", clubId, "reservas", reservaId));
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
