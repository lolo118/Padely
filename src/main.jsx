import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import ErrorBoundary, { ErrorFallback } from "./components/ErrorBoundary.jsx";

// Sentry es opcional: solo se carga e inicializa si VITE_SENTRY_DSN está definida.
// Con o sin Sentry, la app queda envuelta en un ErrorBoundary con el mismo mensaje en español.
async function arrancar() {
  let Boundary = ErrorBoundary;
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (dsn) {
    try {
      const Sentry = await import("@sentry/react");
      Sentry.init({ dsn, environment: import.meta.env.MODE, tracesSampleRate: 0 });
      Boundary = function SentryBoundary({ children }) {
        return <Sentry.ErrorBoundary fallback={<ErrorFallback />}>{children}</Sentry.ErrorBoundary>;
      };
    } catch (err) {
      console.error("No se pudo iniciar Sentry:", err);
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
