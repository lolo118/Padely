import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";

// Estado de la plataforma (P3-12): configuracionPadely/estado = { activo, mensaje, desde }. Lo lee cualquiera (reglas:
// lectura pública de ese documento) y lo escribe el super-admin. Si el documento no existe o no se puede leer, no
// hay aviso (nunca rompe la app).
let promesa = null;
// Con la red lenta o sin conexión, a los 4 s se da por "sin aviso" (la página /estado nunca queda en blanco)
const ESPERA_MS = 4000;
export const getEstadoPlataforma = ({ fresco = false } = {}) => {
  if (!promesa || fresco) {
    const lectura = getDoc(doc(db, "configuracionPadely", "estado"))
      .then((snap) => (snap.exists() ? snap.data() : { activo: false }))
      .catch(() => ({ activo: false }));
    promesa = Promise.race([lectura, new Promise((resolver) => setTimeout(() => resolver({ activo: false, sinRespuesta: true }), ESPERA_MS))]);
  }
  return promesa;
};

export const guardarEstadoPlataforma = async ({ activo, mensaje }) => {
  await setDoc(doc(db, "configuracionPadely", "estado"), { activo: !!activo, mensaje: String(mensaje || "").slice(0, 280), desde: serverTimestamp() });
  promesa = null;
};
