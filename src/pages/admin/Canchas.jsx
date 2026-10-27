import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Check, Coins, Lock, Plus, Settings, Trash2, X } from "lucide-react";
import FichaTurno from "../../components/turno/FichaTurno";
import { useAuthStore } from "../../store/authStore";
import PerfilIncompleto from "../../components/PerfilIncompleto";
import SinPermiso from "../../components/SinPermiso";
import {
  getCanchas,
  crearCancha,
  actualizarCancha,
  eliminarCancha,
  getReservas,
  crearReserva,
  actualizarReserva,
  actualizarReservaGrupo,
  cancelarReservaGrupo,
  marcarSeñaPagada,
  eliminarReservaGrupo,
  actualizarClubConfig,
  getTurnosFijos,
} from "../../services/canchaService";
import TabTurnosFijos from "./TabTurnosFijos";
import { formatFecha, getTodayLocal } from "../../utils/formatDate";
import { formatPrecio } from "../../utils/format";
import {
  precioDeSlot,
  precioDeReserva,
  preciosDeReserva,
  precioMinimo,
  calcularSeña,
  maxTurnosDelClub,
  sumarHoras,
} from "../../utils/tarifas";
import { grupoDeReserva, rangoHoras, normalizarReserva, esPrimerSlot, agruparReservas, estadoSeña } from "../../utils/reservas";
import { getNombrePareja } from "../../utils/torneo";
import { notificarReservaConfirmada, notificarReservaRechazada } from "../../services/notificationService";
import { toast } from "../../components/Toast";
import { confirmar } from "../../components/ConfirmDialog";
import { Badge, Button, Card, Field, Input, Pills, Select, SlotCell, Tabs } from "../../components/ui";

const superficies = ["Cemento", "Sintético", "Césped", "Otro"];

const horasDelDia = Array.from({ length: 24 }, (_, i) => {
  const h = i.toString().padStart(2, "0");
  return `${h}:00`;
});

const diasLabels = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

// Las horas como pastillas multi-selección (pd-pills con aria-pressed)
const itemsHoras = horasDelDia.map((h) => ({ value: h, label: h }));

// El motivo de un bloqueo se guarda como "🔒 Motivo" (dato); acá solo se saca el candado para mostrarlo
const motivoDeBloqueo = (nombre) => (nombre || "").replace(/^🔒\s*/, "");

// Turno bloqueado por un partido de torneo: lo escribe la Cloud Function (tipo "torneo") y el club no lo
// puede confirmar, cancelar ni borrar. En las grillas es una celda quieta sin acciones.
const esBloqueoTorneo = (reserva) => reserva?.tipo === "torneo";
const nombreTorneo = (reserva) => reserva?.torneoNombre || "";
const tituloBloqueoTorneo = (reserva) => `Lo bloquea el torneo ${nombreTorneo(reserva)}`.trim();

// "Pareja A vs Pareja B" del partido que bloquea el turno, o "" si el bloqueo no trae el partido
const partidoDeBloqueo = (reserva) => {
  const p = reserva?.partido;
  if (!p || (!p.pareja1 && !p.pareja2)) return "";
  return `${getNombrePareja(p.pareja1)} vs ${getNombrePareja(p.pareja2)}`;
};

// Estado visual de la celda de una reserva viva (pendiente o reservada)
const estadoDeReserva = (reserva) => (reserva?.status === "pendiente" ? "pendiente" : "reservada");

// Los N turnos de una reserva comparten grupoId: un cambio local (status, seña cobrada) se aplica a todos sus slots.
// Una reserva vieja de una hora (sin grupoId) es su propio grupo, igual que un bloqueo del club.
const actualizarGrupoLocal = (lista, grupoId, cambios) =>
  lista.map((r) => (grupoDeReserva(r) === grupoId ? { ...r, ...cambios } : r));

// Las horas habilitadas son las mismas para semana y fin de semana (las claves de `horarios`): el mapa de finde
// solo guarda las horas que siguen habilitadas, como números. Un mapa vacío significa "igual que la semana".
const podarFinde = (finde, horarios) => {
  const resultado = {};
  Object.keys(finde || {}).forEach((h) => {
    if (horarios?.[h] !== undefined) resultado[h] = Number(finde[h]) || 0;
  });
  return resultado;
};

const itemsTarifa = [
  { value: "semana", label: "Semana" },
  { value: "finde", label: "Fin de semana" },
];

// Etiqueta del Badge de seña: "Seña $ 5.000 pendiente" (warning) o "Seña cobrada" (success)
const etiquetaSeña = (info) => (info.tone === "success" ? info.label : `Seña ${formatPrecio(info.monto)} ${info.label}`);

