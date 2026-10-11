// Captura beforeinstallprompt lo antes posible (se importa desde main.jsx): Chrome lo dispara una sola vez
// por carga y normalmente antes de que se monte el layout del jugador, donde vive el banner "Instalá Padely".
let evento = null;
const suscriptores = new Set();

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    evento = e;
    suscriptores.forEach((fn) => fn(e));
  });
  window.addEventListener("appinstalled", () => {
    evento = null;
    suscriptores.forEach((fn) => fn(null));
  });
}

// El evento pendiente (o null si todavía no se disparó, ya se usó o la app ya está instalada)
export function getInstallPrompt() {
  return evento;
}

// Marca el evento como usado (solo se puede llamar prompt() una vez)
export function consumirInstallPrompt() {
  evento = null;
}

// Avisa cuando llega (o se invalida) el evento. Devuelve la función para desuscribirse.
export function suscribirInstallPrompt(fn) {
  suscriptores.add(fn);
  return () => suscriptores.delete(fn);
}
