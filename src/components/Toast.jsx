import { create } from "zustand";

// Store de toasts: toast.success / toast.error / toast.info (se cierran solos a los 4 s)
let proximoId = 1;

// eslint-disable-next-line react-refresh/only-export-components -- store + componente en un mismo módulo a propósito
export const useToast = create((set, get) => ({
  toasts: [],
  agregar: (tipo, mensaje, duracion = 4000) => {
    const id = proximoId++;
    set((s) => ({ toasts: [...s.toasts, { id, tipo, mensaje }] }));
    if (duracion > 0) setTimeout(() => get().quitar(id), duracion);
    return id;
  },
  quitar: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

// eslint-disable-next-line react-refresh/only-export-components
export const toast = {
  success: (mensaje) => useToast.getState().agregar("success", mensaje),
  error: (mensaje) => useToast.getState().agregar("error", mensaje),
  info: (mensaje) => useToast.getState().agregar("info", mensaje),
};

const estilos = {
  success: { accent: "#22c55e", border: "rgba(34,197,94,0.35)", bg: "rgba(34,197,94,0.08)", icono: "✓" },
  error: { accent: "#ef4444", border: "rgba(239,68,68,0.35)", bg: "rgba(239,68,68,0.08)", icono: "✕" },
  info: { accent: "#3b82f6", border: "rgba(59,130,246,0.35)", bg: "rgba(59,130,246,0.08)", icono: "i" },
};

export function Toaster() {
  const toasts = useToast((s) => s.toasts);
  const quitar = useToast((s) => s.quitar);
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed z-[100] bottom-20 md:bottom-4 left-1/2 -translate-x-1/2 md:left-auto md:right-4 md:translate-x-0 flex flex-col gap-2 w-[calc(100%-2rem)] max-w-sm pointer-events-none"
      aria-live="polite"
    >
      {toasts.map((t) => {
        const e = estilos[t.tipo] || estilos.info;
        return (
          <div
            key={t.id}
            role="status"
            className="themed-card pointer-events-auto rounded-xl border shadow-lg px-4 py-3 flex items-start gap-3 text-sm"
            style={{ color: "var(--text-primary)", borderColor: e.border, borderLeft: `4px solid ${e.accent}` }}
          >
            <span
              className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
              style={{ backgroundColor: e.bg, color: e.accent }}
            >
              {e.icono}
            </span>
            <span className="flex-1">{t.mensaje}</span>
            <button
              type="button"
              onClick={() => quitar(t.id)}
              aria-label="Cerrar"
              className="text-xs font-semibold shrink-0 hover:opacity-70"
              style={{ color: "var(--text-muted)" }}
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
