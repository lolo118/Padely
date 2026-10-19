import { useEffect, useId, useRef, useState } from "react";
import { Button, Field, Textarea } from "../../components/ui";

const EFECTO = {
  club: "Deja de aparecer en la lista de clubes y los jugadores no pueden reservar. Las reservas que ya existen no se cancelan.",
  organizador: "No va a poder crear torneos nuevos. Sus torneos actuales siguen visibles.",
};

const REACTIVAR = {
  club: "Vuelve a aparecer en la lista de clubes y los jugadores pueden reservar de nuevo.",
  organizador: "Vuelve a poder crear torneos nuevos.",
};

// Diálogo para suspender o reactivar un club o una entidad organizadora (pd-backdrop + pd-dialog).
// El contenido se monta solo mientras está abierto: así el motivo arranca vacío cada vez.
export default function SuspensionDialog({ abierto, ...props }) {
  if (!abierto) return null;
  return <Contenido {...props} />;
}

function Contenido({ modo = "suspender", nombre = "", tipo = "club", onConfirmar, onCerrar, cargando = false }) {
  const [motivo, setMotivo] = useState("");
  const dialogo = useRef(null);
  const disparador = useRef(null);
  const cargandoRef = useRef(cargando);
  const onCerrarRef = useRef(onCerrar);
  const tituloId = useId();
  const cuerpoId = useId();
  const suspender = modo === "suspender";

  useEffect(() => {
    cargandoRef.current = cargando;
    onCerrarRef.current = onCerrar;
  }, [cargando, onCerrar]);

  // Foco adentro al abrir, Escape cierra (salvo mientras se guarda), el foco vuelve al disparador al cerrar.
  // Corre una vez por apertura: onCerrar va por ref para no robarle el foco al motivo en cada render.
  useEffect(() => {
    disparador.current = document.activeElement;
    dialogo.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape" && !cargandoRef.current) onCerrarRef.current?.();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      const previo = disparador.current;
      disparador.current = null;
      if (previo && typeof previo.focus === "function" && document.contains(previo)) previo.focus();
    };
  }, []);

  const confirmar = (e) => {
    e.preventDefault();
    if (cargando) return;
    onConfirmar?.(suspender ? motivo.trim() : "");
  };

  return (
    <div
      className="pd-backdrop z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget && !cargando) onCerrar?.();
      }}
    >
      <form
        ref={dialogo}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        aria-describedby={cuerpoId}
        className="pd-dialog outline-none"
        onSubmit={confirmar}
      >
        <h2 className="pd-dialog-title break-words" id={tituloId}>
          {suspender ? `¿Suspender ${nombre}?` : `¿Reactivar ${nombre}?`}
        </h2>
        <p className="pd-dialog-body" id={cuerpoId}>
          {suspender ? EFECTO[tipo] || EFECTO.club : REACTIVAR[tipo] || REACTIVAR.club}
        </p>
        {suspender && (
          <Field label="Motivo" help="Opcional. Lo ve solo el equipo de Padely." className="mt-4">
            <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} disabled={cargando} />
          </Field>
        )}
        <div className="pd-dialog-actions">
          <Button onClick={onCerrar} disabled={cargando}>
            Volver
          </Button>
          {suspender ? (
            <Button type="submit" variant="danger" cargando={cargando ? "Suspendiendo…" : ""}>
              Suspender
            </Button>
          ) : (
            <Button type="submit" variant="primary" cargando={cargando ? "Reactivando…" : ""}>
              Reactivar
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
