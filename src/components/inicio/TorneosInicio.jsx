import { Link } from "react-router-dom";
import { ChevronRight, Trophy } from "lucide-react";
import { Badge, Card } from "../ui";
import { formatDiaCorto } from "../../utils/formatDate";
import { sedeDeTorneo } from "../../utils/torneo";

// Inicio: los torneos donde está anotado (confirmados) y, abajo, los que tienen la inscripción abierta y todavía no se
// anotó. Los dos salen de la misma lectura (getTorneosYMisInscripciones); las inscripciones pendientes van en
// "Para resolver".
//   inscripciones: confirmadas · abiertos: torneosParaInscribirse(...)
export default function TorneosInicio({ inscripciones = [], abiertos = [] }) {
  if (!inscripciones.length && !abiertos.length) return null;
  return (
    <section aria-labelledby="inicio-torneos" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="inicio-torneos" className="heading-sm m-0">
          Torneos
        </h2>
        <Link to="/torneos" className="body-sm font-semibold underline">
          Ver todos
        </Link>
      </div>
      <Card className="p-2!">
        <ul className="flex flex-col m-0 p-0 list-none">
          {inscripciones.slice(0, 3).map((i) => (
            <Fila key={`i/${i.torneoId}/${i.id}`} to={`/torneos/${i.torneoId}`} titulo={i.torneoNombre || "Torneo"} sub={[i.torneoFechaInicio ? formatDiaCorto(i.torneoFechaInicio) : null, i.apellido1 && i.apellido2 ? `${i.apellido1} / ${i.apellido2}` : null].filter(Boolean).join(" · ")}>
              <Badge dot tone="success">
                Inscripto
              </Badge>
            </Fila>
          ))}
          {abiertos.map((t) => {
            const sede = sedeDeTorneo(t);
            return (
              <Fila key={`t/${t.id}`} to={`/torneos/${t.id}`} titulo={t.nombre || "Torneo"} sub={[t.fechaInicio ? formatDiaCorto(t.fechaInicio) : null, sede.nombre || sede.ciudad].filter(Boolean).join(" · ")}>
                <Badge tone="court">Abierta</Badge>
              </Fila>
            );
          })}
        </ul>
      </Card>
    </section>
  );
}

function Fila({ to, titulo, sub, children }) {
  return (
    <li>
      <Link to={to} className="flex items-center gap-3 rounded-md px-2 py-3 hover:bg-surface-hover">
        <Trophy className="pd-icon text-ink-3 shrink-0" size={20} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="heading-sm block truncate">{titulo}</span>
          {sub && <span className="body-sm text-ink-2 block truncate pd-tnum">{sub}</span>}
        </span>
        {children}
        <ChevronRight className="pd-icon text-ink-3 shrink-0" size={16} aria-hidden="true" />
      </Link>
    </li>
  );
}