function WeeklyGrid({ canchas, fechaBase, getReservasForDate, getTurnosFijosData, onAbrirTurno }) {
  const [weekData, setWeekData] = useState({});
  const [loadingWeek, setLoadingWeek] = useState(true);

  const dias = useMemo(() => {
    const partes = fechaBase.split("-");
    const base = new Date(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2]));
    const dayOfWeek = base.getDay();
    const monday = new Date(base);
    monday.setDate(base.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));

    const lista = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const str = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      lista.push({ date: str, label: diasLabels[d.getDay()], dayNum: d.getDate() });
    }
    return lista;
  }, [fechaBase]);

  useEffect(() => {
    const cargar = async () => {
      setLoadingWeek(true);
      const data = {};
      for (const dia of dias) {
        try { data[dia.date] = await getReservasForDate(dia.date); }
        catch { data[dia.date] = []; }
      }
      setWeekData(data);
      setLoadingWeek(false);
    };
    cargar();
  }, [fechaBase, canchas.length, dias, getReservasForDate]);

  const esTurnoFijoSemana = (canchaId, hora, fechaStr) => {
    const p = fechaStr.split("-");
    const d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    const diasMap = { 0: "Domingo", 1: "Lunes", 2: "Martes", 3: "Miércoles", 4: "Jueves", 5: "Viernes", 6: "Sábado" };
    return getTurnosFijosData.some(
      (t) => t.canchaId === canchaId && t.dia === diasMap[d.getDay()] && (t.horas || [t.hora]).includes(hora) && t.status === "activo"
    );
  };

  if (loadingWeek) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true" aria-label="Cargando semana">
        <div className="pd-skeleton h-5 w-32" />
        <div className="pd-skeleton h-64 w-full rounded-lg" />
      </div>
    );
  }

  const columnas = { gridTemplateColumns: "56px repeat(7, minmax(88px, 1fr))" };

  return (
    <div className="flex flex-col gap-5">
      {canchas.map((cancha) => {
        const horasCancha = cancha.horariosDisponibles || [];
        if (horasCancha.length === 0) return null;
        return (
          <div key={cancha.id}>
            <p className="heading-sm m-0 mb-2">{cancha.nombre}</p>
            <div className="overflow-x-auto">
              <div className="pd-grid pd-grid-quiet min-w-[680px]" style={columnas} role="grid" aria-label={`Semana de ${cancha.nombre}`}>
                <div />
                {dias.map((d) => (
                  <div
                    key={d.date}
                    className={["pd-grid-head", d.date === fechaBase && "text-ink!"].filter(Boolean).join(" ")}
                    aria-current={d.date === fechaBase ? "date" : undefined}
                  >
                    {d.label}
                    <span className="block font-display text-[18px] leading-5 font-bold normal-case tracking-normal">{d.dayNum}</span>
                  </div>
                ))}
                {horasCancha.map((hora) => (
                  <div key={hora} className="contents">
                    <div className="pd-grid-time">{hora}</div>
                    {dias.map((d) => {
                      const reservas = weekData[d.date] || [];
                      const reserva = normalizarReserva(
                        reservas.find((r) => r.canchaId === cancha.id && r.hora === hora && r.status !== "cancelada"),
                      );
                      const turnoFijo = esTurnoFijoSemana(cancha.id, hora, d.date);
                      const nombreCorto = reserva?.nombreJugador?.split(" ")[0] || undefined;

                      if (esBloqueoTorneo(reserva)) {
                        return (
                          <SlotCell
                            key={d.date}
                            estado="bloqueada"
                            linea1="Torneo"
                            linea2={nombreTorneo(reserva) || undefined}
                            title={tituloBloqueoTorneo(reserva)}
                          />
                        );
                      }
                      // Hora siguiente de una reserva de varias horas: sigue el bloque del primer turno
                      if (reserva && !esPrimerSlot(reserva)) {
                        return <SlotCell key={d.date} estado={estadoDeReserva(reserva)} linea1="↳" linea2={nombreCorto} onClick={onAbrirTurno ? () => onAbrirTurno(reserva, reservas) : undefined} aria-label={`Ver turno de ${reserva.nombreJugador || "jugador"}`} />;
                      }
                      if (reserva && reserva.status === "bloqueado") {
                        return <SlotCell key={d.date} estado="bloqueada" linea2={motivoDeBloqueo(reserva.nombreJugador) || undefined} />;
                      }
                      if (reserva) {
                        return (
                          <SlotCell
                            key={d.date}
                            estado={estadoDeReserva(reserva)}
                            linea1={nombreCorto}
                            linea2={rangoHoras(reserva.horaInicio, reserva.horaFin)}
                            onClick={onAbrirTurno ? () => onAbrirTurno(reserva, reservas) : undefined}
                            aria-label={`Ver turno de ${reserva.nombreJugador || "jugador"}, ${rangoHoras(reserva.horaInicio, reserva.horaFin)}`}
                          />
                        );
                      }
                      if (turnoFijo) {
                        return <SlotCell key={d.date} estado="fijo" />;
                      }
                      // Vista de solo lectura: la celda libre es una celda quieta, no un botón
                      return (
                        <div key={d.date} className="pd-slot pd-slot-free cursor-default! hover:border-line! hover:text-ink-3!">
                          Libre
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const statusTone = {
  pendiente: "warning",
  confirmada: "success",
  cancelada: "danger",
  bloqueado: "neutral",
};

const statusLabel = {
  pendiente: "Pendiente",
  confirmada: "Confirmada",
  cancelada: "Cancelada",
  bloqueado: "Bloqueado",
};

function ReservasTab({ clubId, canchas, clubNombre }) {
  const [reservas, setReservas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("pendiente");
  const [fechaFiltro, setFechaFiltro] = useState("");

  useEffect(() => {
    const cargar = async () => {
      setLoading(true);
      try {
        // Con contactos: el email y el teléfono viven aparte y solo los ve el club
        const data = await getReservas(clubId, undefined, { contactos: true });
        setReservas(data);
      } catch (err) {
        console.error("Error cargando reservas:", err);
      }
      setLoading(false);
    };
    cargar();
  }, [clubId]);

  // El estado guarda los slots sueltos (uno por hora); la lista muestra una entrada por reserva (grupoId).
  // Cada entrada trae horaInicio/horaFin, precioTotal, seña y `slotId` (el documento del primer turno).
  const grupos = useMemo(() => agruparReservas(reservas), [reservas]);

  // Todas las acciones actúan sobre la reserva entera y avisan al jugador UNA vez con el rango de horas
  const handleConfirmar = async (reserva) => {
    const grupoId = grupoDeReserva(reserva);
    try {
      await actualizarReservaGrupo(clubId, grupoId, { status: "confirmada" });
      if (reserva?.jugadorUid) {
        notificarReservaConfirmada(reserva.jugadorUid, clubNombre, reserva.canchaName || "", reserva.fecha, rangoHoras(reserva.horaInicio, reserva.horaFin));
      }
      setReservas((prev) => actualizarGrupoLocal(prev, grupoId, { status: "confirmada" }));
      toast.success("Reserva confirmada");
    } catch (err) {
      console.error(err);
      toast.error("No pudimos confirmar la reserva. Intentá de nuevo.");
    }
  };

  const handleRechazar = async (reserva) => {
    const grupoId = grupoDeReserva(reserva);
    const ok = await confirmar({
      titulo: reserva?.status === "confirmada" ? "Cancelar reserva" : "Rechazar reserva",
      mensaje: reserva?.status === "confirmada" ? "¿Cancelar esta reserva? Se le avisará al jugador." : "¿Rechazar esta reserva? Se le avisará al jugador.",
      confirmText: reserva?.status === "confirmada" ? "Cancelar reserva" : "Rechazar",
      cancelText: "Volver",
      danger: true,
    });
    if (!ok) return;
    try {
      // P3-14 B: cancela el club → la seña pagada se devuelve siempre (onReservaUpdated)
      await cancelarReservaGrupo(clubId, grupoId, { canceladaPor: "club" });
      if (reserva?.jugadorUid) {
        notificarReservaRechazada(reserva.jugadorUid, clubNombre, reserva.canchaName || "", reserva.fecha, rangoHoras(reserva.horaInicio, reserva.horaFin));
      }
      setReservas((prev) => actualizarGrupoLocal(prev, grupoId, { status: "cancelada" }));
      toast.success(reserva?.status === "confirmada" ? "Reserva cancelada" : "Reserva rechazada");
    } catch (err) {
      console.error(err);
      toast.error("No pudimos actualizar la reserva. Intentá de nuevo.");
    }
  };

  // Un bloqueo del club es siempre un solo turno: se desbloquea su documento, como hasta ahora
  const handleDesbloquear = async (reserva) => {
    const ok = await confirmar({ titulo: "Desbloquear horario", mensaje: "¿Desbloquear este horario? Volverá a estar disponible.", confirmText: "Desbloquear" });
    if (!ok) return;
    try {
      await actualizarReserva(clubId, reserva.slotId || reserva.id, { status: "cancelada" });
      setReservas((prev) => actualizarGrupoLocal(prev, grupoDeReserva(reserva), { status: "cancelada" }));
      toast.success("Horario desbloqueado");
    } catch (err) {
      console.error(err);
      toast.error("No pudimos desbloquear el horario. Intentá de nuevo.");
    }
  };

  const handleEliminar = async (reserva) => {
    const grupoId = grupoDeReserva(reserva);
    const ok = await confirmar({ titulo: "Eliminar reserva", mensaje: "¿Eliminar esta reserva definitivamente?", confirmText: "Eliminar", danger: true });
    if (!ok) return;
    try {
      await eliminarReservaGrupo(clubId, grupoId);
      setReservas((prev) => prev.filter((r) => grupoDeReserva(r) !== grupoId));
      toast.success("Reserva eliminada");
    } catch (err) {
      console.error(err);
      toast.error("No pudimos eliminar la reserva. Intentá de nuevo.");
    }
  };

  // Seña cobrada / pendiente: se marca en todos los turnos de la reserva
  const handleSeña = async (reserva) => {
    const grupoId = grupoDeReserva(reserva);
    const pagada = !reserva.señaPagada;
    try {
      await marcarSeñaPagada(clubId, grupoId, pagada);
      setReservas((prev) => actualizarGrupoLocal(prev, grupoId, { señaPagada: pagada }));
      toast.success(pagada ? "Seña marcada como cobrada" : "Seña marcada como pendiente");
    } catch (err) {
      console.error(err);
      toast.error("No pudimos actualizar la seña. Intentá de nuevo.");
    }
  };

  const getCanchaName = (canchaId) => {
    const c = canchas.find((x) => x.id === canchaId);
    return c?.nombre || "Cancha";
  };

  // Filtros y conteos sobre reservas enteras: el estado del grupo es el del primer turno
  let filtradas = grupos;
  if (filtro !== "todas") {
    filtradas = filtradas.filter((r) => r.status === filtro);
  }
  if (fechaFiltro) {
    filtradas = filtradas.filter((r) => r.fecha === fechaFiltro);
  }
  filtradas = [...filtradas].sort((a, b) => {
    if (a.fecha !== b.fecha) return (b.fecha || "").localeCompare(a.fecha || "");
    return (a.horaInicio || "").localeCompare(b.horaInicio || "");
  });

  const pendientes = grupos.filter((r) => r.status === "pendiente").length;
  const confirmadas = grupos.filter((r) => r.status === "confirmada").length;

  if (loading) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label="Cargando reservas">
        <div className="flex gap-2">
          <div className="pd-skeleton h-9 w-28 rounded-pill" />
          <div className="pd-skeleton h-9 w-28 rounded-pill" />
          <div className="pd-skeleton h-9 w-24 rounded-pill" />
        </div>
        <div className="pd-skeleton h-28 w-full rounded-lg" />
        <div className="pd-skeleton h-28 w-full rounded-lg" />
      </div>
    );
  }

  const filtros = [
    { value: "pendiente", label: "Pendientes", count: pendientes },
    { value: "confirmada", label: "Confirmadas", count: confirmadas },
    { value: "cancelada", label: "Canceladas" },
    { value: "bloqueado", label: "Bloqueados" },
    { value: "todas", label: "Todas" },
  ];

  const filtroLabel = { pendiente: "pendientes", confirmada: "confirmadas", cancelada: "canceladas", bloqueado: "bloqueadas", todas: "" };

  return (
    <div className="flex flex-col gap-4">
      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        <Pills items={filtros} value={filtro} onChange={setFiltro} ariaLabel="Estado de la reserva" />
        <div className="flex items-center gap-1 ml-auto">
          <Input
            type="date"
            value={fechaFiltro}
            onChange={(e) => setFechaFiltro(e.target.value)}
            aria-label="Filtrar por fecha"
            className="h-9! w-auto!"
          />
          {fechaFiltro && (
            <Button variant="ghost" size="sm" onClick={() => setFechaFiltro("")}>
              Limpiar
            </Button>
          )}
        </div>
      </div>

      {/* Lista */}
      {filtradas.length === 0 ? (
        <Card className="text-center py-10!">
          <span className="pd-ball mx-auto mb-3 block!" aria-hidden="true" />
          <p className="heading-sm m-0">No hay reservas {filtroLabel[filtro]}</p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-[repeat(auto-fill,minmax(320px,1fr))]">
          {filtradas.map((r) => {
            // Una reserva cancelada con seña sin cobrar ya no tiene nada pendiente; "Seña cobrada" sí se sigue viendo
            const señaInfo = esBloqueoTorneo(r) || (r.status === "cancelada" && !r.señaPagada) ? null : estadoSeña(r);
            return (
              <Card key={r.claveGrupo || r.id}>
                <Card.Row className="items-start!">
                  <Card.Eyebrow className="pd-tnum">
                    {getCanchaName(r.canchaId)} · {formatFecha(r.fecha)} · {rangoHoras(r.horaInicio, r.horaFin)}
                  </Card.Eyebrow>
                  {esBloqueoTorneo(r) ? (
                    <Badge tone="night">Torneo</Badge>
                  ) : (
                    <Badge tone={statusTone[r.status] || statusTone.pendiente} dot>
                      {statusLabel[r.status] || "Pendiente"}
                    </Badge>
                  )}
                </Card.Row>
                <Card.Title className="mt-2! truncate">{r.nombreJugador || "Sin nombre"}</Card.Title>
                {esBloqueoTorneo(r) && partidoDeBloqueo(r) && (
                  <Card.Meta className="truncate">{partidoDeBloqueo(r)}</Card.Meta>
                )}
                {(r.email || r.telefono) && (
                  <Card.Meta className="truncate">
                    {r.email}{r.email && r.telefono ? " · " : ""}{r.telefono}
                  </Card.Meta>
                )}
                <Card.Foot className="flex-wrap">
                  {!esBloqueoTorneo(r) && <span className="numeral-md pd-tnum">{formatPrecio(r.precioTotal)}</span>}
                  {señaInfo && <Badge tone={señaInfo.tone}>{etiquetaSeña(señaInfo)}</Badge>}
                  {/* Un bloqueo de torneo no tiene acciones: solo lo libera la Function al reprogramar o cerrar el torneo */}
                  {esBloqueoTorneo(r) && (
                    <span className="body-sm text-ink-3">{tituloBloqueoTorneo(r)}</span>
                  )}
                  <div className="pd-btn-group ml-auto">
                    {/* En una reserva cancelada la seña ya no se marca: queda solo el Badge */}
                    {señaInfo && r.status !== "cancelada" && (
                      <Button
                        size="sm"
                        aria-pressed={!!r.señaPagada}
                        icon={<Coins className="pd-icon" size={20} aria-hidden="true" />}
                        onClick={() => handleSeña(r)}
                      >
                        {r.señaPagada ? "Seña cobrada" : "Marcar seña cobrada"}
                      </Button>
                    )}
                    {!esBloqueoTorneo(r) && r.status === "pendiente" && (
                      <>
                        <Button size="sm" icon={<Check className="pd-icon" size={20} aria-hidden="true" />} onClick={() => handleConfirmar(r)}>
                          Confirmar
                        </Button>
                        <Button size="sm" variant="ghost" icon={<X className="pd-icon" size={20} aria-hidden="true" />} onClick={() => handleRechazar(r)}>
                          Rechazar
                        </Button>
                      </>
                    )}
                    {!esBloqueoTorneo(r) && r.status === "confirmada" && (
                      <Button size="sm" variant="ghost" icon={<X className="pd-icon" size={20} aria-hidden="true" />} onClick={() => handleRechazar(r)}>
                        Cancelar
                      </Button>
                    )}
                    {!esBloqueoTorneo(r) && r.status === "bloqueado" && (
                      <Button size="sm" onClick={() => handleDesbloquear(r)}>
                        Desbloquear
                      </Button>
                    )}
                    {!esBloqueoTorneo(r) && r.status === "cancelada" && (
                      <Button size="sm" variant="ghost" icon={<Trash2 className="pd-icon" size={20} aria-hidden="true" />} onClick={() => handleEliminar(r)}>
                        Eliminar
                      </Button>
                    )}
                  </div>
                </Card.Foot>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Canchas() {
  // El club del panel viene del store: el propio (dueño, todos los permisos) o aquel donde la persona es staff
  const clubActual = useAuthStore((s) => s.clubActual);
  const clubCargado = useAuthStore((s) => s.clubCargado);
  const puede = useAuthStore((s) => s.puede);
  const recargarClub = useAuthStore((s) => s.recargarClub);
  const club = clubActual;
  // Permisos: las grillas con acciones, Reservas y Turnos fijos piden gestionarReservas; crear y editar canchas,
  // precios y la configuración de reservas piden tarifas. Sin ninguno de los dos, la página no se ve.
  const puedeReservas = puede("gestionarReservas");
  const puedeTarifas = puede("tarifas");
  // La configuración de reservas (reserva directa, días de anticipación) escribe clubs/{id}: pide configurarClub
  const puedeConfigurar = puede("configurarClub");
  const puedeEntrar = puedeReservas || puedeTarifas;
  const [canchas, setCanchas] = useState([]);
  const [reservas, setReservas] = useState([]);
  const [turnosFijos, setTurnosFijos] = useState([]);
  // El id del club cuyos datos ya se cargaron: mientras no coincida con el actual se muestra el esqueleto
  const [cargadoPara, setCargadoPara] = useState(null);
  const [tabCanchas, setTabCanchas] = useState("Canchas");
  // Deep link: /admin/canchas?fecha=YYYY-MM-DD&turno=<grupoId> abre esa fecha con la ficha del turno
  const [searchParams, setSearchParams] = useSearchParams();
  const fechaParam = searchParams.get("fecha");
  const turnoParam = searchParams.get("turno");
  const [fechaSeleccionada, setFechaSeleccionada] = useState(() => (fechaParam && /^\d{4}-\d{2}-\d{2}$/.test(fechaParam) ? fechaParam : getTodayLocal()));
  // Ficha del turno abierta: la reserva agrupada (id = grupoId)
  const [ficha, setFicha] = useState(null);

  // Form nueva cancha
  const [mostrarForm, setMostrarForm] = useState(false);
  const [formCancha, setFormCancha] = useState({
    nombre: "",
    superficie: "Cemento",
    techada: false,
    precioBase: 0,
    horarios: {},
    horariosFinde: {},
  });
  const [guardando, setGuardando] = useState(false);
  // Qué tarifa edita la tabla de precios de cada formulario: la de semana o la de fin de semana
  const [vistaTarifaNueva, setVistaTarifaNueva] = useState("semana");
  const [vistaTarifaEdit, setVistaTarifaEdit] = useState("semana");

  // Edición cancha
  const [editandoCancha, setEditandoCancha] = useState(null);
  const [editForm, setEditForm] = useState(null);

  const [vistaGrilla, setVistaGrilla] = useState("dia");

  // Block slot modal
  const [mostrarModalBloqueo, setMostrarModalBloqueo] = useState(false);
  const [bloqueoData, setBloqueoData] = useState(null);
  const [motivoBloqueo, setMotivoBloqueo] = useState("Mantenimiento");
  const [guardandoBloqueo, setGuardandoBloqueo] = useState(false);

  // Manual reservation modal
  const [mostrarModalManual, setMostrarModalManual] = useState(false);
  const [modalManualData, setModalManualData] = useState(null);
  const [formManual, setFormManual] = useState({ nombreJugador: "", telefono: "", turnos: 1 });
  const [guardandoManual, setGuardandoManual] = useState(false);

  // Config club
  const [mostrarConfig, setMostrarConfig] = useState(false);
  const [configForm, setConfigForm] = useState({
    reservaDirecta: true,
    diasAnticipacion: 7,
  });

  const clubId = club?.id;
  const getReservasForDate = useCallback(async (fecha) => {
    if (!clubId) return [];
    try { return await getReservas(clubId, fecha); } catch { return []; }
  }, [clubId]);

  useEffect(() => {
    if (!clubId || !puedeEntrar) return;
    const cargar = async () => {
      try {
        const [canchasData, reservasData, turnosData] = await Promise.all([
          getCanchas(clubId),
          getReservas(clubId, fechaSeleccionada),
          getTurnosFijos(clubId),
        ]);
        setCanchas(canchasData);
        setReservas(reservasData);
        setTurnosFijos(turnosData);
        // El formulario de configuración arranca con lo que tiene el club del store
        setConfigForm({
          reservaDirecta: club.reservaDirecta ?? true,
          diasAnticipacion: club.diasAnticipacion ?? 7,
        });
      } catch (err) {
        console.error("Error al cargar canchas:", err);
      }
      setCargadoPara(clubId);
    };
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId, puedeEntrar]);

  useEffect(() => {
    if (!clubId || !puedeEntrar) return;
    getReservas(clubId, fechaSeleccionada).then(setReservas);
  }, [fechaSeleccionada, clubId, puedeEntrar]);
  // Habilitar o quitar una hora: vale para la semana y el finde (la hora quitada también sale del mapa de finde)
  const toggleHorario = (hora) => {
    const current = { ...formCancha.horarios };
    if (current[hora] !== undefined) {
      delete current[hora];
    } else {
      current[hora] = formCancha.precioBase || 0;
    }
    setFormCancha({ ...formCancha, horarios: current, horariosFinde: podarFinde(formCancha.horariosFinde, current) });
  };

  const setPrecioHorario = (hora, precio) => {
    setFormCancha({
      ...formCancha,
      horarios: { ...formCancha.horarios, [hora]: Number(precio) },
    });
  };

  // Precio de finde de una hora: vacío = vuelve a valer lo mismo que en la semana
  const setPrecioFinde = (hora, precio) => {
    const finde = { ...(formCancha.horariosFinde || {}) };
    if (precio === "" || precio === null || precio === undefined) delete finde[hora];
    else finde[hora] = Number(precio);
    setFormCancha({ ...formCancha, horariosFinde: finde });
  };

  const toggleHorarioEdit = (hora) => {
    const current = { ...(editForm.horarios || {}) };
    if (current[hora] !== undefined) {
      delete current[hora];
    } else {
      current[hora] = editForm.precioBase || 0;
    }
    setEditForm({ ...editForm, horarios: current, horariosFinde: podarFinde(editForm.horariosFinde, current) });
  };

  const setPrecioHorarioEdit = (hora, precio) => {
    setEditForm({
      ...editForm,
      horarios: { ...(editForm.horarios || {}), [hora]: Number(precio) },
    });
  };

  const setPrecioFindeEdit = (hora, precio) => {
    const finde = { ...(editForm.horariosFinde || {}) };
    if (precio === "" || precio === null || precio === undefined) delete finde[hora];
    else finde[hora] = Number(precio);
    setEditForm({ ...editForm, horariosFinde: finde });
  };

  const handleCrearCancha = async (e) => {
    e.preventDefault();
    if (!formCancha.nombre.trim() || !club) return;
    setGuardando(true);
    try {
      const datos = {
        nombre: formCancha.nombre,
        superficie: formCancha.superficie,
        techada: formCancha.techada,
        precioBase: Number(formCancha.precioBase),
        horarios: formCancha.horarios,
        horariosFinde: podarFinde(formCancha.horariosFinde, formCancha.horarios),
        horariosDisponibles: Object.keys(formCancha.horarios).sort(),
      };
      const nuevaId = await crearCancha(club.id, datos);
      setCanchas([...canchas, { id: nuevaId, ...datos }]);
      setFormCancha({
        nombre: "",
        superficie: "Cemento",
        techada: false,
        precioBase: 0,
        horarios: {},
        horariosFinde: {},
      });
      setVistaTarifaNueva("semana");
      setMostrarForm(false);
      toast.success("Cancha creada");
    } catch (err) {
      console.error("Error al crear cancha:", err);
      toast.error("No pudimos crear la cancha. Intentá de nuevo.");
    }
    setGuardando(false);
  };

  const handleGuardarEdicion = async () => {
    if (!editForm || !club) return;
    try {
      const { id: canchaId, createdAt: _ca, ...datos } = editForm;
      const datosActualizar = {
        ...datos,
        precioBase: Number(datos.precioBase),
        // Una cancha de antes no tiene horariosFinde: se guarda vacío (igual que la semana)
        horariosFinde: podarFinde(datos.horariosFinde, datos.horarios || {}),
        horariosDisponibles: Object.keys(datos.horarios || {}).sort(),
      };
      await actualizarCancha(club.id, canchaId, datosActualizar);
      setCanchas(
        canchas.map((c) =>
          c.id === canchaId ? { ...c, ...datosActualizar } : c,
        ),
      );
      setEditandoCancha(null);
      setEditForm(null);
      toast.success("Cancha actualizada");
    } catch (err) {
      console.error("Error al editar cancha:", err);
      toast.error("No pudimos guardar los cambios de la cancha. Intentá de nuevo.");
    }
  };

  const handleEliminarCancha = async (canchaId) => {
    const ok = await confirmar({ titulo: "Eliminar cancha", mensaje: "¿Eliminar esta cancha? Sus turnos dejarán de ofrecerse.", confirmText: "Eliminar", danger: true });
    if (!ok) return;
    try {
      await eliminarCancha(club.id, canchaId);
      setCanchas(canchas.filter((c) => c.id !== canchaId));
      toast.success("Cancha eliminada");
    } catch (err) {
      console.error("Error al eliminar cancha:", err);
      toast.error("No pudimos eliminar la cancha. Intentá de nuevo.");
    }
  };

  const handleGuardarConfig = async () => {
    if (!club) return;
    try {
      await actualizarClubConfig(club.id, configForm);
      // El club vive en el store: se vuelve a leer conservando rol y permisos
      await recargarClub();
      setMostrarConfig(false);
      toast.success("Configuración guardada");
    } catch (err) {
      console.error("Error al guardar config:", err);
      toast.error("No pudimos guardar la configuración. Intentá de nuevo.");
    }
  };

  // Abrir la ficha de un turno a partir de cualquiera de sus slots (la lista en la que vive: la del día o la semana)
  const abrirFicha = useCallback((slot, lista = null) => {
    if (!slot) return;
    const grupoId = grupoDeReserva(slot);
    const fuente = lista || reservas;
    const agrupada = agruparReservas(fuente.filter((r) => grupoDeReserva(r) === grupoId && r.status !== "cancelada")).find((r) => r.id === grupoId) || agruparReservas([slot])[0];
    setFicha(agrupada ? { ...agrupada, clubId } : null);
  }, [reservas, clubId]);
  const cerrarFicha = () => {
    setFicha(null);
    if (turnoParam) setSearchParams({});
  };
  // El deep link abre la ficha cuando las reservas de esa fecha ya están (derivado, sin efecto)
  const fichaDeepLink = useMemo(() => {
    if (!turnoParam || !reservas.length) return null;
    const slot = reservas.find((r) => grupoDeReserva(r) === turnoParam && r.status !== "cancelada") || reservas.find((r) => grupoDeReserva(r) === turnoParam);
    if (!slot) return null;
    const agrupada = agruparReservas(reservas.filter((r) => grupoDeReserva(r) === turnoParam && (r.status === "cancelada") === (slot.status === "cancelada"))).find((r) => r.id === turnoParam) || agruparReservas([slot])[0];
    return agrupada ? { ...agrupada, clubId } : null;
  }, [turnoParam, reservas, clubId]);
  const fichaVisible = ficha || fichaDeepLink;
  // Los cambios hechos desde la ficha vuelven a la grilla
  const cambioDesdeFicha = (cambios) => {
    if (cambios && Object.keys(cambios).length && fichaVisible) {
      setReservas((prev) => actualizarGrupoLocal(prev, fichaVisible.id, cambios));
      setFicha((f) => (f ? { ...f, ...cambios } : f));
    }
    if (clubId) getReservas(clubId, fechaSeleccionada).then(setReservas).catch((err) => console.error("Error recargando reservas:", err));
  };

  // El slot vivo de una cancha a una hora, con los campos de grupo completos aunque sea un documento viejo
  const getReservaParaSlot = (canchaId, hora) => {
    return normalizarReserva(
      reservas.find(
        (r) =>
          r.canchaId === canchaId && r.hora === hora && r.status !== "cancelada",
      ),
    );
  };

  const esTurnoFijo = (canchaId, hora) => {
    const partes = fechaSeleccionada.split("-");
    const hoy = new Date(
      Number(partes[0]),
      Number(partes[1]) - 1,
      Number(partes[2]),
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
    const diaHoy = diasMap[hoy.getDay()];
    return turnosFijos.some(
      (t) =>
        t.canchaId === canchaId &&
        t.dia === diaHoy &&
        (t.horas || [t.hora]).includes(hora) &&
        t.status === "activo",
    );
  };

  // Cancelar desde la grilla: la reserva entera (todos sus turnos) queda "cancelada" (no se borra) y se avisa al
  // jugador una vez con el rango de horas. Un bloqueo del club es un solo turno y se desbloquea su documento.
  // Borrar definitivamente solo existe en la pestaña Reservas ("Eliminar").
  const handleCancelarReserva = async (reservaId) => {
    const reserva = normalizarReserva(reservas.find((r) => r.id === reservaId));
    const esBloqueo = reserva?.status === "bloqueado";
    const grupoId = grupoDeReserva(reserva) || reservaId;
    const ok = await confirmar(
      esBloqueo
        ? { titulo: "Desbloquear horario", mensaje: "¿Desbloquear este horario? Volverá a estar disponible.", confirmText: "Desbloquear" }
        : { titulo: "Cancelar reserva", mensaje: "¿Cancelar esta reserva? Se le avisará al jugador.", confirmText: "Cancelar reserva", cancelText: "Volver", danger: true },
    );
    if (!ok) return;
    try {
      if (esBloqueo) await actualizarReserva(club.id, reservaId, { status: "cancelada" });
      else await cancelarReservaGrupo(club.id, grupoId, { canceladaPor: "club" });
      if (reserva?.jugadorUid) {
        notificarReservaRechazada(reserva.jugadorUid, club.nombre, reserva.canchaName || "", reserva.fecha, rangoHoras(reserva.horaInicio, reserva.horaFin));
      }
      setReservas((prev) => actualizarGrupoLocal(prev, grupoId, { status: "cancelada" }));
      toast.success(esBloqueo ? "Horario desbloqueado" : "Reserva cancelada");
    } catch (err) {
      console.error("Error al cancelar reserva:", err);
      toast.error("No pudimos cancelar la reserva. Intentá de nuevo.");
    }
  };

  const handleConfirmarReserva = async (reservaId) => {
    const reserva = normalizarReserva(reservas.find((r) => r.id === reservaId));
    const grupoId = grupoDeReserva(reserva) || reservaId;
    try {
      await actualizarReservaGrupo(club.id, grupoId, { status: "confirmada" });
      if (reserva?.jugadorUid) {
        notificarReservaConfirmada(reserva.jugadorUid, club.nombre, reserva.canchaName || "", reserva.fecha, rangoHoras(reserva.horaInicio, reserva.horaFin));
      }
      setReservas((prev) => actualizarGrupoLocal(prev, grupoId, { status: "confirmada" }));
      toast.success("Reserva confirmada");
    } catch (err) {
      console.error("Error al confirmar reserva:", err);
      toast.error("No pudimos confirmar la reserva. Intentá de nuevo.");
    }
  };

  // Duraciones posibles de una reserva manual desde `hora`: 1 h hasta el máximo del club. Una duración se
  // deshabilita, con el motivo, cuando alguna de sus horas extra no está habilitada en la cancha, ya tiene una
  // reserva o un bloqueo, la bloquea un torneo o es un turno fijo.
  const opcionesDuracionManual = (cancha, hora) => {
    const horasCancha = cancha?.horariosDisponibles || [];
    return Array.from({ length: maxTurnosDelClub(club) }, (_, i) => i + 1).map((n) => {
      const item = { value: n, label: `${n} h`, disabled: false, motivo: "" };
      for (let i = 1; i < n; i++) {
        const h = sumarHoras(hora, i);
        let motivo = "";
        if (!horasCancha.includes(h)) {
          motivo = `El club cierra a las ${h}`;
        } else {
          const ocupado = getReservaParaSlot(cancha.id, h);
          if (esBloqueoTorneo(ocupado)) motivo = tituloBloqueoTorneo(ocupado);
          else if (ocupado?.status === "bloqueado") motivo = `El turno de las ${h} está bloqueado`;
          else if (ocupado) motivo = `El turno de las ${h} ya está reservado`;
          else if (esTurnoFijo(cancha.id, h)) motivo = `Turno fijo a las ${h}`;
        }
        if (motivo) return { ...item, disabled: true, motivo };
      }
      return item;
    });
  };

  const loading = !clubCargado || (!!clubId && puedeEntrar && cargadoPara !== clubId);

  if (loading) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label="Cargando">
        <div className="pd-skeleton h-8 w-56" />
        <div className="pd-skeleton h-10 w-72" />
        <div className="pd-skeleton h-40 w-full rounded-lg" />
      </div>
    );
  }

  if (!club) {
    return (
      <Card className="text-center py-12!">
        <span className="pd-ball mx-auto mb-3 block!" aria-hidden="true" />
        <p className="heading-sm m-0">No tenés un club registrado</p>
        <p className="body-sm text-ink-2 mt-1 m-0">Registrate como club para gestionar canchas y turnos</p>
      </Card>
    );
  }

  // Sin gestionarReservas ni tarifas, el aviso en lugar de la página
  if (!puedeEntrar) {
    return (
      <div>
        <h1 className="heading-lg m-0 mb-4">Canchas y turnos</h1>
        <SinPermiso />
      </div>
    );
  }

  if (club && (!club.telefono || !club.direccion || !club.ciudad)) {
    return <PerfilIncompleto tipo="club" ruta="/admin/configuracion" />;
  }

  // Un solo botón lime por pantalla: el formulario abierto se lo lleva; si no, el panel de configuración;
  // si no, "Nueva cancha" en la cabecera.
  const primariaEn = mostrarForm ? "form" : mostrarConfig ? "config" : "header";

  // Lo que comparten el formulario de alta y el de edición: presets de horarios, pastillas de horas, el
  // selector Semana / Fin de semana, precio para todos y la tabla de precio por horario. Las horas habilitadas
  // son las mismas para los dos días; solo cambian los precios. Función, no componente, así no se desmonta
  // en cada render.
  function editorHorarios({
    horarios,
    horariosFinde,
    precioBase,
    setHorarios,
    setHorariosFinde,
    toggleHora,
    setPrecioHora,
    setPrecioFindeHora,
    vista,
    setVista,
    batchId,
  }) {
    const finde = horariosFinde || {};
    const esFinde = vista === "finde";
    const aplicarPreset = (desde, hasta) => {
      const nuevos = {};
      for (let h = desde; h <= hasta; h++) nuevos[`${h.toString().padStart(2, "0")}:00`] = precioBase || 0;
      setHorarios(nuevos);
    };
    const aplicarATodos = (precio) => {
      const nuevos = {};
      Object.keys(horarios).forEach((h) => { nuevos[h] = precio; });
      if (esFinde) setHorariosFinde(nuevos);
      else setHorarios(nuevos);
    };
    const horasElegidas = Object.keys(horarios).sort();
    const findeCargado = Object.keys(finde).length > 0;
    return (
      <Field label="Horarios y precios" as="div">
        <div className="pd-btn-group">
          <Button type="button" size="sm" onClick={() => aplicarPreset(7, 23)}>07:00 – 23:00</Button>
          <Button type="button" size="sm" onClick={() => aplicarPreset(8, 22)}>08:00 – 22:00</Button>
          <Button type="button" size="sm" onClick={() => aplicarPreset(9, 21)}>09:00 – 21:00</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setHorarios({})}>Limpiar</Button>
        </div>
        <Pills
          multi
          items={itemsHoras}
          value={horasElegidas}
          onChange={toggleHora}
          ariaLabel="Horas disponibles"
          className="mt-2"
        />
        {horasElegidas.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Pills items={itemsTarifa} value={vista} onChange={setVista} ariaLabel="Tarifa por día" />
            {esFinde && (
              <div className="pd-btn-group">
                <Button type="button" size="sm" onClick={() => setHorariosFinde({ ...horarios })}>
                  Copiar precios de semana
                </Button>
                {findeCargado && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => setHorariosFinde({})}>
                    Usar los de semana
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
        {horasElegidas.length > 0 && esFinde && (
          <p className="pd-help mt-1 m-0">
            {findeCargado
              ? "Los sábados y domingos valen estos precios; una hora sin precio vale lo mismo que en la semana."
              : "Sin precios de fin de semana, los sábados y domingos valen lo mismo que en la semana."}
          </p>
        )}
        {horasElegidas.length > 0 && (
          <div className="mt-3 rounded-md bg-surface-sunken p-3">
            <div className="flex flex-wrap items-end gap-2">
              <Field label={esFinde ? "Precio de finde para todos" : "Precio para todos"} className="flex-1 min-w-[160px]">
                <Input type="number" min="0" inputMode="numeric" placeholder="Ej: 15000" id={batchId} className="h-9!" />
              </Field>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  const precio = Number(document.getElementById(batchId).value);
                  if (precio >= 0) aplicarATodos(precio);
                }}
              >
                Aplicar
              </Button>
            </div>
            <p className="pd-help mt-2 m-0">Aplicá un precio a todos, después ajustá individualmente</p>
          </div>
        )}
        {horasElegidas.length > 0 && (
          <div className="pd-table-wrap mt-3">
            <table className="pd-table">
              <thead>
                <tr>
                  <th>Hora</th>
                  <th className="num">{esFinde ? "Precio sáb y dom" : "Precio lun a vie"}</th>
                </tr>
              </thead>
              <tbody>
                {horasElegidas.map((hora) => (
                  <tr key={hora}>
                    <td className="py-1!">{hora}</td>
                    <td className="num py-1!">
                      {esFinde ? (
                        <Input
                          type="number"
                          min="0"
                          inputMode="numeric"
                          value={finde[hora] ?? ""}
                          placeholder={String(horarios[hora] ?? precioBase ?? 0)}
                          onChange={(e) => setPrecioFindeHora(hora, e.target.value)}
                          aria-label={`Precio de fin de semana a las ${hora}`}
                          className="h-9! w-32! text-right pd-tnum"
                        />
                      ) : (
                        <Input
                          type="number"
                          min="0"
                          inputMode="numeric"
                          value={horarios[hora]}
                          onChange={(e) => setPrecioHora(hora, e.target.value)}
                          aria-label={`Precio a las ${hora}`}
                          className="h-9! w-32! text-right pd-tnum"
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="pd-help m-0">{horasElegidas.length} horarios seleccionados</p>
      </Field>
    );
  }

  // Reserva manual: duraciones posibles desde la celda elegida, total y seña según la duración elegida
  const opcionesDuracion = modalManualData ? opcionesDuracionManual(modalManualData.cancha, modalManualData.hora) : [];
  const turnosManual = opcionesDuracion.some((o) => o.value === formManual.turnos && !o.disabled) ? formManual.turnos : 1;
  const motivoDuracion = opcionesDuracion.find((o) => o.disabled)?.motivo || "";
  const totalManual = modalManualData
    ? precioDeReserva(modalManualData.cancha, fechaSeleccionada, modalManualData.hora, turnosManual)
    : 0;
  const señaManual = calcularSeña(club, totalManual);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="heading-lg m-0">Canchas y turnos</h1>
        {tabCanchas === "Canchas" && (puedeTarifas || puedeConfigurar) && (
          <div className="pd-btn-group">
            {puedeConfigurar && (
              <Button
                onClick={() => setMostrarConfig(!mostrarConfig)}
                aria-expanded={mostrarConfig}
                icon={<Settings className="pd-icon" size={20} aria-hidden="true" />}
              >
                Configuración
              </Button>
            )}
            {puedeTarifas && (
              <Button
                variant={primariaEn === "header" ? "primary" : "secondary"}
                onClick={() => setMostrarForm(!mostrarForm)}
                aria-expanded={mostrarForm}
                icon={<Plus className="pd-icon" size={20} aria-hidden="true" />}
              >
                Nueva cancha
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs
        items={[
          { value: "Canchas", label: "Canchas" },
          { value: "Reservas", label: "Reservas" },
          { value: "Turnos fijos", label: "Turnos fijos" },
        ]}
        value={tabCanchas}
        onChange={setTabCanchas}
        ariaLabel="Secciones de canchas y turnos"
        className="mb-6"
      />

      {tabCanchas === "Canchas" && (
        <>
          {/* Configuración de reservas (solo con configurarClub) */}
          {puedeConfigurar && mostrarConfig && (
            <Card className="mb-4">
              <Card.Title>Configuración de reservas</Card.Title>
              <div className="flex flex-col gap-3 mt-3">
                <label className="flex items-center gap-3 pd-label">
                  <input
                    type="checkbox"
                    checked={configForm.reservaDirecta}
                    onChange={(e) =>
                      setConfigForm({
                        ...configForm,
                        reservaDirecta: e.target.checked,
                      })
                    }
                    className="w-4 h-4 accent-ink"
                  />
                  Reserva directa (sin aprobación del club)
                </label>
                <Field label="Días de anticipación máxima" className="max-w-xs">
                  <Input
                    type="number"
                    min="1"
                    max="60"
                    inputMode="numeric"
                    value={configForm.diasAnticipacion}
                    onChange={(e) =>
                      setConfigForm({
                        ...configForm,
                        diasAnticipacion: Number(e.target.value),
                      })
                    }
                  />
                </Field>
                <div>
                  <Button variant={primariaEn === "config" ? "primary" : "secondary"} onClick={handleGuardarConfig}>
                    Guardar configuración
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* Formulario nueva cancha (solo con tarifas) */}
          {puedeTarifas && mostrarForm && (
            <Card className="mb-4">
              <Card.Title>Nueva cancha</Card.Title>
              <form onSubmit={handleCrearCancha} className="flex flex-col gap-4 mt-3">
                <Field label="Nombre">
                  <Input
                    type="text"
                    placeholder="Ej: Cancha 1"
                    value={formCancha.nombre}
                    onChange={(e) =>
                      setFormCancha({ ...formCancha, nombre: e.target.value })
                    }
                    required
                  />
                </Field>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Superficie">
                    <Select
                      value={formCancha.superficie}
                      onChange={(e) =>
                        setFormCancha({
                          ...formCancha,
                          superficie: e.target.value,
                        })
                      }
                    >
                      {superficies.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Precio base por turno ($)" help="Se aplica al seleccionar horarios nuevos">
                    <Input
                      type="number"
                      min="0"
                      inputMode="numeric"
                      value={formCancha.precioBase}
                      onChange={(e) =>
                        setFormCancha({
                          ...formCancha,
                          precioBase: Number(e.target.value),
                        })
                      }
                    />
                  </Field>
                </div>
                <label className="flex items-center gap-3 pd-label">
                  <input
                    type="checkbox"
                    checked={formCancha.techada}
                    onChange={(e) =>
                      setFormCancha({
                        ...formCancha,
                        techada: e.target.checked,
                      })
                    }
                    className="w-4 h-4 accent-ink"
                  />
                  Cancha techada
                </label>
                {editorHorarios({
                  horarios: formCancha.horarios,
                  horariosFinde: formCancha.horariosFinde,
                  precioBase: formCancha.precioBase,
                  setHorarios: (nuevos) =>
                    setFormCancha({ ...formCancha, horarios: nuevos, horariosFinde: podarFinde(formCancha.horariosFinde, nuevos) }),
                  setHorariosFinde: (nuevos) => setFormCancha({ ...formCancha, horariosFinde: podarFinde(nuevos, formCancha.horarios) }),
                  toggleHora: toggleHorario,
                  setPrecioHora: setPrecioHorario,
                  setPrecioFindeHora: setPrecioFinde,
                  vista: vistaTarifaNueva,
                  setVista: setVistaTarifaNueva,
                  batchId: "batchPriceNew",
                })}
                <div className="pd-btn-group">
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={guardando || !formCancha.nombre.trim()}
                    cargando={guardando ? "Creando…" : ""}
                  >
                    Crear cancha
                  </Button>
                </div>
              </form>
            </Card>
          )}

          {/* Lista de canchas */}
          {canchas.length === 0 && !mostrarForm && (
            <Card className="text-center py-12! mb-4">
              <span className="pd-ball mx-auto mb-3 block!" aria-hidden="true" />
              <p className="heading-sm m-0">No tenés canchas creadas</p>
              <p className="body-sm text-ink-2 mt-1 m-0">
                {puedeTarifas ? 'Hacé clic en "Nueva cancha" para empezar' : "Pedile al dueño del club que las cargue"}
              </p>
            </Card>
          )}

          {canchas.length > 0 && (
            <div className="grid gap-4 md:grid-cols-[repeat(auto-fill,minmax(300px,1fr))] mb-6">
              {canchas.map((cancha) => (
                <Card key={cancha.id} className={puedeTarifas && editandoCancha === cancha.id && editForm ? "md:col-span-full" : undefined}>
                  {puedeTarifas && editandoCancha === cancha.id && editForm ? (
                    <div className="flex flex-col gap-4">
                      <Card.Row>
                        <Card.Title>Editando cancha</Card.Title>
                        <div className="pd-btn-group">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditandoCancha(null);
                              setEditForm(null);
                            }}
                          >
                            Cancelar
                          </Button>
                          <Button size="sm" onClick={handleGuardarEdicion}>
                            Guardar
                          </Button>
                        </div>
                      </Card.Row>
                      <Field label="Nombre">
                        <Input
                          type="text"
                          value={editForm.nombre}
                          onChange={(e) =>
                            setEditForm({ ...editForm, nombre: e.target.value })
                          }
                        />
                      </Field>
                      <div className="grid gap-4 md:grid-cols-2">
                        <Field label="Superficie">
                          <Select
                            value={editForm.superficie}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                superficie: e.target.value,
                              })
                            }
                          >
                            {superficies.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </Select>
                        </Field>
                        <Field label="Precio base ($)">
                          <Input
                            type="number"
                            min="0"
                            inputMode="numeric"
                            value={editForm.precioBase || 0}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                precioBase: Number(e.target.value),
                              })
                            }
                          />
                        </Field>
                      </div>
                      <label className="flex items-center gap-3 pd-label">
                        <input
                          type="checkbox"
                          checked={editForm.techada || false}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              techada: e.target.checked,
                            })
                          }
                          className="w-4 h-4 accent-ink"
                        />
                        Techada
                      </label>
                      {editorHorarios({
                        horarios: editForm.horarios || {},
                        horariosFinde: editForm.horariosFinde || {},
                        precioBase: editForm.precioBase,
                        setHorarios: (nuevos) =>
                          setEditForm({ ...editForm, horarios: nuevos, horariosFinde: podarFinde(editForm.horariosFinde, nuevos) }),
                        setHorariosFinde: (nuevos) => setEditForm({ ...editForm, horariosFinde: podarFinde(nuevos, editForm.horarios || {}) }),
                        toggleHora: toggleHorarioEdit,
                        setPrecioHora: setPrecioHorarioEdit,
                        setPrecioFindeHora: setPrecioFindeEdit,
                        vista: vistaTarifaEdit,
                        setVista: setVistaTarifaEdit,
                        batchId: "batchPriceEdit",
                      })}
                    </div>
                  ) : (
                    <>
                      <Card.Row className="items-start!">
                        <div className="min-w-0">
                          <Card.Title className="truncate">{cancha.nombre}</Card.Title>
                          <div className="flex gap-1 mt-2 flex-wrap">
                            <Badge>{cancha.superficie}</Badge>
                            <Badge>{cancha.techada ? "Techada" : "Al aire libre"}</Badge>
                          </div>
                        </div>
                        {puedeTarifas && (
                          <div className="pd-btn-group flex-nowrap!">
                            <Button
                              size="sm"
                              onClick={() => {
                                setEditandoCancha(cancha.id);
                                setEditForm({ ...cancha, horariosFinde: cancha.horariosFinde || {} });
                                setVistaTarifaEdit("semana");
                              }}
                            >
                              Editar
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              iconOnly
                              aria-label={`Eliminar ${cancha.nombre}`}
                              icon={<Trash2 className="pd-icon" size={20} aria-hidden="true" />}
                              onClick={() => handleEliminarCancha(cancha.id)}
                            />
                          </div>
                        )}
                      </Card.Row>
                      <Card.Foot className="flex-wrap">
                        <span className="numeral-md pd-tnum">{formatPrecio(precioMinimo(cancha))}</span>
                        <span className="body-sm text-ink-3">desde, por turno</span>
                        <span className="body-sm text-ink-3 ml-auto pd-tnum">
                          Horarios {(cancha.horariosDisponibles || []).length}
                        </span>
                      </Card.Foot>
                    </>
                  )}
                </Card>
              ))}
            </div>
          )}

          {/* Grilla de turnos */}
          {canchas.length > 0 && (
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="flex flex-wrap items-center gap-3">
                  <Card.Title>{vistaGrilla === "dia" ? "Turnos del día" : "Vista semanal"}</Card.Title>
                  <Pills
                    items={[
                      { value: "dia", label: "Día" },
                      { value: "semana", label: "Semana" },
                    ]}
                    value={vistaGrilla}
                    onChange={setVistaGrilla}
                    ariaLabel="Vista de la grilla"
                  />
                </div>
                <Input
                  type="date"
                  value={fechaSeleccionada}
                  onChange={(e) => setFechaSeleccionada(e.target.value)}
                  aria-label="Fecha"
                  className="h-9! w-auto!"
                />
              </div>

              {vistaGrilla === "dia" && (
                <div className="overflow-x-auto">
                  <div
                    className="pd-grid pd-grid-quiet"
                    style={{ gridTemplateColumns: `56px repeat(${canchas.length}, minmax(128px, 1fr))` }}
                    role="grid"
                    aria-label={`Turnos del ${formatFecha(fechaSeleccionada)}`}
                  >
                    <div />
                    {canchas.map((c) => (
                      <div key={c.id} className="pd-grid-head truncate">
                        {c.nombre}
                      </div>
                    ))}
                    {horasDelDia.map((hora) => {
                      const algunaCanchaDisponible = canchas.some((c) =>
                        (c.horariosDisponibles || []).includes(hora),
                      );
                      if (!algunaCanchaDisponible) return null;

                      return (
                        <div key={hora} className="contents">
                          <div className="pd-grid-time">{hora}</div>
                          {canchas.map((cancha) => {
                            const disponible = (
                              cancha.horariosDisponibles || []
                            ).includes(hora);
                            if (!disponible) {
                              return <SlotCell key={cancha.id} estado="pasado" linea1="No disponible" />;
                            }

                            const reserva = getReservaParaSlot(cancha.id, hora);
                            // Bloqueado por un partido de torneo: celda quieta, sin Desbloquear ni el overlay de Bloquear
                            if (esBloqueoTorneo(reserva)) {
                              return (
                                <SlotCell
                                  key={cancha.id}
                                  estado="bloqueada"
                                  linea1="Torneo"
                                  linea2={nombreTorneo(reserva) || undefined}
                                  title={tituloBloqueoTorneo(reserva)}
                                />
                              );
                            }
                            // Hora siguiente de una reserva de varias horas: sigue el bloque del primer turno, sin acciones
                            if (reserva && !esPrimerSlot(reserva)) {
                              return (
                                <SlotCell
                                  key={cancha.id}
                                  estado={estadoDeReserva(reserva)}
                                  linea1="↳"
                                  linea2={reserva.nombreJugador || "Reservado"}
                                  title={`${reserva.nombreJugador || "Reservado"} · ${rangoHoras(reserva.horaInicio, reserva.horaFin)}`}
                                  onClick={() => abrirFicha(reserva)}
                                  aria-label={`Ver turno de ${reserva.nombreJugador || "jugador"}`}
                                />
                              );
                            }
                            if (reserva && reserva.status === "bloqueado") {
                              // Sin gestionarReservas el bloqueo se ve pero no se desbloquea
                              if (!puedeReservas) {
                                return <SlotCell key={cancha.id} estado="bloqueada" linea2={motivoDeBloqueo(reserva.nombreJugador) || undefined} />;
                              }
                              return (
                                <div key={cancha.id} className="flex flex-col gap-1">
                                  <SlotCell estado="bloqueada" linea2={motivoDeBloqueo(reserva.nombreJugador) || undefined} className="flex-1" />
                                  <div className="flex justify-center">
                                    <Button size="sm" variant="ghost" className="h-7!" onClick={() => handleCancelarReserva(reserva.id)}>
                                      Desbloquear
                                    </Button>
                                  </div>
                                </div>
                              );
                            }
                            if (reserva) {
                              const rango = rangoHoras(reserva.horaInicio, reserva.horaFin);
                              // Sin gestionarReservas la reserva se ve pero no se confirma ni se cancela
                              if (!puedeReservas) {
                                return (
                                  <SlotCell
                                    key={cancha.id}
                                    estado={estadoDeReserva(reserva)}
                                    linea1={reserva.nombreJugador || "Reservado"}
                                    linea2={rango}
                                    title={`${reserva.nombreJugador || "Reservado"} · ${rango}`}
                                    onClick={() => abrirFicha(reserva)}
                                    aria-label={`Ver turno de ${reserva.nombreJugador || "jugador"}, ${rango}`}
                                  />
                                );
                              }
                              return (
                                <div key={cancha.id} className="flex flex-col gap-1">
                                  <SlotCell
                                    estado={estadoDeReserva(reserva)}
                                    linea1={reserva.nombreJugador || "Reservado"}
                                    linea2={rango}
                                    className="flex-1"
                                    onClick={() => abrirFicha(reserva)}
                                    aria-label={`Ver turno de ${reserva.nombreJugador || "jugador"}, ${rango}`}
                                  />
                                  <div className="flex justify-center gap-1">
                                    {reserva.status === "pendiente" && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        iconOnly
                                        className="h-7! w-7!"
                                        aria-label={`Confirmar reserva de ${reserva.nombreJugador || "jugador"}, ${rango}`}
                                        icon={<Check size={16} aria-hidden="true" />}
                                        onClick={() => handleConfirmarReserva(reserva.id)}
                                      />
                                    )}
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      iconOnly
                                      className="h-7! w-7!"
                                      aria-label={`Cancelar reserva de ${reserva.nombreJugador || "jugador"}, ${rango}`}
                                      icon={<X size={16} aria-hidden="true" />}
                                      onClick={() => handleCancelarReserva(reserva.id)}
                                    />
                                  </div>
                                </div>
                              );
                            }

                            const turnoFijo = esTurnoFijo(cancha.id, hora);
                            if (turnoFijo) {
                              const tf = turnosFijos.find(
                                (t) =>
                                  t.canchaId === cancha.id &&
                                  (t.horas || [t.hora]).includes(hora) &&
                                  t.status === "activo",
                              );
                              return (
                                <SlotCell
                                  key={cancha.id}
                                  estado="fijo"
                                  linea1=""
                                  linea2={tf?.nombreJugador ? `Turno fijo · ${tf.nombreJugador}` : "Turno fijo"}
                                />
                              );
                            }

                            // Precio del turno según el día: sáb y dom usan la tarifa de fin de semana
                            const precioHora = precioDeSlot(cancha, fechaSeleccionada, hora);
                            // Sin gestionarReservas la celda libre es una celda quieta con el precio, no un botón
                            if (!puedeReservas) {
                              return (
                                <div key={cancha.id} className="pd-slot pd-slot-free cursor-default! hover:border-line! hover:text-ink-3!">
                                  Libre
                                  <small>{formatPrecio(precioHora)}</small>
                                </div>
                              );
                            }
                            return (
                              <div key={cancha.id} className="relative group flex flex-col">
                                <SlotCell
                                  estado="libre"
                                  linea2={formatPrecio(precioHora)}
                                  className="flex-1"
                                  aria-label={`Reservar ${cancha.nombre} a las ${hora}, ${formatPrecio(precioHora)}`}
                                  onClick={() => {
                                    setModalManualData({ cancha, hora });
                                    setFormManual({ nombreJugador: "", telefono: "", turnos: 1 });
                                    setMostrarModalManual(true);
                                  }}
                                />
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  iconOnly
                                  className="absolute top-0.5 right-0.5 h-7! w-7! md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                                  aria-label={`Bloquear ${cancha.nombre} a las ${hora}`}
                                  title="Bloquear horario"
                                  icon={<Lock size={16} aria-hidden="true" />}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setBloqueoData({ cancha, hora });
                                    setMotivoBloqueo("Mantenimiento");
                                    setMostrarModalBloqueo(true);
                                  }}
                                />
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {vistaGrilla === "semana" && (
                <WeeklyGrid
                  canchas={canchas}
                  clubId={club.id}
                  fechaBase={fechaSeleccionada}
                  getReservasForDate={getReservasForDate}
                  getTurnosFijosData={turnosFijos}
                  onAbrirTurno={abrirFicha}
                />
              )}
            </Card>
          )}
        </>
      )}

      {/* Reservas y Turnos fijos piden gestionarReservas; sin el permiso, el aviso en lugar de la pestaña */}
      {tabCanchas === "Reservas" && club && (
        puedeReservas ? <ReservasTab clubId={club.id} canchas={canchas} clubNombre={club.nombre} /> : <SinPermiso />
      )}

      {tabCanchas === "Turnos fijos" && club && (
        puedeReservas ? <TabTurnosFijos clubId={club.id} /> : <SinPermiso />
      )}

      {fichaVisible && club && <FichaTurno clubId={club.id} club={club} reserva={fichaVisible} onCambio={cambioDesdeFicha} onCerrar={cerrarFicha} />}

      {/* Modal reserva manual */}
      {mostrarModalManual && modalManualData && (
        <div
          className="pd-backdrop z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) setMostrarModalManual(false);
          }}
        >
          <div className="pd-dialog" role="dialog" aria-modal="true" aria-labelledby="reserva-manual-titulo" aria-describedby="reserva-manual-cuerpo">
            <h2 className="pd-dialog-title" id="reserva-manual-titulo">Reserva manual</h2>
            <p className="pd-dialog-body pd-tnum" id="reserva-manual-cuerpo">
              {modalManualData.cancha.nombre} · {formatFecha(fechaSeleccionada)} ·{" "}
              {rangoHoras(modalManualData.hora, sumarHoras(modalManualData.hora, turnosManual))}
            </p>

            {/* Duración: pastillas a mano porque Pills no deshabilita ítems; el motivo va en el title */}
            {opcionesDuracion.length > 1 && (
              <Field label="Duración" as="div" className="mt-4">
                <div className="pd-pills" role="tablist" aria-label="Duración de la reserva">
                  {opcionesDuracion.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      role="tab"
                      className="pd-pill disabled:opacity-50 disabled:cursor-not-allowed!"
                      aria-selected={o.value === turnosManual}
                      disabled={o.disabled}
                      title={o.disabled ? o.motivo : undefined}
                      onClick={() => setFormManual({ ...formManual, turnos: o.value })}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                {motivoDuracion && <span className="pd-help">{motivoDuracion}</span>}
              </Field>
            )}

            <div className="rounded-md bg-surface-sunken p-3 mt-4">
              <div className="flex items-center justify-between gap-3">
                <span className="body-sm text-ink-2">Total</span>
                <span className="numeral-lg pd-tnum">{formatPrecio(totalManual)}</span>
              </div>
              {señaManual > 0 && (
                <p className="body-sm text-ink-2 pd-tnum text-right m-0 mt-1">Seña {formatPrecio(señaManual)}</p>
              )}
            </div>

            <div className="flex flex-col gap-3 mt-4">
              <Field label="Nombre del jugador">
                <Input
                  type="text"
                  required
                  value={formManual.nombreJugador}
                  onChange={(e) => setFormManual({ ...formManual, nombreJugador: e.target.value })}
                  placeholder="Ej: Juan Pérez"
                />
              </Field>
              <Field label="Teléfono (opcional)">
                <Input
                  type="tel"
                  inputMode="numeric"
                  value={formManual.telefono}
                  onChange={(e) => setFormManual({ ...formManual, telefono: e.target.value.replace(/\D/g, "") })}
                  placeholder="Ej: 3851234567"
                />
              </Field>
            </div>

            <div className="pd-dialog-actions">
              <Button onClick={() => setMostrarModalManual(false)}>Cancelar</Button>
              <Button
                variant="primary"
                onClick={async () => {
                  if (!formManual.nombreJugador.trim()) return;
                  setGuardandoManual(true);
                  try {
                    await crearReserva(club.id, {
                      canchaId: modalManualData.cancha.id,
                      canchaName: modalManualData.cancha.nombre,
                      fecha: fechaSeleccionada,
                      hora: modalManualData.hora,
                      turnos: turnosManual,
                      precios: preciosDeReserva(modalManualData.cancha, fechaSeleccionada, modalManualData.hora, turnosManual),
                      seña: señaManual,
                      jugadorUid: null,
                      nombreJugador: formManual.nombreJugador.trim(),
                      telefono: formManual.telefono,
                      email: "",
                      status: "confirmada",
                    });
                    const nuevasReservas = await getReservas(club.id, fechaSeleccionada);
                    setReservas(nuevasReservas);
                    setMostrarModalManual(false);
                    toast.success("Reserva creada");
                  } catch (err) {
                    if (err?.code === "SLOT_TAKEN") {
                      // La transacción dice qué hora se ocupó ("El turno de las 21:00 ya está reservado")
                      toast.error(err.message || "Ese turno acaba de ser reservado por otra persona");
                      try { setReservas(await getReservas(club.id, fechaSeleccionada)); } catch (e) { console.error(e); }
                      setMostrarModalManual(false);
                    } else {
                      console.error("Error al crear reserva manual:", err);
                      toast.error("No pudimos crear la reserva. Intentá de nuevo.");
                    }
                  }
                  setGuardandoManual(false);
                }}
                disabled={guardandoManual || !formManual.nombreJugador.trim()}
                cargando={guardandoManual ? "Guardando…" : ""}
              >
                Reservar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal bloqueo de horario */}
      {mostrarModalBloqueo && bloqueoData && (
        <div
          className="pd-backdrop z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) setMostrarModalBloqueo(false);
          }}
        >
          <div className="pd-dialog" role="dialog" aria-modal="true" aria-labelledby="bloqueo-titulo" aria-describedby="bloqueo-cuerpo">
            <h2 className="pd-dialog-title flex items-center gap-2" id="bloqueo-titulo">
              <Lock className="pd-icon" size={20} aria-hidden="true" />
              Bloquear horario
            </h2>
            <p className="pd-dialog-body pd-tnum" id="bloqueo-cuerpo">
              {bloqueoData.cancha.nombre} · {formatFecha(fechaSeleccionada)} · {bloqueoData.hora}
            </p>

            <div className="flex flex-col gap-3 mt-4">
              <Field label="Motivo">
                <Select value={motivoBloqueo} onChange={(e) => setMotivoBloqueo(e.target.value)}>
                  <option value="Mantenimiento">Mantenimiento</option>
                  <option value="Evento privado">Evento privado</option>
                  <option value="Clima">Clima / condiciones</option>
                  <option value="Otro">Otro</option>
                </Select>
              </Field>
            </div>

            <div className="pd-dialog-actions">
              <Button onClick={() => setMostrarModalBloqueo(false)}>Cancelar</Button>
              <Button
                variant="danger"
                onClick={async () => {
                  setGuardandoBloqueo(true);
                  try {
                    await crearReserva(club.id, {
                      canchaId: bloqueoData.cancha.id,
                      canchaName: bloqueoData.cancha.nombre,
                      fecha: fechaSeleccionada,
                      hora: bloqueoData.hora,
                      precio: 0,
                      jugadorUid: null,
                      nombreJugador: `🔒 ${motivoBloqueo}`,
                      telefono: "",
                      email: "",
                      status: "bloqueado",
                    });
                    const nuevasReservas = await getReservas(club.id, fechaSeleccionada);
                    setReservas(nuevasReservas);
                    setMostrarModalBloqueo(false);
                    toast.success("Horario bloqueado");
                  } catch (err) {
                    if (err?.code === "SLOT_TAKEN") {
                      toast.error("Ese turno acaba de ser reservado por otra persona");
                      try { setReservas(await getReservas(club.id, fechaSeleccionada)); } catch (e) { console.error(e); }
                      setMostrarModalBloqueo(false);
                    } else {
                      console.error("Error al bloquear horario:", err);
                      toast.error("No pudimos bloquear el horario. Intentá de nuevo.");
                    }
                  }
                  setGuardandoBloqueo(false);
                }}
                disabled={guardandoBloqueo}
                cargando={guardandoBloqueo ? "Bloqueando…" : ""}
              >
                Bloquear
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
