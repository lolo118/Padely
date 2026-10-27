import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";

// Estado de la plataforma (P3-12): configuracionPadely/estado = { activo, mensaje, desde }. Lo lee cualquiera (reglas:
// lectura pública de ese documento) y lo escribe el super-admin. Si el documento no existe o no se puede leer, no
// hay aviso (nunca rompe la app).
let promesa = null;
export const getEstadoPlataforma = ({ fresco = false } = {}) => {
  if (!promesa || fresco) {
    promesa = getDoc(doc(db, "configuracionPadely", "estado"))
      .then((snap) => (snap.exists() ? snap.data() : { activo: false }))
      .catch(() => ({ activo: false }));
  }
  return promesa;
};

export const guardarEstadoPlataforma = async ({ activo, mensaje }) => {
  await setDoc(doc(db, "configuracionPadely", "estado"), { activo: !!activo, mensaje: String(mensaje || "").slice(0, 280), desde: serverTimestamp() });
  promesa = null;
};
