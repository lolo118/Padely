import { useEffect, useId, useRef } from "react";
import { create } from "zustand";
import Button from "./ui/Button";

// Diálogo de confirmación: `await confirmar({ titulo, mensaje })` devuelve true/false
const useConfirmStore = create((set, get) => ({
  abierto: false,
  opciones: null,
  resolver: null,
  abrir: (opciones) =>
    new Promise((resolve) => {
      // Si había uno abierto, lo cerramos como cancelado
      get().resolver?.(false);
      set({ abierto: true, opciones, resolver: resolve });
    }),
  cerrar: (valor) => {
    const { resolver } = get();
    set({ abierto: false, opciones: null, resolver: null });
    resolver?.(valor);
  },
}));

// eslint-disable-next-line react-refresh/only-export-components -- helper + componente en un mismo módulo a propósito
export function confirmar({
  titulo = "¿Confirmás?",
  mensaje = "",
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  danger = false,
} = {}) {
  return useConfirmStore.getState().abrir({ titulo, mensaje, confirmText, cancelText, danger });
}

// pd-backdrop + pd-dialog: hoja inferior en teléfonos, centrado desde 640px. Escape y el fondo cierran como
// cancelar. El foco entra al diálogo al abrir y vuelve al disparador al cerrar.
export function ConfirmHost() {
  const abierto = useConfirmStore((s) => s.abierto);
  const opciones = useConfirmStore((s) => s.opciones);
  const cerrar = useConfirmStore((s) => s.cerrar);
  const dialogo = useRef(null);
  const disparador = useRef(null);
  const tituloId = useId();
  const cuerpoId = useId();

  useEffect(() => {
    if (!abierto) return undefined;
    disparador.current = document.activeElement;
    dialogo.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") cerrar(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      const previo = disparador.current;
      disparador.current = null;
      if (previo && typeof previo.focus === "function" && document.contains(previo)) previo.focus();
    };
  }, [abierto, cerrar]);

  if (!abierto || !opciones) return null;

  return (
    <div
      className="pd-backdrop z-[90]!"
      onClick={(e) => {
        if (e.target === e.currentTarget) cerrar(false);
      }}
    >
      <div
        ref={dialogo}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        aria-describedby={opciones.mensaje ? cuerpoId : undefined}
        className="pd-dialog outline-none"
      >
        <h2 className="pd-dialog-title" id={tituloId}>
          {opciones.titulo}
        </h2>
        {opciones.mensaje && (
          <p className="pd-dialog-body whitespace-pre-line" id={cuerpoId}>
            {opciones.mensaje}
          </p>
        )}
        <div className="pd-dialog-actions">
          <Button onClick={() => cerrar(false)}>{opciones.cancelText}</Button>
          <Button variant={opciones.danger ? "danger" : "primary"} onClick={() => cerrar(true)}>
            {opciones.confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
}
