import { CalendarPlus, MapPin, MessageCircle, Users } from "lucide-react";
import { Badge, Button, Card } from "../ui";
import CuentaTurnoResumen from "../CuentaTurnoResumen";
import MiniTorneoDeReserva from "../MiniTorneoDeReserva";
import { formatPrecio } from "../../utils/format";
import { estadoSeña, rangoHoras } from "../../utils/reservas";
import { linkWhatsApp, participantesActivos } from "../../utils/cuentas";
import { diaRelativo, linkComoLlegar, mensajeTurno } from "../../utils/inicio";

// Inicio: la próxima reserva arriba de todo (cuándo, dónde, con quién, la seña) con Ver, Compartir por WhatsApp,
// Cómo llegar y el mini torneo (MiniTorneoDeReserva, oculto hasta flags.miniTorneo). Sin reserva: "Reservar cancha".
//   reserva: agrupada (getInicioReservasJugador) · club: { nombre, direccion, ciudad, … } · cuenta: la abierta, o null
//   pedidos: los del jugador en esa reserva · hoy: "YYYY-MM-DD" · uid
export default function ProximaReserva({ reserva, club = null, cuenta = null, pedidos = [], hoy, uid, otras = 0 }) {
  if (!reserva) {
    return (
      <Card className="flex flex-col gap-3">
        <div>
          <p className="pd-eyebrow m-0">Sin reservas por ahora</p>
          <h2 className="heading-md mt-1 mb-0">¿Jugamos?</h2>
          <p className="body-sm text-ink-2 mt-1 mb-0">Elegí club, día y hora. Te lleva menos de un minuto.</p>
        </div>
        <Button as="link" to="/clubes" variant="primary" block icon={<CalendarPlus className="pd-icon" size={20} aria-hidden="true" />}>
          Reservar cancha
        </Button>
      </Card>
    );
  }

  const grupoId = reserva.grupoId || reserva.id;
  const confirmada = reserva.status === "confirmada";
  const seña = estadoSeña(reserva);
  const clubNombre = club?.nombre || reserva.clubNombre || "Club";
  const cancha = reserva.canchaName || reserva.cancha || "Cancha";
  const rango = rangoHoras(reserva.horaInicio || reserva.hora, reserva.horaFin);
  const mapa = linkComoLlegar(club);
  const dia = diaRelativo(reserva.fecha, hoy);
  // Texto plano para wa.me (sin el link de la cuenta: ese lo arma "Invitar" en Mis reservas, y crea la cuenta)
  const whatsapp = linkWhatsApp("", mensajeTurno({ fechaTexto: dia, rango, clubNombre, canchaNombre: cancha, mapa }));
  // "Ver" va a Mis reservas (cancelar, pagar la seña, invitar); la cuenta abierta ya tiene su "Ver cuenta" arriba
  const abierta = cuenta && cuenta.estado === "abierta";
  const gente = abierta ? participantesActivos(cuenta) : [];

  return (
    <Card aria-labelledby="proxima-reserva-titulo">
      <Card.Row className="flex-wrap">
        <Card.Eyebrow>Tu próxima reserva</Card.Eyebrow>
        <span className="pd-badge-group">
          {seña && <Badge tone={seña.tone}>{seña.tone === "success" ? "Seña pagada" : `Seña ${formatPrecio(seña.monto)} pendiente`}</Badge>}
          <Badge dot tone={confirmada ? "success" : "warning"}>
            {confirmada ? "Confirmada" : "Pendiente"}
          </Badge>
        </span>
      </Card.Row>
      <h2 id="proxima-reserva-titulo" className="heading-lg mt-2 mb-0 pd-tnum">
        {dia} · {rango}
      </h2>
      <p className="body-md mt-1 mb-0">
        <strong>{clubNombre}</strong> <span className="text-ink-2">· {cancha}</span>
      </p>
      {gente.length > 0 && (
        <p className="body-sm text-ink-2 mt-2 mb-0 flex items-center gap-2 min-w-0">
          <Users className="pd-icon text-ink-3 shrink-0" size={16} aria-hidden="true" />
          <span className="truncate">
            {gente.length === 1 ? "Solo vos por ahora" : `${gente.length} en el turno: ${gente.map((p) => (p.uid && p.uid === uid ? "vos" : p.nombre)).join(", ")}`}
          </span>
        </p>
      )}
      <CuentaTurnoResumen reserva={reserva} cuenta={cuenta} pedidos={pedidos} uid={uid} compacto />
      <div className="pd-card-foot flex-wrap">
        <Button as="link" to="/mis-reservas" variant="primary" size="sm">
          Ver
        </Button>
        <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="pd-btn pd-btn-sm" aria-label="Compartir por WhatsApp">
          <MessageCircle className="pd-icon" size={20} aria-hidden="true" />
          Compartir
        </a>
        {mapa && (
          <a href={mapa} target="_blank" rel="noopener noreferrer" className="pd-btn pd-btn-sm pd-btn-ghost">
            <MapPin className="pd-icon" size={20} aria-hidden="true" />
            Cómo llegar
          </a>
        )}
      </div>
      {/* Mini torneo del turno: "Armar mini torneo" (oculto hasta flags.miniTorneo) */}
      <MiniTorneoDeReserva clubId={reserva.clubId} grupoId={grupoId} fecha={reserva.fecha} confirmada={confirmada} uid={uid} />
      {otras > 0 && (
        <p className="body-sm text-ink-3 mt-3 mb-0">
          {otras === 1 ? "Tenés 1 reserva más." : `Tenés ${otras} reservas más.`} Las ves en Mis reservas.
        </p>
      )}
    </Card>
  );
}
