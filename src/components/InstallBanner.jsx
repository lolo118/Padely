import { useEffect, useState } from "react";
import { getInstallPrompt, consumirInstallPrompt, suscribirInstallPrompt } from "../lib/installPrompt";

const CLAVE_DESCARTADO = "padely-install-dismissed";

function fueDescartado() {
  try {
    return localStorage.getItem(CLAVE_DESCARTADO) === "1";
  } catch {
    return false;
  }
}

function esMobile() {
  return (
    window.matchMedia("(max-width: 767px)").matches ||
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  );
}

// iPhone/iPad (iPadOS se presenta como Mac con pantalla táctil)
function esIOS() {
  return (
    /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

// Ya abierta desde la pantalla de inicio
function esStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

const IconoCompartir = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="inline w-3.5 h-3.5 align-text-bottom"
    aria-label="Compartir"
  >
    <path d="M12 3v12" />
    <path d="M8 7l4-4 4 4" />
    <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
  </svg>
);

// Banner "Instalá Padely", solo en móvil y mientras no se lo cierre (el cierre queda en localStorage):
// - Chrome/Edge en Android: aparece cuando el navegador dispara beforeinstallprompt y el botón instala.
//   El evento se captura en src/lib/installPrompt.js desde el arranque, porque puede llegar antes de que
//   se monte este componente.
// - iPhone/iPad: no existe beforeinstallprompt en ningún navegador; se explica el camino manual
//   (Compartir → Agregar a inicio) mientras la app no esté abierta desde la pantalla de inicio.
export default function InstallBanner() {
  const [habilitado] = useState(() => !fueDescartado() && esMobile());
  const [modoIOS] = useState(() => habilitado && esIOS() && !esStandalone());
  const [promptEvent, setPromptEvent] = useState(() => (habilitado ? getInstallPrompt() : null));
  const [cerrado, setCerrado] = useState(false);

  useEffect(() => {
    if (!habilitado) return undefined;
    return suscribirInstallPrompt((e) => setPromptEvent(e));
  }, [habilitado]);

  const cerrar = () => {
    try {
      localStorage.setItem(CLAVE_DESCARTADO, "1");
    } catch {
      // sin localStorage (modo privado): solo se oculta en esta visita
    }
    setCerrado(true);
  };

  const instalar = async () => {
    if (!promptEvent) return;
    consumirInstallPrompt();
    try {
      promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      if (outcome !== "accepted") cerrar();
    } catch (err) {
      console.error("Error al instalar la app:", err);
      cerrar();
    }
    setPromptEvent(null);
  };

  if (!habilitado || cerrado) return null;

  if (modoIOS) {
    return (
      <div className="fixed left-3 right-3 bottom-[76px] z-30 md:hidden">
        <div
          className="themed-card rounded-2xl border shadow-lg px-4 py-3 flex items-center gap-3"
          style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.18)" }}
        >
          <img src="/icon-192.png" alt="" className="w-10 h-10 rounded-xl" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              Instalá Padely
            </p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Tocá <IconoCompartir /> Compartir y elegí «Agregar a inicio»
            </p>
          </div>
          <button
            onClick={cerrar}
            aria-label="Cerrar"
            className="p-1 rounded-lg transition hover:opacity-70"
            style={{ color: "var(--text-muted)" }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  if (!promptEvent) return null;

  return (
    <div className="fixed left-3 right-3 bottom-[76px] z-30 md:hidden">
      <div
        className="themed-card rounded-2xl border shadow-lg px-4 py-3 flex items-center gap-3"
        style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.18)" }}
      >
        <img src="/icon-192.png" alt="" className="w-10 h-10 rounded-xl" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Instalá Padely
          </p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Acceso directo en tu pantalla de inicio
          </p>
        </div>
        <button
          onClick={instalar}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition hover:opacity-90"
          style={{ backgroundColor: "var(--accent)" }}
        >
          Instalar
        </button>
        <button
          onClick={cerrar}
          aria-label="Cerrar"
          className="p-1 rounded-lg transition hover:opacity-70"
          style={{ color: "var(--text-muted)" }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
