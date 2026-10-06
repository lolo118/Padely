import { useEffect } from "react";
import { create } from "zustand";

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

export function ConfirmHost() {
  const abierto = useConfirmStore((s) => s.abierto);
  const opciones = useConfirmStore((s) => s.opciones);
  const cerrar = useConfirmStore((s) => s.cerrar);

  useEffect(() => {
    if (!abierto) return;
    const onKey = (e) => {
      if (e.key === "Escape") cerrar(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [abierto, cerrar]);

  if (!abierto || !opciones) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[90] p-4"
      onClick={() => cerrar(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="themed-card rounded-2xl max-w-md w-full p-6 border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: opciones.danger ? "rgba(239,68,68,0.1)" : "var(--accent-light)" }}
          >
            <span className="text-lg">{opciones.danger ? "⚠️" : "❓"}</span>
          </div>
          <h2 className="font-bold" style={{ color: "var(--text-primary)" }}>
            {opciones.titulo}
          </h2>
        </div>
        {opciones.mensaje && (
          <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
            {opciones.mensaje}
          </p>
        )}
        <div className="flex gap-2 mt-2">
          <button
            type="button"
            onClick={() => cerrar(false)}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition"
            style={{ backgroundColor: "var(--bg-card-hover)", color: "var(--text-secondary)" }}
          >
            {opciones.cancelText}
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => cerrar(true)}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition hover:opacity-90"
            style={{ backgroundColor: opciones.danger ? "#ef4444" : "var(--accent)" }}
          >
            {opciones.confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
