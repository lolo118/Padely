import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Bell, Calendar, Check, Hourglass, Info, LayoutGrid, Lock, Pencil, Plus } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { getTorneosByOrganizer, getTorneosDeClub } from "../../services/torneoService";
import {
  getClubByOwner,
  getCanchas,
  getReservas,
  getReservasPendientes,
  getTurnosFijos,
  actualizarReservaGrupo,
} from "../../services/canchaService";
import { notificarReservaConfirmada, notificarReservaRechazada } from "../../services/notificationService";
import { addDaysLocal, formatFecha } from "../../utils/formatDate";
import { formatPrecio } from "../../utils/format";
import { agruparReservas, estadoSeña, rangoHoras } from "../../utils/reservas";
import { canchasDelTorneo } from "../../utils/torneo";
import { toast } from "../../components/Toast";
import { confirmar } from "../../components/ConfirmDialog";
import { Badge, Button, Card, StatTile } from "../../components/ui";

export default function Dashboard() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [club, setClub] = useState(null);
  const [torneos, setTorneos] = useState([]);
  const [canchas, setCanchas] = useState([]);
  // Reservas agrupadas (agruparReservas): una entrada por reserva, con horaInicio/horaFin/precioTotal/seña y
  // `id` = grupoId. Una reserva de varias horas cuenta una sola vez; los documentos viejos son reservas de una hora.
  const [reservasHoy, setReservasHoy] = useState([]);
  const [turnosFijos, setTurnosFijos] = useState([]);
  const [reservasManana, setReservasManana] = useState([]);
  // Pendientes de aprobación de todas las fechas (no solo hoy)
  const [reservasPendientes, setReservasPendientes] = useState([]);
  // Torneos vinculados al club (cualquier estado): de acá sale la tarjeta de la semana
  const [torneosClub, setTorneosClub] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mostrarAyuda, setMostrarAyuda] = useState(true);

  const hoy = new Date();
  const hoyStr = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
  const manana = new Date(hoy);
  manana.setDate(manana.getDate() + 1);
  const mananaStr = `${manana.getFullYear()}-${String(manana.getMonth() + 1).padStart(2, "0")}-${String(manana.getDate()).padStart(2, "0")}`;
  const ahora = new Date();
  const horaActual = ahora.getHours();

  useEffect(() => {
    if (!user) return;
    const cargar = async () => {
      try {
        const [torneosData, clubData] = await Promise.all([
          getTorneosByOrganizer(user.uid),
          getClubByOwner(user.uid),
        ]);
        setTorneos(torneosData);
        if (clubData) {
          setClub(clubData);
          const [canchasData, reservasData, turnosData, reservasMananaData, pendientesData, torneosClubData] =
            await Promise.all([
              getCanchas(clubData.id),
              getReservas(clubData.id, hoyStr),
              getTurnosFijos(clubData.id),
              getReservas(clubData.id, mananaStr),
              getReservasPendientes(clubData.id),
              // Si falla, el resto del resumen sigue; solo no se muestra la tarjeta de torneos en el club
              getTorneosDeClub(clubData.id).catch((err) => {
                console.error("Error al cargar los torneos del club:", err);
                return [];
              }),
            ]);
          setCanchas(canchasData);
          setReservasHoy(agruparReservas(reservasData));
          setTurnosFijos(turnosData);
          setReservasManana(agruparReservas(reservasMananaData));
          setReservasPendientes(agruparReservas(pendientesData));
          setTorneosClub(torneosClubData);
        }
      } catch (err) {
        console.error("Error al cargar dashboard:", err);
      }
      setLoading(false);
    };
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (loading) {
    return (
      <div aria-busy="true">
        <span className="sr-only">Cargando...</span>
        <div className="pd-skeleton h-8 w-64 mb-2" />
        <div className="pd-skeleton h-4 w-80 max-w-full mb-6" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="pd-skeleton h-[92px] rounded-lg" />
          ))}
        </div>
        <div className="pd-skeleton h-40 rounded-lg mb-4" />
        <div className="pd-skeleton h-40 rounded-lg" />
      </div>
    );
  }

  const reservasConfirmadas = reservasHoy.filter(
    (r) => r.status === "confirmada",
  );
  const ingresosHoy = reservasConfirmadas.reduce(
    (sum, r) => sum + (Number(r.precioTotal) || 0),
    0,
  );
  const turnosFijosActivos = turnosFijos.filter((t) => t.status === "activo");

  const horaAhora = `${String(horaActual).padStart(2, "0")}:00`;
  const partesFecha = hoyStr.split("-");
  const fechaLocal = new Date(
    Number(partesFecha[0]),
    Number(partesFecha[1]) - 1,
    Number(partesFecha[2]),
  );
  const diasMap = {
    0: "Domingo",
    1: "Lunes",
    2: "Martes",
    3: "Miércoles",
    4: "Jueves",
    5: "Viernes",
    6: "Sábado",
  };
  const diaHoy = diasMap[fechaLocal.getDay()];

  // Una reserva está en curso mientras horaInicio <= ahora < horaFin (las "HH:MM" se comparan como texto)
  const enCursoAhora = (r) => !!r.horaInicio && r.horaInicio <= horaAhora && horaAhora < r.horaFin;

  const canchasLibresAhora = canchas.filter((c) => {
    const disponible = (c.horariosDisponibles || []).includes(horaAhora);
    if (!disponible) return false;
    if (
      reservasHoy.some(
        (r) =>
          r.canchaId === c.id &&
          enCursoAhora(r) &&
          r.status !== "cancelada",
      )
    )
      return false;
    if (
      turnosFijosActivos.some(
        (t) =>
          t.canchaId === c.id &&
          t.dia === diaHoy &&
          (t.horas || [t.hora]).includes(horaAhora),
      )
    )
      return false;
    return true;
  }).length;

  const proximasReservas = reservasConfirmadas
    .filter((r) => parseInt(r.hora) >= horaActual)
    .sort((a, b) => a.hora.localeCompare(b.hora))
    .slice(0, 5);

  const reservasMananaConfirmadas = reservasManana.filter((r) => r.status !== "cancelada");

  // Confirmar y rechazar actúan sobre la reserva entera (todos sus turnos) y avisan una sola vez al jugador
  const handleConfirmarReserva = async (grupoId) => {
    try {
      await actualizarReservaGrupo(club.id, grupoId, { status: "confirmada" });
      const reserva = reservasPendientes.find((r) => r.id === grupoId);
      if (reserva?.jugadorUid) {
        notificarReservaConfirmada(reserva.jugadorUid, club.nombre, reserva.canchaName || "", reserva.fecha, rangoHoras(reserva.horaInicio, reserva.horaFin));
      }
      setReservasPendientes(reservasPendientes.filter((r) => r.id !== grupoId));
      setReservasHoy(reservasHoy.map((r) => r.id === grupoId ? { ...r, status: "confirmada" } : r));
      toast.success("Reserva confirmada");
    } catch (err) {
      console.error(err);
      toast.error("No pudimos confirmar la reserva. Intentá de nuevo.");
    }
  };

  const handleRechazarReserva = async (grupoId) => {
    const ok = await confirmar({ titulo: "Rechazar reserva", mensaje: "¿Rechazar esta reserva? Se le avisará al jugador.", confirmText: "Rechazar", danger: true });
    if (!ok) return;
    try {
      await actualizarReservaGrupo(club.id, grupoId, { status: "cancelada" });
      const reserva = reservasPendientes.find((r) => r.id === grupoId);
      if (reserva?.jugadorUid) {
        notificarReservaRechazada(reserva.jugadorUid, club.nombre, reserva.canchaName || "", reserva.fecha, rangoHoras(reserva.horaInicio, reserva.horaFin));
      }
      setReservasPendientes(reservasPendientes.filter((r) => r.id !== grupoId));
      setReservasHoy(reservasHoy.map((r) => r.id === grupoId ? { ...r, status: "cancelada" } : r));
      toast.success("Reserva rechazada");
    } catch (err) {
      console.error(err);
      toast.error("No pudimos rechazar la reserva. Intentá de nuevo.");
    }
  };

  // Props para que un StatTile o una Card enteros naveguen (mismo navigate que antes) y sean accesibles por teclado
  const linkProps = (to) => ({
    role: "link",
    tabIndex: 0,
    onClick: () => navigate(to),
    onKeyDown: (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        navigate(to);
      }
    },
  });

  const torneosProximos = torneos.filter(
    (t) => t.status === "inscripcion" || t.status === "en_curso",
  );

  // Torneos con sede aceptada que pisan los próximos 7 días. Los cancelados y finalizados no bloquean turnos,
  // así que no cuentan. Tolera torneos viejos sin `club` o sin fechas.
  const limiteSemana = addDaysLocal(hoyStr, 7);
  const torneosClubSemana = torneosClub.filter(
    (t) =>
      t.club?.estado === "aceptado" &&
      t.status !== "cancelado" &&
      t.status !== "finalizado" &&
      typeof t.fechaInicio === "string" &&
      typeof t.fechaFin === "string" &&
      t.fechaInicio <= limiteSemana &&
      t.fechaFin >= hoyStr,
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="heading-lg m-0">{club ? `Bienvenido, ${club.nombre}` : "Hoy"}</h1>
        <p className="body-sm text-ink-2 mt-1 mb-0">
          Resumen del día —{" "}
          {new Date().toLocaleDateString("es-AR", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      </div>

      {/* Alertas */}
      {(reservasPendientes.length > 0 || reservasMananaConfirmadas.length > 0) && (
        <div className="flex flex-col gap-2 mb-4">
          {reservasPendientes.length > 0 && (
            <Card as="div" role="status" className="flex items-center justify-between gap-3 flex-wrap py-3!">
              <span className="flex items-center gap-2 body-sm">
                <Hourglass className="pd-icon text-warning" size={20} aria-hidden="true" />
                <span>
                  Tenés <strong>{reservasPendientes.length}</strong> reserva{reservasPendientes.length !== 1 ? "s" : ""} pendiente{reservasPendientes.length !== 1 ? "s" : ""} de aprobación
                </span>
              </span>
              <Button size="sm" onClick={() => navigate("/admin/canchas")}>
                Ver reservas
              </Button>
            </Card>
          )}
          {reservasMananaConfirmadas.length > 0 && (
            <Card as="div" role="status" className="flex items-center gap-2 body-sm py-3!">
              <Calendar className="pd-icon text-ink-3" size={20} aria-hidden="true" />
              <span>
                Mañana tenés <strong>{reservasMananaConfirmadas.length}</strong> reserva{reservasMananaConfirmadas.length !== 1 ? "s" : ""} programada{reservasMananaConfirmadas.length !== 1 ? "s" : ""}
              </span>
            </Card>
          )}
        </div>
      )}

      {/* Ayuda contextual */}
      {mostrarAyuda && (
        <Card as="aside" className="mb-4">
          <Card.Row className="mb-3">
            <span className="flex items-center gap-2 heading-sm">
              <Info className="pd-icon text-ink-3" size={20} aria-hidden="true" />
              Funcionalidades automáticas
            </span>
            <Button variant="ghost" size="sm" onClick={() => setMostrarAyuda(false)}>
              Ocultar
            </Button>
          </Card.Row>
          <ul className="m-0 p-0 list-none grid gap-2">
            <li className="flex items-start gap-2">
              <Bell className="pd-icon text-ink-3" size={20} aria-hidden="true" />
              <p className="body-sm text-ink-2 m-0">Cuando un jugador reserva una cancha, recibís una <strong>notificación automática</strong>. Si tenés aprobación manual activa, podés confirmar o rechazar desde acá.</p>
            </li>
            <li className="flex items-start gap-2">
              <Pencil className="pd-icon text-ink-3" size={20} aria-hidden="true" />
              <p className="body-sm text-ink-2 m-0">Podés crear <strong>reservas manuales</strong> tocando los horarios libres en la grilla de canchas.</p>
            </li>
            <li className="flex items-start gap-2">
              <Lock className="pd-icon text-ink-3" size={20} aria-hidden="true" />
              <p className="body-sm text-ink-2 m-0">Podés <strong>bloquear horarios</strong> temporalmente pasando el mouse sobre un horario libre y tocando el candado.</p>
            </li>
            <li className="flex items-start gap-2">
              <Calendar className="pd-icon text-ink-3" size={20} aria-hidden="true" />
              <p className="body-sm text-ink-2 m-0">En Canchas podés alternar entre <strong>vista diaria y semanal</strong> para planificar mejor la semana.</p>
            </li>
          </ul>
        </Card>
      )}

      {/* Recordatorio completar perfil */}
      {club && (!club.telefono || !club.direccion) && (
        <Card variant="hover" as="div" className="mb-4 flex items-start gap-3" {...linkProps("/admin/configuracion")}>
          <AlertTriangle className="pd-icon text-warning mt-0.5" size={20} aria-hidden="true" />
          <div>
            <p className="heading-sm m-0">Completá los datos de tu club</p>
            <p className="body-sm text-ink-2 m-0">
              Agregá teléfono, dirección y redes sociales para que los jugadores te encuentren
            </p>
          </div>
        </Card>
      )}

      {/* Tarjetas resumen */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatTile value={reservasConfirmadas.length} label="Reservas hoy" className="cursor-pointer hover:bg-surface-hover!" {...linkProps("/admin/canchas")} />
        <StatTile value={formatPrecio(ingresosHoy)} label="Ingresos hoy" className="cursor-pointer hover:bg-surface-hover!" {...linkProps("/admin/estadisticas")} />
        <StatTile value={turnosFijosActivos.length} label="Turnos fijos activos" className="cursor-pointer hover:bg-surface-hover!" {...linkProps("/admin/canchas")} />
        <StatTile value={canchasLibresAhora} label="Canchas libres ahora" className="cursor-pointer hover:bg-surface-hover!" {...linkProps("/admin/canchas")} />
      </div>

      {/* Reservas pendientes */}
      <section className="mb-8">
        <h2 className="heading-md m-0 mb-3">
          Reservas pendientes{" "}
          {reservasPendientes.length > 0 && <span className="pd-count text-ink-3 font-medium">{reservasPendientes.length}</span>}
        </h2>
        {reservasPendientes.length === 0 ? (
          <p className="body-sm text-ink-2 m-0">No hay reservas pendientes</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
            {reservasPendientes.map((r) => {
              const seña = estadoSeña(r);
              return (
                <Card key={r.claveGrupo || r.id}>
                  <Card.Row>
                    <Card.Eyebrow>
                      {r.canchaName || "Cancha"} · {formatFecha(r.fecha)} · {rangoHoras(r.horaInicio, r.horaFin)}
                    </Card.Eyebrow>
                    <Badge tone="warning" dot>
                      Pendiente
                    </Badge>
                  </Card.Row>
                  <Card.Title className="mt-2!">{r.nombreJugador || "Jugador"}</Card.Title>
                  {(r.precio != null || seña) && (
                    <div className="flex items-center gap-2 flex-wrap mt-1">
                      {r.precio != null && <Card.Meta className="pd-tnum m-0!">{formatPrecio(r.precioTotal)}</Card.Meta>}
                      {seña && (
                        <Badge tone={seña.tone}>
                          {seña.tone === "warning" ? `Seña ${formatPrecio(seña.monto)} pendiente` : seña.label}
                        </Badge>
                      )}
                    </div>
                  )}
                  <Card.Foot>
                    <Button size="sm" icon={<Check className="pd-icon" size={20} aria-hidden="true" />} onClick={() => handleConfirmarReserva(r.id)}>
                      Confirmar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleRechazarReserva(r.id)}>
                      Rechazar
                    </Button>
                  </Card.Foot>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Próximas reservas */}
      <Card className="mb-4">
        <Card.Title>Próximas reservas hoy</Card.Title>
        {proximasReservas.length === 0 ? (
          <p className="body-sm text-ink-2 mt-3 mb-0">No hay más reservas para hoy</p>
        ) : (
          <ul className="m-0 mt-2 p-0 list-none divide-y divide-line">
            {proximasReservas.map((r, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="numeral-md pd-tnum min-w-14 flex-none">{rangoHoras(r.horaInicio, r.horaFin)}</span>
                  <div className="min-w-0">
                    <p className="body-md font-medium! m-0 truncate">{r.nombreJugador || "Jugador"}</p>
                    <p className="body-sm text-ink-2 m-0">{r.canchaName || "Cancha"}</p>
                  </div>
                </div>
                <span className="body-sm font-semibold! pd-tnum">{formatPrecio(r.precioTotal || 0)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Turnos activos ahora */}
      <Card className="mb-4">
        <Card.Title>Turnos activos ahora</Card.Title>
        {(() => {
          const turnosAhora = reservasConfirmadas.filter(enCursoAhora);
          const turnosFijosAhora = turnosFijosActivos.filter(
            (t) =>
              t.dia === diaHoy && (t.horas || [t.hora]).includes(horaAhora),
          );
          if (turnosAhora.length === 0 && turnosFijosAhora.length === 0) {
            return <p className="body-sm text-ink-2 mt-3 mb-0">No hay turnos activos en este momento</p>;
          }
          return (
            <ul className="m-0 mt-2 p-0 list-none divide-y divide-line">
              {turnosAhora.map((r, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="numeral-md pd-tnum min-w-14 flex-none">{rangoHoras(r.horaInicio, r.horaFin)}</span>
                    <div className="min-w-0">
                      <p className="body-md font-medium! m-0 truncate">{r.nombreJugador || "Jugador"}</p>
                      <p className="body-sm text-ink-2 m-0">{r.canchaName || "Cancha"}</p>
                    </div>
                  </div>
                  <Badge tone="lime">En juego</Badge>
                </li>
              ))}
              {turnosFijosAhora.map((tf, i) => (
                <li key={`tf-${i}`} className="flex items-center justify-between gap-3 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="numeral-md pd-tnum flex-none">{(tf.horas || [tf.hora]).join(", ")}</span>
                    <div className="min-w-0">
                      <p className="body-md font-medium! m-0 truncate">{tf.nombreJugador}</p>
                      <p className="body-sm text-ink-2 m-0">{tf.canchaName} · Turno fijo</p>
                    </div>
                  </div>
                  <Badge tone="night">Fijo</Badge>
                </li>
              ))}
            </ul>
          );
        })()}
      </Card>

      {/* Torneos en el club esta semana: sus partidos programados bloquean turnos en la grilla */}
      {torneosClubSemana.length > 0 && (
        <Card className="mb-4">
          <Card.Title>Torneos en el club esta semana</Card.Title>
          <ul className="m-0 mt-2 p-0 list-none divide-y divide-line">
            {torneosClubSemana.map((t) => {
              const canchasTorneo = canchasDelTorneo(t);
              return (
                <li key={t.id} className="flex flex-col gap-2 py-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <p className="body-md font-medium! m-0 truncate">{t.nombre}</p>
                    <span className="body-sm text-ink-2 pd-tnum shrink-0">
                      {formatFecha(t.fechaInicio)} – {formatFecha(t.fechaFin)}
                    </span>
                  </div>
                  {canchasTorneo.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {canchasTorneo.map((c) => (
                        <Badge key={c.id}>{c.nombre}</Badge>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="pd-help m-0 mt-2">Los partidos programados bloquean esos turnos en la grilla de canchas.</p>
          <Card.Foot>
            <Button as="link" to="/admin/torneos?tab=club">
              Ver torneos
            </Button>
          </Card.Foot>
        </Card>
      )}

      {/* Torneos próximos */}
      {torneos.length > 0 && (
        <section className="mb-8">
          <h2 className="heading-md m-0 mb-3">Torneos próximos</h2>
          <div className="grid gap-4 md:grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
            {torneosProximos.slice(0, 3).map((t) => (
              <Card key={t.id} variant="hover" {...linkProps(`/admin/torneos/${t.id}`)}>
                <Card.Row>
                  <Card.Eyebrow>{t.sede}</Card.Eyebrow>
                  <Badge tone={t.status === "inscripcion" ? "court" : "lime"}>
                    {t.status === "inscripcion" ? "Inscripción" : "En curso"}
                  </Badge>
                </Card.Row>
                <Card.Title className="mt-2!">{t.nombre}</Card.Title>
                <Card.Meta>
                  {formatFecha(t.fechaInicio)} – {formatFecha(t.fechaFin)}
                </Card.Meta>
              </Card>
            ))}
          </div>
          {torneosProximos.length === 0 && <p className="body-sm text-ink-2 m-0">No hay torneos próximos</p>}
        </section>
      )}

      {/* Accesos rápidos */}
      <div className="pd-btn-group">
        <Button icon={<Plus className="pd-icon" size={20} aria-hidden="true" />} onClick={() => navigate("/admin/torneos/nuevo")}>
          Crear torneo
        </Button>
        <Button icon={<LayoutGrid className="pd-icon" size={20} aria-hidden="true" />} onClick={() => navigate("/admin/canchas")}>
          Gestionar canchas
        </Button>
      </div>
    </div>
  );
}
