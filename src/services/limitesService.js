import { doc, getDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { minutosParaReintentar, siguienteLimite } from "../utils/limites";

// Límites de frecuencia (P3-12): el contador users/{uid}/limites/{tipo} va en la misma transacción/batch que la
// reserva o la inscripción del jugador; las reglas lo exigen. Si las reglas todavía no conocen los límites (antes
// del deploy) leer el contador da permission-denied: se reintenta una vez sin él (conReintentoSinLimite).

export class LimiteError extends Error {
  constructor(tipo, minutos) {
    super(tipo === "inscripciones" ? `Mandaste muchas inscripciones seguidas. Probá de nuevo en ${minutos} min.` : `Hiciste muchas reservas seguidas. Probá de nuevo en ${minutos} min.`);
    this.code = "LIMITE";
    this.minutos = minutos;
  }
}

const ref = (uid, tipo) => doc(db, "users", uid, "limites", tipo);
const leer = (snap) => (snap.exists() ? { ventanaInicio: snap.data().ventanaInicio?.toMillis?.() ?? null, cuenta: snap.data().cuenta, crudo: snap.data() } : null);

// Lo que hay que escribir dado el contador actual; lanza LimiteError si se pasa
function datosDelLimite(actual, tipo) {
  const ahora = Date.now();
  const r = siguienteLimite(actual, ahora, tipo);
  if (r.excede) throw new LimiteError(tipo, minutosParaReintentar(actual, ahora));
  return r.nuevaVentana
    ? { ventanaInicio: serverTimestamp(), cuenta: 1, actualizadoEn: serverTimestamp() }
    : { ventanaInicio: actual.crudo.ventanaInicio, cuenta: r.cuenta, actualizadoEn: serverTimestamp() };
}

// En una transacción: lee el contador (antes de cualquier escritura) y devuelve la función que lo escribe
export async function limiteEnTx(tx, uid, tipo) {
  const r = ref(uid, tipo);
  const datos = datosDelLimite(leer(await tx.get(r)), tipo);
  return () => tx.set(r, datos);
}

// En un batch: lee el contador antes (las reglas igual validan la cuenta) y lo agrega al batch
export async function limiteEnBatch(batch, uid, tipo) {
  const r = ref(uid, tipo);
  batch.set(r, datosDelLimite(leer(await getDoc(r)), tipo));
}

// Corre fn(true) (con contador); si las reglas lo rechazan por permisos, una vez fn(false) (sin contador). Un
// LimiteError o cualquier otro error se propaga.
export async function conReintentoSinLimite(fn) {
  try {
    return await fn(true);
  } catch (err) {
    if (err?.code === "permission-denied") return fn(false);
    throw err;
  }
}
