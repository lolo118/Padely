import { useState } from "react";
import Dialogo from "../Dialogo";
import { Alert, Button } from "../ui";
import { etiquetaTipoParticipante, iniciales } from "../../utils/cuentas";
import { formatPrecio } from "../../utils/format";

// Hoja de asignación: a quién se le cobra una o varias líneas. Un checkbox por participante y "Entre todos" (sin
// asignar: se reparte entre todos al cobrar). En modo participante (`yo`), la persona solo puede compartir o quedarse
// la línea: la selección tiene que incluirla o quedar vacía.
//   lineas: [{ lineaId, nombre, subtotal, asignadoA }] · participantes: activos · yo: participanteId del jugador o null
export default function AsignarSheet({ lineas = [], participantes = [], yo = null, onGuardar, onCerrar }) {
  const inicial = lineas.length === 1 ? lineas[0].asignadoA || [] : [];
  const [elegidos, setElegidos] = useState(() => new Set(inicial));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const total = lineas.reduce((s, l) => s + (Number(l.subtotal) || 0), 0);

  const alternar = (id) =>
    setElegidos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const guardar = async () => {
    const ids = participantes.filter((p) => elegidos.has(p.id)).map((p) => p.id);
    if (yo && ids.length && !ids.includes(yo)) {
      setError("Podés compartir la línea o quedártela, no pasársela a otro.");
      return;
    }
    setError("");
    setGuardando(true);
    try {
      await onGuardar(ids);
    } catch (e) {
      console.error("Error asignando:", e);
      setError(e?.message || "No pudimos guardar la asignación.");
      setGuardando(false);
    }
  };

  return (
    <Dialogo
      titulo={lineas.length === 1 ? `¿Para quién es ${lineas[0].nombre}?` : `¿Para quién son estas ${lineas.length} líneas?`}
      descripcion={`${lineas.length === 1 ? "" : lineas.map((l) => l.nombre).join(", ") + " · "}${formatPrecio(total)}`}
      onCerrar={onCerrar}
      onSubmit={guardar}
      acciones={
        <>
          <Button onClick={onCerrar}>Cancelar</Button>
          <Button type="submit" variant="primary" cargando={guardando ? "Guardando…" : ""}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="mt-4 flex flex-col gap-3">
        <ul className="m-0 p-0 list-none divide-y divide-line rounded-lg border border-line">
          {participantes.map((p) => (
            <li key={p.id}>
              <label className="pd-check px-3 py-2 w-full">
                <input type="checkbox" checked={elegidos.has(p.id)} onChange={() => alternar(p.id)} />
                <span className="pd-avatar pd-avatar-sm" aria-hidden="true">
                  {iniciales(p.nombre)}
                </span>
                <span className="flex-1 min-w-0 truncate">{p.nombre}</span>
                <span className="body-sm text-ink-3">{etiquetaTipoParticipante(p.tipo)}</span>
              </label>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button size="sm" variant={elegidos.size === 0 ? "primary" : "secondary"} onClick={() => setElegidos(new Set())} aria-pressed={elegidos.size === 0}>
            Entre todos
          </Button>
          <span className="body-sm text-ink-2">{elegidos.size === 0 ? "Se reparte entre todos al cobrar." : elegidos.size === 1 ? "Se le cobra a esa persona." : `Se reparte entre ${elegidos.size} en partes iguales.`}</span>
        </div>
        {yo && <Alert>Podés compartir lo tuyo con otros o quedártelo. Para pasarle algo a otra persona, pedíselo al titular o al club.</Alert>}
        {error && <p className="pd-error m-0">{error}</p>}
      </div>
    </Dialogo>
  );
}
