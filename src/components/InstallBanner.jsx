import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";
import { getInstallPrompt, consumirInstallPrompt, suscribirInstallPrompt } from "../lib/installPrompt";
import Button from "./ui/Button";

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

// Banner "Instalá Padely" (pd-install), solo en móvil y mientras no se lo cierre (el cierre queda en localStorage):
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
  if (!modoIOS && !promptEvent) return null;

  return (
    <div className="fixed left-3 right-3 bottom-[76px] z-30 md:hidden flex justify-center">
      <div className="pd-install" role="region" aria-label="Instalar Padely">
        <div className="pd-install-tile" aria-hidden="true">
          P<span className="pd-ball"></span>
        </div>
        <div className="pd-install-body">
          <strong>Instalá Padely</strong>
          {modoIOS ? (
            <span>
              Tocá <Share className="pd-icon" size={16} aria-label="Compartir" /> Compartir y elegí «Agregar a inicio».
            </span>
          ) : (
            <span>Acceso directo en tu pantalla de inicio.</span>
          )}
        </div>
        <div className="pd-install-actions">
          {modoIOS ? (
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              aria-label="Ahora no"
              onClick={cerrar}
              icon={<X className="pd-icon" size={20} aria-hidden="true" />}
            />
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={cerrar}>
                Ahora no
              </Button>
              <Button variant="primary" size="sm" onClick={instalar} icon={<Download className="pd-icon" size={20} aria-hidden="true" />}>
                Instalar
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
