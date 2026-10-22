import { useEffect, useState } from "react";
import { CircleDot } from "lucide-react";
import Button from "../components/ui/Button";

// Un 404 puede ser un service worker viejo sirviendo el index.html anterior, que no conoce una ruta nueva (los
// kioscos del bar quedan abiertos días). Antes de darlo por perdido: si hay una versión nueva esperando (o aparece
// al pedir update() en 2 s), se activa y se recarga la página UNA vez (marca en sessionStorage, como la de los chunks).
const CLAVE_RECARGA_SW = "padely-sw-reload";
const VENTANA_RECARGA_MS = 10000;

async function intentarActualizarServiceWorker() {
  if (typeof navigator === "undefined" || !navigator.serviceWorker) return false;
  let ultima = 0;
  try {
    ultima = Number(sessionStorage.getItem(CLAVE_RECARGA_SW)) || 0;
  } catch {
    // sin sessionStorage: se intenta igual una vez por carga
  }
  if (Date.now() - ultima < VENTANA_RECARGA_MS) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return false;
  const activar = (worker) => {
    try {
      sessionStorage.setItem(CLAVE_RECARGA_SW, String(Date.now()));
    } catch {
      // sin marca posible: igual recargamos
    }
    worker.postMessage({ type: "SKIP_WAITING" });
    setTimeout(() => window.location.reload(), 300);
    return true;
  };
  if (reg.waiting) return activar(reg.waiting);
  try {
    await reg.update();
  } catch (err) {
    console.error("No se pudo buscar una versión nueva:", err);
    return false;
  }
  return new Promise((resolve) => {
    const fin = setTimeout(() => resolve(false), 2000);
    const revisar = () => {
      const w = reg.waiting || (reg.installing && reg.installing.state === "installed" ? reg.installing : null);
      if (w) {
        clearTimeout(fin);
        resolve(activar(w));
        return true;
      }
      return false;
    };
    if (revisar()) return;
    if (reg.installing) {
      reg.installing.addEventListener("statechange", () => revisar());
    }
  });
}

export default function NoEncontrado() {
  const [buscando, setBuscando] = useState(true);
  useEffect(() => {
    let vivo = true;
    intentarActualizarServiceWorker()
      .catch((err) => {
        console.error("Error revisando el service worker:", err);
        return false;
      })
      .then((recargando) => {
        if (vivo && !recargando) setBuscando(false);
      });
    return () => {
      vivo = false;
    };
  }, []);
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-surface">
      <div className="pd-card text-center max-w-md w-full">
        <CircleDot className="pd-icon-lg mx-auto mb-4 text-ink-3" size={24} aria-hidden="true" />
        <p className="pd-eyebrow mb-1!">Error 404</p>
        <h1 className="heading-md mb-2">Esta página no existe</h1>
        <p className="body-sm text-ink-2 mb-6">{buscando ? "Buscando una versión nueva de la app…" : "El link puede estar mal escrito o la página ya no está disponible."}</p>
        <Button as="link" to="/inicio" variant="primary">
          Ir al inicio
        </Button>
      </div>
    </div>
  );
}
