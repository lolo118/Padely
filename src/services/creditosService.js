import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { creditoDisponible } from "../utils/senas";

// Créditos de señas devueltas (P3-14 B): users/{uid}/creditos (solo los escriben las Functions). Sin permiso (antes
// del deploy de las reglas) o sin créditos → 0.
export const getCreditoEnClub = async (uid, clubId) => {
  if (!uid || !clubId) return 0;
  try {
    const snap = await getDocs(query(collection(db, "users", uid, "creditos"), where("clubId", "==", clubId), where("estado", "==", "disponible")));
    return creditoDisponible(snap.docs.map((d) => d.data()), clubId);
  } catch {
    return 0;
  }
};
