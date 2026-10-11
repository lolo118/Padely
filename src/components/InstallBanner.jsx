import { useEffect, useState } from "react";

const CLAVE_DESCARTADO = "padely-install-dismissed";

// Banner "Instalá Padely": solo en móvil y solo cuando el navegador dispara beforeinstallprompt
// (Chrome/Edge en Android). Se puede cerrar y el cierre queda guardado en localStorage.
export default function InstallBanner() {
  const [promptEvent, setPromptEvent] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let descartado = false;
    try {
      descartado = localStorage.getItem(CLAVE_DESCARTADO) === "1";
    } catch {
      descartado = false;
    }
    if (descartado) return;

    const esMobile =
      window.matchMedia("(max-width: 767px)").matches ||
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (!esMobile) return;

    const onPrompt = (e) => {
      e.preventDefault();
      setPromptEvent(e);
      setVisible(true);
    };
    const onInstalled = () => {
      setVisible(false);
      setPromptEvent(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const cerrar = () => {
    try {
      localStorage.setItem(CLAVE_DESCARTADO, "1");
    } catch {
      // sin localStorage (modo privado): solo se oculta en esta visita
    }
    setVisible(false);
  };

  const instalar = async () => {
    if (!promptEvent) return;
    try {
      promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      if (outcome === "accepted") setVisible(false);
      else cerrar();
    } catch (err) {
      console.error("Error al instalar la app:", err);
      cerrar();
    }
    setPromptEvent(null);
  };

  if (!visible) return null;

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
