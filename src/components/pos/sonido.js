// Aviso sonoro del tablero Barra: un "din-don" corto generado con la Web Audio API (sin archivo de audio).
// Los navegadores exigen un gesto del usuario antes de sonar: desbloquearAudio() se llama desde un botón.

const CLAVE = "padely-barra-sonido";
let ctx = null;

export const sonidoGuardado = () => {
  try {
    return localStorage.getItem(CLAVE) !== "0";
  } catch {
    return true;
  }
};
export const guardarSonido = (activo) => {
  try {
    localStorage.setItem(CLAVE, activo ? "1" : "0");
  } catch {
    /* sin localStorage */
  }
};

export const audioListo = () => !!ctx && ctx.state === "running";
export const EVENTO_AUDIO_LISTO = "padely-audio-listo";

// Arma el audio con el primer gesto en cualquier parte del panel (pointerdown / keydown), una sola vez; avisa con
// un evento para que el tablero deje de pedir "Activar sonido". Solo si la preferencia de sonido está activa.
let armado = false;
export function armarAudioConGesto() {
  if (armado || typeof window === "undefined" || !sonidoGuardado()) return;
  armado = true;
  const intentar = async () => {
    window.removeEventListener("pointerdown", intentar, true);
    window.removeEventListener("keydown", intentar, true);
    const ok = await desbloquearAudio();
    if (ok) window.dispatchEvent(new Event(EVENTO_AUDIO_LISTO));
    else armado = false;
  };
  window.addEventListener("pointerdown", intentar, true);
  window.addEventListener("keydown", intentar, true);
}

// Crea (o reanuda) el AudioContext; devuelve true si quedó corriendo
export async function desbloquearAudio() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return false;
    ctx = ctx || new Ctx();
    if (ctx.state === "suspended") await ctx.resume();
    return ctx.state === "running";
  } catch (err) {
    console.error("No se pudo activar el sonido:", err);
    return false;
  }
}

function tono(frecuencia, inicio, duracion) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = frecuencia;
  gain.gain.setValueAtTime(0.0001, inicio);
  gain.gain.exponentialRampToValueAtTime(0.4, inicio + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, inicio + duracion);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(inicio);
  osc.stop(inicio + duracion + 0.05);
}

// Dos notas (880 → 1175 Hz); false si el audio no está desbloqueado
export function sonarNuevoPedido() {
  if (!audioListo()) return false;
  try {
    const t = ctx.currentTime;
    tono(880, t, 0.18);
    tono(1175, t + 0.2, 0.28);
    return true;
  } catch (err) {
    console.error("No se pudo reproducir el aviso:", err);
    return false;
  }
}
