import { useEffect, useId, useRef } from "react";

// Diálogo de formulario del panel: pd-backdrop > form.pd-dialog (lo usan Productos, Caja y la vista previa de tickets).
// Escape y el fondo cierran; el foco entra al primer [data-autofocus] (o al diálogo) y vuelve al disparador.
// ancho: false (440 px) | true (640 px) | "xl" (960 px)
export default function Dialogo({ titulo, descripcion, onCerrar, onSubmit, acciones, ancho = false, children }) {
  const caja = useRef(null);
  const cerrarRef = useRef(onCerrar);
  const tituloId = useId();
  const cuerpoId = useId();

  useEffect(() => {
    cerrarRef.current = onCerrar;
  });

  useEffect(() => {
    const previo = document.activeElement;
    const nodo = caja.current;
    (nodo?.querySelector("[data-autofocus]") || nodo)?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") cerrarRef.current?.();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (previo && typeof previo.focus === "function" && document.contains(previo)) previo.focus();
    };
  }, []);

  return (
    <div
      className="pd-backdrop z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCerrar();
      }}
    >
      <form
        ref={caja}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        aria-describedby={descripcion ? cuerpoId : undefined}
        noValidate
        className={[
          "pd-dialog outline-none max-h-[calc(100dvh-32px)] overflow-y-auto",
          ancho === "xl" ? "max-w-[960px]!" : ancho && "max-w-[640px]!",
        ]
          .filter(Boolean)
          .join(" ")}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit?.();
        }}
      >
        <h2 className="pd-dialog-title" id={tituloId}>
          {titulo}
        </h2>
        {descripcion && (
          <p className="pd-dialog-body" id={cuerpoId}>
            {descripcion}
          </p>
        )}
        {children}
        <div className="pd-dialog-actions">{acciones}</div>
      </form>
    </div>
  );
}
