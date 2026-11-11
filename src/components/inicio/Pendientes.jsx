import { Link } from "react-router-dom";
import { ChevronRight, ReceiptText, Trophy, UserPlus, Wallet } from "lucide-react";
import { Badge, Card } from "../ui";
import { formatPrecio } from "../../utils/format";
import { diaRelativo, etiquetaInscripcion } from "../../utils/inicio";

const MAX = 4;

// Cada pendiente → ícono, texto, a dónde lleva y su badge
function fila(item, { hoy, nombresClub }) {
  const dia = diaRelativo(item.fecha, hoy);
  const cuando = [dia, item.hora].filter(Boolean).join(" · ");
  const club = nombresClub[item.clubId] || item.clubNombre || "";
  if (item.tipo === "pagar") {
    return {
      to: `/mi-cuenta/${item.clubId}/${item.id}`,
      Icono: Wallet,
      titulo: item.esTitular ? "Pagá la cuenta del turno" : "Pagá tu parte",
      sub: [dia, club, item.lugar].filter(Boolean).join(" · "),
      badge: <Badge tone="warning">{formatPrecio(item.monto)}</Badge>,
    };
  }
  if (item.tipo === "seña") {
    return {
      to: "/mis-reservas",
      Icono: ReceiptText,
      titulo: "Seña sin pagar",
      sub: [cuando, club, item.canchaNombre].filter(Boolean).join(" · "),
      badge: <Badge tone="warning">{formatPrecio(item.monto)}</Badge>,
    };
  }
  if (item.tipo === "sumado") {
    return {
      to: `/mi-cuenta/${item.clubId}/${item.id}`,
      Icono: UserPlus,
      titulo: item.mesa ? "Te sumaron a una mesa" : "Te sumaron a un turno",
      sub: [dia, item.mesa ? null : item.titular, club, item.lugar].filter(Boolean).join(" · "),
      badge: null,
    };
  }
  return {
    to: `/torneos/${item.torneoId}`,
    Icono: Trophy,
    titulo: item.torneoNombre,
    sub: `Inscripción: ${etiquetaInscripcion(item.status).toLowerCase()}`,
    badge: null,
  };
}

// Inicio: lo que el jugador tiene que resolver (pendientesDeInicio ya viene ordenado, lo más urgente primero)
export default function Pendientes({ items, hoy, nombresClub = {} }) {
  if (!items?.length) return null;
  const visibles = items.slice(0, MAX);
  return (
    <section aria-labelledby="inicio-pendientes" className="flex flex-col gap-2">
      <h2 id="inicio-pendientes" className="heading-sm m-0">
        Para resolver <span className="pd-count text-ink-3 font-semibold">{items.length}</span>
      </h2>
      <Card className="p-2!">
        <ul className="flex flex-col m-0 p-0 list-none">
          {visibles.map((item) => {
            const f = fila(item, { hoy, nombresClub });
            const Icono = f.Icono;
            return (
              <li key={item.clave}>
                <Link to={f.to} className="flex items-center gap-3 rounded-md px-2 py-3 hover:bg-surface-hover">
                  <Icono className="pd-icon text-ink-3 shrink-0" size={20} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="heading-sm block truncate">{f.titulo}</span>
                    {f.sub && <span className="body-sm text-ink-2 block truncate pd-tnum">{f.sub}</span>}
                  </span>
                  {f.badge}
                  <ChevronRight className="pd-icon text-ink-3 shrink-0" size={16} aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
        {items.length > visibles.length && <p className="body-sm text-ink-3 px-2 pb-2 m-0">Y {items.length - visibles.length} más en Mis reservas y Torneos.</p>}
      </Card>
    </section>
  );
}
