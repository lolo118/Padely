import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Calendar, CircleDot, LayoutGrid, ShoppingBag, Trophy, User } from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { getInscripcionesByJugador } from "../services/torneoService";
import { getProximaReservaJugador } from "../services/canchaService";
import { formatDiaCorto } from "../utils/formatDate";
import { formatPrecio } from "../utils/format";
import { estadoSeña, rangoHoras } from "../utils/reservas";
import { Badge, Button, Card, RankMark, StatTile } from "../components/ui";
import CuentaTurnoResumen from "../components/CuentaTurnoResumen";
import { escucharMisCuentasAbiertas } from "../services/cuentasService";

// Accesos directos del inicio (mismas rutas de siempre), cada uno con su ícono Lucide
const ACCESOS = [
  { to: "/clubes", label: "Reservar cancha", sub: "Ver canchas disponibles", icon: LayoutGrid },
  { to: "/mis-reservas", label: "Mis reservas", sub: "Próximas y anteriores", icon: Calendar },
  { to: "/torneos", label: "Torneos", sub: "Inscribite o mirá resultados", icon: Trophy },
  { to: "/perfil", label: "Mi perfil", sub: "Datos y estadísticas", icon: User },
  { to: "/marketplace", label: "Tienda", sub: "Equipamiento y accesorios", icon: ShoppingBag },
];

