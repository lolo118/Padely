import { create } from "zustand";
import { AlertTriangle, Check, Info } from "lucide-react";

// Store de toasts: toast.success / toast.error / toast.info (se cierran solos a los 4 s)
let proximoId = 1;

// eslint-disable-next-line react-refresh/only-export-components -- store + componente en un mismo módulo a propósito
export const useToast = create((set, get) => ({
  toasts: [],
  agregar: (tipo, mensaje, duracion = 4000, accion = null) => {
    const id = proximoId++;
    set((s) => ({ toasts: [...s.toasts, { id, tipo, mensaje, accion }] }));
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
  // Con un botón y sin tiempo: queda hasta que se toca ("Hay una versión nueva" · "Actualizar")
  accion: (mensaje, { etiqueta, onAccion }) => useToast.getState().agregar("info", mensaje, 0, { etiqueta, onAccion }),
};

// pd-toast, siempre Noche (data-theme="dark"): check lime, triángulo danger o info en court.
// El sistema no define una variante info: el ícono lleva var(--court) a mano.
const TIPOS = {
  success: { Icono: Check, clase: "", role: "status", estilo: undefined },
  error: { Icono: AlertTriangle, clase: "pd-toast-danger", role: "alert", estilo: undefined },
  info: { Icono: Info, clase: "", role: "status", estilo: { color: "var(--court)" } },
};

export function Toaster() {
  const toasts = useToast((s) => s.toasts);
  const quitar = useToast((s) => s.quitar);
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed z-[100] bottom-20 md:bottom-4 left-4 right-4 md:left-auto md:w-[420px] flex flex-col items-center md:items-end gap-2 pointer-events-none"
      aria-live="polite"
    >
      {toasts.map((t) => {
        const { Icono, clase, role, estilo } = TIPOS[t.tipo] || TIPOS.info;
        return (
          // Sin botón de cerrar: se va solo y un toque lo descarta
          <div
            key={t.id}
            role={role}
            className={["pd-toast", clase, "pointer-events-auto cursor-pointer"].filter(Boolean).join(" ")}
            data-theme="dark"
            onClick={() => quitar(t.id)}
          >
            <Icono className="pd-icon" size={20} aria-hidden="true" style={estilo} />
            <div className="pd-toast-body flex flex-wrap items-center gap-3">
              <strong>{t.mensaje}</strong>
              {t.accion && (
                <button
                  type="button"
                  className="pd-btn pd-btn-sm pd-btn-primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    quitar(t.id);
                    t.accion.onAccion?.();
                  }}
                >
                  {t.accion.etiqueta}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
