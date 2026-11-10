import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { cargarFlags } from "../services/flagsService";
import { escucharMinisDeReserva } from "../services/miniTorneoService";
import { getTodayLocal } from "../utils/formatDate";
import { FORMATOS } from "../utils/miniTorneo";
import { Badge, Button } from "./ui";

// Mis reservas y Mi cuenta: los mini torneos de un turno (links) y "Armar mini torneo" para quien reservó o está en la
// cuenta del turno, mientras la reserva esté confirmada y no haya pasado. Oculto hasta configuracionPadely/flags.miniTorneo.
//   clubId · grupoId · fecha · confirmada · uid
export default function MiniTorneoDeReserva({ clubId, grupoId, fecha, confirmada, uid }) {
  const [activo, setActivo] = useState(false);
  const [minis, setMinis] = useState([]);
  useEffect(() => {
    let vivo = true;
    cargarFlags().then((f) => vivo && setActivo(f?.miniTorneo === true));
    return () => {
      vivo = false;
    };
  }, []);
  useEffect(() => {
    if (!activo || !clubId || !grupoId) return undefined;
    const unsub = escucharMinisDeReserva(clubId, grupoId, setMinis, (err) => console.error("Error leyendo los mini torneos:", err));
    return () => unsub();
  }, [activo, clubId, grupoId]);

  if (!activo || !uid) return null;
  const vigente = !!confirmada && String(fecha || "") >= getTodayLocal();
  if (!vigente && minis.length === 0) return null;

  return (
    <div className="mt-3 pt-3 border-t border-line flex flex-col gap-2">
      {minis.map((m) => (
        <div key={m.id} className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex flex-wrap items-center gap-2 body-sm">
            <Trophy className="pd-icon text-ink-3" size={16} aria-hidden="true" />
            <strong>{m.nombre || "Mini torneo"}</strong>
            <Badge>{FORMATOS[m.formato]?.label || "Mini torneo"}</Badge>
            {m.estado === "finalizado" ? <Badge tone="success">Terminado</Badge> : <Badge dot tone="court">En juego</Badge>}
          </span>
          <Button as="link" to={`/mini/${clubId}/${m.id}`} size="sm">
            Ver
          </Button>
        </div>
      ))}
      {vigente && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="body-sm text-ink-2 m-0">{minis.length ? "¿Otro más?" : "¿Son 6 o más (3 parejas)? Armen un mini torneo en el turno (no suma puntos)."}</p>
          <Button as="link" to={`/mini/nuevo/${clubId}/${grupoId}`} size="sm">
            Armar mini torneo
          </Button>
        </div>
      )}
    </div>
  );
}