// "pendiente_aprobacion" → "Pendiente aprobacion" (solo presentación, sentence case)
function sentenceCase(s) {
  const texto = String(s || "").replace(/_/g, " ");
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// Fila de una inscripción dentro de una tarjeta: toda la fila es el link al torneo
function filaInscripcion(insc, badge) {
  return (
    <li key={insc.id}>
      <Link
        to={`/torneos/${insc.torneoId}`}
        className="flex items-center justify-between gap-3 rounded-md px-4 py-3 bg-surface-sunken hover:bg-surface-hover"
      >
        <div className="min-w-0">
          <p className="heading-sm truncate">{insc.torneoNombre}</p>
          <p className="body-sm text-ink-2">
            {insc.apellido1} / {insc.apellido2}
          </p>
        </div>
        {badge}
      </Link>
    </li>
  );
}

export default function Inicio() {
  const { user, perfil } = useAuthStore();
  const [inscripciones, setInscripciones] = useState([]);
  const [proximaReserva, setProximaReserva] = useState(null);
  const [cuentasAbiertas, setCuentasAbiertas] = useState([]);
  useEffect(() => {
    if (!user) return undefined;
    const unsub = escucharMisCuentasAbiertas(user.uid, setCuentasAbiertas, (err) => console.error("Error escuchando mis cuentas:", err));
    return () => unsub();
  }, [user]);
  const [loading, setLoading] = useState(true);

  // Nombre real del perfil (users/{uid}); si no hay, el prefijo del email
  const nombre = perfil?.nombre || user?.email?.split("@")[0] || "Jugador";

  useEffect(() => {
    if (!user) return;
    const cargar = async () => {
      try {
        const [insc, proxima] = await Promise.all([
          getInscripcionesByJugador(user.uid),
          getProximaReservaJugador(user.uid).catch((err) => {
            console.error("Error cargando la próxima reserva:", err);
            return null;
          }),
        ]);
        setInscripciones(insc);
        setProximaReserva(proxima);
      } catch (err) {
        console.error("Error:", err);
      }
      setLoading(false);
    };
    cargar();
  }, [user]);

  if (loading) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <p className="sr-only">Cargando inicio…</p>
        <div className="pd-skeleton h-4 w-24" />
        <div className="pd-skeleton h-10 w-48 mb-2" />
        <div className="pd-skeleton h-44 rounded-lg!" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="pd-skeleton h-24 rounded-lg!" />
          <div className="pd-skeleton h-24 rounded-lg!" />
          <div className="pd-skeleton h-24 rounded-lg!" />
        </div>
      </div>
    );
  }

  const inscPendientes = inscripciones.filter(
    (i) => i.status !== "confirmada" && i.status !== "rechazada"
  );
  const inscConfirmadas = inscripciones.filter((i) => i.status === "confirmada");
  // La categoría (nivel) la asigna el sistema de puntos, no cuenta como dato faltante
  const perfilIncompleto = perfil && (!perfil.telefono || !perfil.genero);

  const hora = new Date().getHours();
  const saludo = hora < 12 ? "Buenos días" : hora < 19 ? "Buenas tardes" : "Buenas noches";

  const reservaConfirmada = proximaReserva?.status === "confirmada";
  // Seña de la próxima reserva (null cuando el club no pide); una reserva vieja de una hora ya viene normalizada
  const señaProxima = proximaReserva ? estadoSeña(proximaReserva) : null;

  return (
    <div className="flex flex-col gap-4">
      <header className="mb-2">
        <p className="pd-eyebrow">{saludo}</p>
        <h1 className="display-lg">{nombre}</h1>
      </header>

      {/* Mis reservas: la próxima si hay, y el link a la lista (ya no está en la navegación inferior) */}
      <Card>
        <Card.Row>
          <Card.Title as="h2">Mis reservas</Card.Title>
          {proximaReserva && (
            <span className="flex flex-wrap items-center justify-end gap-2">
              {señaProxima && (
                <Badge tone={señaProxima.tone}>
                  {señaProxima.tone === "success" ? señaProxima.label : `Seña ${formatPrecio(señaProxima.monto)} pendiente`}
                </Badge>
              )}
              <Badge dot tone={reservaConfirmada ? "success" : "warning"}>
                {reservaConfirmada ? "Confirmada" : "Pendiente"}
              </Badge>
            </span>
          )}
        </Card.Row>
        {proximaReserva ? (
          <div className="mt-3">
            <p className="pd-eyebrow">Tu próxima reserva</p>
            <p className="heading-sm truncate mt-1">
              {proximaReserva.clubNombre || "Club"} · {proximaReserva.canchaName || "Cancha"}
            </p>
            <p className="body-sm text-ink-2 pd-tnum">
              {formatDiaCorto(proximaReserva.fecha)} ·{" "}
              {rangoHoras(proximaReserva.horaInicio || proximaReserva.hora, proximaReserva.horaFin)}
              {proximaReserva.precioTotal > 0 && ` · ${formatPrecio(proximaReserva.precioTotal)}`}
            </p>
            <CuentaTurnoResumen
              reserva={proximaReserva}
              cuenta={cuentasAbiertas.find((c) => c.id === (proximaReserva.grupoId || proximaReserva.id) && c.clubId === proximaReserva.clubId) || null}
              compacto
            />
          </div>
        ) : (
          <Card.Meta>Todavía no tenés reservas. Reservá una cancha y la vas a ver acá.</Card.Meta>
        )}
        <Card.Foot>
          <Button as="link" to="/mis-reservas" icon={<Calendar className="pd-icon" size={20} aria-hidden="true" />}>
            Mis reservas
          </Button>
        </Card.Foot>
      </Card>

      {perfilIncompleto && (
        <Card variant="hover" as={Link} to="/perfil" className="block">
          <div className="flex items-start gap-3">
            <AlertTriangle className="pd-icon text-warning mt-0.5" size={20} aria-hidden="true" />
            <div>
              <p className="heading-sm">Completá tu perfil</p>
              <p className="body-sm text-ink-2 mt-1">Necesitamos tus datos para inscribirte a torneos</p>
            </div>
          </div>
        </Card>
      )}

      {/* Puntos, categoría y torneos: salen del perfil ya cargado en el store */}
      {perfil && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <StatTile value={perfil.puntos || 0} label="Puntos" />
          <StatTile value={perfil.nivel || "—"} label="Categoría">
            <RankMark nivel={perfil.nivel} size={40} />
          </StatTile>
          <StatTile value={perfil.torneosJugados || 0} label="Torneos jugados" />
        </div>
      )}

      {/* Accesos directos */}
      <div className="grid grid-cols-2 gap-4">
        {ACCESOS.map((acceso) => {
          const Icono = acceso.icon;
          return (
            <Card key={acceso.to} variant="hover" as={Link} to={acceso.to} className="block">
              <Icono className="pd-icon text-ink-2 mb-3" size={20} aria-hidden="true" />
              <p className="heading-sm">{acceso.label}</p>
              <p className="body-sm text-ink-2 mt-1">{acceso.sub}</p>
            </Card>
          );
        })}
      </div>

      {inscPendientes.length > 0 && (
        <Card>
          <Card.Title as="h2">
            Inscripciones pendientes <span className="pd-count text-ink-3 font-semibold">{inscPendientes.length}</span>
          </Card.Title>
          <ul className="flex flex-col gap-2 mt-3">
            {inscPendientes.map((insc) =>
              filaInscripcion(
                insc,
                <Badge dot tone="warning">
                  {sentenceCase(insc.status)}
                </Badge>
              )
            )}
          </ul>
        </Card>
      )}

      {inscConfirmadas.length > 0 && (
        <Card>
          <Card.Title as="h2">Mis torneos activos</Card.Title>
          <ul className="flex flex-col gap-2 mt-3">
            {inscConfirmadas.slice(0, 3).map((insc) =>
              filaInscripcion(
                insc,
                <Badge dot tone="success">
                  Inscripto
                </Badge>
              )
            )}
          </ul>
        </Card>
      )}

      {inscPendientes.length === 0 && inscConfirmadas.length === 0 && (
        <Card className="text-center">
          <CircleDot className="pd-icon-lg mx-auto mb-3 text-ink-3" size={24} aria-hidden="true" />
          <p className="heading-sm">Bienvenido a Padely</p>
          <p className="body-sm text-ink-2 mt-1">Reservá una cancha o inscribite a un torneo para empezar.</p>
        </Card>
      )}
    </div>
  );
}
