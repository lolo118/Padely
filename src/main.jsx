import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import "./index.css";
import "./lib/installPrompt";
import App from "./App.jsx";
import ErrorBoundary, { ErrorFallback } from "./components/ErrorBoundary.jsx";

// Service worker (autoUpdate): cuando se activa una versión nueva, la página se recarga sola, así nunca
// queda un index.html viejo pidiendo chunks que ya no existen.
registerSW({ immediate: true });

// Si igual un index.html viejo pide un chunk que ya no está (deploy en el medio de una visita), se recarga la
// página en vez de caer al ErrorBoundary: como mucho una vez cada 10 segundos (la marca guarda cuándo fue la
// última recarga), así un chunk que sigue sin estar no entra en bucle y el segundo error llega al ErrorBoundary.
const CLAVE_RECARGA_CHUNK = "padely-reload-chunk";
const VENTANA_RECARGA_MS = 10000;
window.addEventListener("vite:preloadError", (e) => {
  let ultima = 0;
  try {
    ultima = Number(sessionStorage.getItem(CLAVE_RECARGA_CHUNK)) || 0;
  } catch {
    // sin sessionStorage (modo privado): se recarga igual una vez
  }
  if (Date.now() - ultima < VENTANA_RECARGA_MS) return;
  e.preventDefault();
  try {
    sessionStorage.setItem(CLAVE_RECARGA_CHUNK, String(Date.now()));
  } catch {
    // sin marca posible: igual recargamos
  }
  window.location.reload();
});

// Sentry es opcional: solo se carga e inicializa si VITE_SENTRY_DSN está definida.
// Con o sin Sentry, la app queda envuelta en un ErrorBoundary con el mismo mensaje en español.
async function arrancar() {
  let Boundary = ErrorBoundary;
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (dsn) {
    // Sentry.init corre apenas llega el módulo, aunque sea tarde; el render no espera más de 4 segundos
    const carga = import("@sentry/react").then((Sentry) => {
      Sentry.init({ dsn, environment: import.meta.env.MODE, tracesSampleRate: 0 });
      return Sentry;
    });
    carga.catch((err) => console.error("No se pudo iniciar Sentry:", err));
    try {
      const Sentry = await Promise.race([
        carga,
        new Promise((_, reject) => setTimeout(() => reject(new Error("Sentry tardó demasiado en cargar")), 4000)),
      ]);
      Boundary = function SentryBoundary({ children }) {
        return <Sentry.ErrorBoundary fallback={<ErrorFallback />}>{children}</Sentry.ErrorBoundary>;
      };
    } catch (err) {
      console.error("Se usa el ErrorBoundary propio:", err);
    }
  }

  createRoot(document.getElementById("root")).render(
    <StrictMode>
      <Boundary>
        <App />
      </Boundary>
    </StrictMode>,
  );
}

arrancar();
