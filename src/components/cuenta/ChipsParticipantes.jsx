import { iniciales } from "../../utils/cuentas";

// Para quién es una línea: las iniciales de cada asignado (pd-avatar-sm) o "Sin asignar" apagado.
//   asignadoA: [participanteId] · participantes: activos de la cuenta · onClick: abre la hoja de asignación
export default function ChipsParticipantes({ asignadoA = [], participantes = [], onClick, disabled = false, className = "" }) {
  const elegidos = (asignadoA || []).map((id) => participantes.find((p) => p.id === id)).filter(Boolean);
  const contenido =
    elegidos.length === 0 ? (
      <span className="body-sm text-ink-3">Sin asignar</span>
    ) : (
      <span className="inline-flex items-center gap-1">
        {elegidos.slice(0, 4).map((p) => (
          <span key={p.id} className="pd-avatar pd-avatar-sm" title={p.nombre} aria-hidden="true">
            {iniciales(p.nombre)}
          </span>
        ))}
        {elegidos.length > 4 && <span className="body-sm text-ink-2 pd-tnum">+{elegidos.length - 4}</span>}
        <span className="sr-only">{elegidos.map((p) => p.nombre).join(", ")}</span>
        {elegidos.length === 1 && <span className="body-sm text-ink-2 truncate max-w-[120px]">{elegidos[0].nombre}</span>}
      </span>
    );
  if (!onClick) return <span className={className}>{contenido}</span>;
  return (
    <button type="button" className={["inline-flex items-center gap-2 rounded-pill px-2 py-1 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-50", className].filter(Boolean).join(" ")} onClick={onClick} disabled={disabled} aria-label={elegidos.length ? `Asignado a ${elegidos.map((p) => p.nombre).join(", ")}. Cambiar` : "Sin asignar. Asignar a alguien"}>
      {contenido}
    </button>
  );
}
