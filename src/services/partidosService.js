import { collection, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../lib/firebase";

// Partidos abiertos (P3-15): todo lo que cambia pasa por Functions; el índice público partidosAbiertos/{reservaId}
// se lee sin sesión. Sin el índice (antes del deploy) las listas quedan vacías.
const llamar = (nombre) => async (datos) => (await httpsCallable(functions, nombre)(datos)).data;
export const abrirPartido = llamar("abrirPartido"); // { clubId, reservaId, faltan, nivel, nota }
export const cerrarPartido = llamar("cerrarPartido"); // { clubId, reservaId }
export const sumarmePartido = llamar("sumarmePartido"); // { clubId, reservaId } → { grupoId }
export const quitarDePartido = llamar("quitarDePartido"); // { clubId, reservaId, uid? }

// Próximos partidos abiertos (hoy y los próximos 7 días), del más cercano al más lejano
export const getPartidosAbiertos = async ({ clubId = null } = {}) => {
  const ahora = Date.now();
  const hasta = ahora + 8 * 24 * 60 * 60 * 1000;
  try {
    const q = clubId ? query(collection(db, "partidosAbiertos"), where("clubId", "==", clubId)) : query(collection(db, "partidosAbiertos"), where("inicioMs", ">", ahora), orderBy("inicioMs"), limit(40));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((p) => p.inicioMs > ahora && p.inicioMs < hasta && p.libres > 0)
      .sort((a, b) => a.inicioMs - b.inicioMs);
  } catch {
    return [];
  }
};
