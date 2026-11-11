import { Link } from "react-router-dom";
import { Star } from "lucide-react";
import { Button, Card } from "../ui";
import { addDaysLocal } from "../../utils/formatDate";
import { ubicacionCorta } from "../../utils/format";

// Inicio: los clubes donde suele reservar (clubesHabituales + favoritos) con un salto directo a la grilla de Hoy o de
// Mañana (ClubPublico arranca en location.state.fecha).
//   clubes: [{ clubId, veces, club: { nombre, ciudad, provincia } }] · hoy: "YYYY-MM-DD"
export default function ReservarDeNuevo({ clubes, hoy }) {
  if (!clubes?.length) return null;
  const manana = addDaysLocal(hoy, 1);
  return (
    <section aria-labelledby="inicio-reservar-de-nuevo" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="inicio-reservar-de-nuevo" className="heading-sm m-0">
          Reservar de nuevo
        </h2>
        <Link to="/clubes" className="body-sm font-semibold underline">
          Otros clubes
        </Link>
      </div>
      <Card className="p-2!">
        <ul className="flex flex-col m-0 p-0 list-none">
          {clubes.map(({ clubId, veces, club }) => (
            <li key={clubId} className="flex items-center gap-3 px-2 py-2">
              <Link to={`/club/${clubId}`} className="min-w-0 flex-1 hover:underline">
                <span className="heading-sm block truncate">{club.nombre || "Club"}</span>
                <span className="body-sm text-ink-2 flex items-center gap-1 min-w-0">
                  {veces === 0 && <Star className="pd-icon text-ink-3 shrink-0" size={14} aria-hidden="true" />}
                  <span className="truncate">{[ubicacionCorta(club), veces > 0 ? (veces === 1 ? "1 reserva" : `${veces} reservas`) : "Favorito"].filter(Boolean).join(" · ")}</span>
                </span>
              </Link>
              <span className="flex gap-2 shrink-0">
                <Button as="link" to={`/club/${clubId}`} state={{ fecha: hoy }} size="sm" aria-label={`Reservar hoy en ${club.nombre || "el club"}`}>
                  Hoy
                </Button>
                <Button as="link" to={`/club/${clubId}`} state={{ fecha: manana }} size="sm" aria-label={`Reservar mañana en ${club.nombre || "el club"}`}>
                  Mañana
                </Button>
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}
