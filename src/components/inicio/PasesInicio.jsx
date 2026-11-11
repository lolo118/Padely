import { useEffect, useState } from "react";
import { Crown, QrCode } from "lucide-react";
import { Badge, Button, Card } from "../ui";
import { getPase } from "../../services/membresiasService";
import { ESTADOS_SOCIO, ETIQUETA_NIVEL, TONO_NIVEL, estadoSocio, nombrePase } from "../../utils/membresias";
import { progresoPase } from "../../utils/inicio";

const MAX = 2;

// Inicio (flags.membresias): los Pases activos o por activar, con el nivel, los puntos y cuánto falta para el
// próximo, y el atajo al QR (/membresias). Los umbrales salen de clubs/{c}/planesSocio/pase: una lectura por Pase
// mostrado (como mucho MAX), igual que Mis pases.
//   socios: getMisMembresias(uid)
export default function PasesInicio({ socios }) {
  const visibles = (socios || [])
    .map((s) => ({ ...s, est: estadoSocio(s) }))
    .filter((s) => s.est.activa || s.est.estado === "pendiente")
    .sort((a, b) => Number(b.est.activa) - Number(a.est.activa))
    .slice(0, MAX);
  if (!visibles.length) return null;
  return (
    <section aria-labelledby="inicio-pases" className="flex flex-col gap-2">
      <h2 id="inicio-pases" className="heading-sm m-0">
        {visibles.length === 1 ? "Tu Pase" : "Tus Pases"}
      </h2>
      {visibles.map((s) => (
        <PaseResumen key={`${s.clubId}-${s.id}`} socio={s} />
      ))}
    </section>
  );
}

function PaseResumen({ socio }) {
  const { est } = socio;
  const [umbrales, setUmbrales] = useState(null);
  useEffect(() => {
    if (!est.activa) return undefined;
    let vivo = true;
    getPase(socio.clubId)
      .then((p) => vivo && setUmbrales(p?.umbrales || {}))
      .catch(() => vivo && setUmbrales({}));
    return () => {
      vivo = false;
    };
  }, [socio.clubId, est.activa]);
  const nivel = socio.nivel || "bronce";
  const puntos = Number(socio.puntos) || 0;
  const progreso = est.activa && umbrales ? progresoPase(puntos, umbrales) : null;

  return (
    <Card>
      <Card.Row>
        <span className="flex items-center gap-2 min-w-0">
          <Crown className="pd-icon text-ink-3 shrink-0" size={20} aria-hidden="true" />
          <span className="heading-sm truncate">{nombrePase({ nombre: socio.clubNombre })}</span>
        </span>
        {est.activa ? <Badge tone={TONO_NIVEL[nivel]}>{ETIQUETA_NIVEL[nivel]}</Badge> : <Badge dot tone="warning">{ESTADOS_SOCIO[est.estado] || "Pendiente"}</Badge>}
      </Card.Row>
      {est.activa ? (
        <div className="mt-3">
          <p className="body-sm m-0 pd-tnum">
            <strong>{puntos} puntos</strong>
            <span className="text-ink-2">{progreso ? ` · te faltan ${progreso.faltan} para ${ETIQUETA_NIVEL[progreso.siguiente]}` : umbrales ? " · nivel máximo" : ""}</span>
          </p>
          {progreso && (
            <div
              className="mt-2 h-2 rounded-pill bg-surface-sunken overflow-hidden"
              role="progressbar"
              aria-label={`Progreso a ${ETIQUETA_NIVEL[progreso.siguiente]}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progreso.pct}
            >
              <div className="h-full rounded-pill bg-court" style={{ width: `${progreso.pct}%` }} />
            </div>
          )}
        </div>
      ) : (
        <p className="body-sm text-ink-2 mt-2 mb-0">Falta que autorices el débito en Mercado Pago para activarlo.</p>
      )}
      <div className="pd-card-foot">
        <Button as="link" to="/membresias" size="sm" icon={<QrCode className="pd-icon" size={20} aria-hidden="true" />}>
          {est.activa ? "Mostrar mi QR" : "Ver mi Pase"}
        </Button>
      </div>
    </Card>
  );
}
