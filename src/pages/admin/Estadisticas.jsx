import { useEffect, useState } from "react";
import { LayoutGrid, Share } from "lucide-react";
import { getTodayLocal } from "../../utils/formatDate";
import { formatPrecio } from "../../utils/format";
import { agruparReservas } from "../../utils/reservas";
import { useAuthStore } from "../../store/authStore";
import {
  getClubByOwner,
  getCanchas,
  getReservas,
  getTurnosFijos,
} from "../../services/canchaService";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { Card, Pills, StatTile } from "../../components/ui";

// Paleta categórica de la torta (una cancha por color), solo tokens: court y lime primero, después los estados
const COLORES = [
  "var(--court)",
  "var(--lime)",
  "var(--warning)",
  "var(--success)",
  "var(--danger)",
  "var(--ink-3)",
  "var(--night)",
  "var(--line-strong)",
];

// Estilos de Recharts con tokens (las cadenas var(--…) en props de Recharts están permitidas)
const TICK = { fontSize: 12, fill: "var(--ink-3)", fontFamily: "var(--font-sans)" };
const TOOLTIP = {
  contentStyle: { background: "var(--surface-raised)", border: "1px solid var(--line)", borderRadius: 12, color: "var(--ink)" },
  itemStyle: { color: "var(--ink)" },
  labelStyle: { color: "var(--ink-2)", fontWeight: 600 },
};
const LEGEND = { fontSize: 12, fontFamily: "var(--font-sans)" };

const PERIODOS = [
  { value: "dia", label: "Hoy" },
  { value: "semana", label: "Semana" },
  { value: "mes", label: "Mes" },
];

export default function Estadisticas() {
  const { user } = useAuthStore();
  const [club, setClub] = useState(null);
  const [canchas, setCanchas] = useState([]);
  const [todasReservas, setTodasReservas] = useState([]);
  const [turnosFijos, setTurnosFijos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState("mes");

  useEffect(() => {
    if (!user) return;
    const cargar = async () => {
      try {
        const clubData = await getClubByOwner(user.uid);
        if (clubData) {
          setClub(clubData);
          const [canchasData, reservasData, turnosData] = await Promise.all([
            getCanchas(clubData.id),
            getReservas(clubData.id),
            getTurnosFijos(clubData.id),
          ]);
          setCanchas(canchasData);
          setTodasReservas(reservasData);
          setTurnosFijos(turnosData);
        }
      } catch (err) {
        console.error("Error al cargar estadísticas:", err);
      }
      setLoading(false);
    };
    cargar();
  }, [user]);

  if (loading) {
    return (
      <div aria-busy="true">
        <span className="sr-only">Cargando estadísticas...</span>
        <div className="flex items-center justify-between mb-6">
          <div className="pd-skeleton h-8 w-48" />
          <div className="pd-skeleton h-9 w-56 rounded-pill" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="pd-skeleton h-[92px] rounded-lg" />
          ))}
        </div>
        <div className="pd-skeleton h-72 rounded-lg" />
      </div>
    );
  }

  if (!club) {
    return (
      <Card className="text-center">
        <p className="body-md text-ink-2 m-0">No tenés un club registrado</p>
      </Card>
    );
  }

  // Filtrar reservas por período
  const hoy = new Date();
  const reservasFiltradas = todasReservas.filter((r) => {
    if (!r.fecha) return false;
    const partes = r.fecha.split("-");
    const fechaReserva = new Date(
      Number(partes[0]),
      Number(partes[1]) - 1,
      Number(partes[2]),
    );
    if (periodo === "dia") {
      return r.fecha === getTodayLocal();
    }
    if (periodo === "semana") {
      const hace7 = new Date(hoy);
      hace7.setDate(hace7.getDate() - 7);
      return fechaReserva >= hace7;
    }
    if (periodo === "mes") {
      const hace30 = new Date(hoy);
      hace30.setDate(hace30.getDate() - 30);
      return fechaReserva >= hace30;
    }
    return true;
  });

  const reservasConfirmadas = reservasFiltradas.filter(
    (r) => r.status === "confirmada",
  );

  // Ingresos totales
  const ingresosTotales = reservasConfirmadas.reduce(
    (sum, r) => sum + (Number(r.precio) || 0),
    0,
  );

  // Las reservas se cuentan por reserva (una de dos horas es una), como en el panel de Hoy; los ingresos y los
  // horarios siguen por turno (cada slot lleva su precio y su hora)
  const gruposConfirmados = agruparReservas(reservasConfirmadas);

  // Reservas por cancha
  const reservasPorCancha = canchas.map((c) => ({
    nombre: c.nombre,
    reservas: gruposConfirmados.filter((r) => r.canchaId === c.id).length,
    ingresos: reservasConfirmadas
      .filter((r) => r.canchaId === c.id)
      .reduce((sum, r) => sum + (Number(r.precio) || 0), 0),
  }));

  // Horarios más reservados
  const conteoHorarios = {};
  reservasConfirmadas.forEach((r) => {
    if (r.hora) {
      conteoHorarios[r.hora] = (conteoHorarios[r.hora] || 0) + 1;
    }
  });
  const horariosOrdenados = Object.entries(conteoHorarios)
    .map(([hora, cantidad]) => ({ hora, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad);

  const top5Horarios = horariosOrdenados.slice(0, 5);
  const bottom5Horarios = horariosOrdenados.slice(-5).reverse();

  // Tasa de ocupación por cancha
  const diasEnPeriodo = periodo === "dia" ? 1 : periodo === "semana" ? 7 : 30;
  const ocupacionPorCancha = canchas.map((c) => {
    const horariosDisp = (c.horariosDisponibles || []).length;
    const slotsTotal = horariosDisp * diasEnPeriodo;
    const slotsOcupados = reservasConfirmadas.filter(
      (r) => r.canchaId === c.id,
    ).length;
    const tasa =
      slotsTotal > 0 ? Math.round((slotsOcupados / slotsTotal) * 100) : 0;
    return { nombre: c.nombre, tasa, slotsOcupados, slotsTotal };
  });

  // Jugadores únicos
  const jugadoresUnicos = new Set(
    reservasConfirmadas
      .map((r) => r.nombreJugador || r.jugadorUid)
      .filter(Boolean),
  );

  // Datos para gráfico de barras de ingresos por cancha
  const dataIngresos = reservasPorCancha.map((c) => ({
    name: c.nombre,
    Ingresos: c.ingresos,
    Reservas: c.reservas,
  }));

  // Datos para gráfico de torta de ocupación
  const dataTorta = ocupacionPorCancha.map((c) => ({
    name: c.nombre,
    value: c.tasa,
  }));

  const periodoLabel =
    periodo === "dia"
      ? "Hoy"
      : periodo === "semana"
        ? "Última semana"
        : "Último mes";

  // Lista de horarios (más / menos populares) dentro de su tarjeta
  const listaHorarios = (horarios, claseCantidad) =>
    horarios.length === 0 ? (
      <p className="body-sm text-ink-2 mt-3 mb-0">Sin datos</p>
    ) : (
      <ol className="m-0 mt-2 p-0 list-none divide-y divide-line">
        {horarios.map((h, i) => (
          <li key={h.hora} className="flex items-center justify-between gap-3 py-2">
            <span className="flex items-center gap-3">
              <span className="label text-ink-3 w-5 pd-tnum">{i + 1}</span>
              <span className="body-md font-semibold! pd-tnum">{h.hora}</span>
            </span>
            <span className={`body-sm font-semibold! pd-tnum ${claseCantidad}`}>{h.cantidad} reservas</span>
          </li>
        ))}
      </ol>
    );

  return (
    <div>
      <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
        <h1 className="heading-lg m-0">Estadísticas</h1>
        <Pills items={PERIODOS} value={periodo} onChange={setPeriodo} ariaLabel="Período" />
      </div>

      {todasReservas.length === 0 ? (
        <Card className="max-w-xl">
          <Card.Title>Tus estadísticas aparecerán acá</Card.Title>
          <p className="body-md text-ink-2 mt-2 mb-4">
            Empezá a recibir reservas para ver métricas de tu club: ingresos, horarios populares, ocupación por cancha y más.
          </p>
          <ul className="m-0 p-0 list-none grid gap-2">
            <li className="flex items-start gap-3 rounded-md bg-surface-sunken px-4 py-3 body-sm text-ink-2">
              <Share className="pd-icon text-ink-3" size={20} aria-hidden="true" />
              <span>Compartí tu club con jugadores para empezar a recibir reservas</span>
            </li>
            <li className="flex items-start gap-3 rounded-md bg-surface-sunken px-4 py-3 body-sm text-ink-2">
              <LayoutGrid className="pd-icon text-ink-3" size={20} aria-hidden="true" />
              <span>Los jugadores pueden encontrar tu club en la sección "Canchas" de la app</span>
            </li>
          </ul>
        </Card>
      ) : (
        <>
          {/* Tarjetas resumen */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatTile value={formatPrecio(ingresosTotales)} label={`Ingresos · ${periodoLabel}`} />
            <StatTile value={gruposConfirmados.length} label={`Reservas · ${periodoLabel}`} />
            <StatTile value={jugadoresUnicos.size} label="Jugadores únicos" />
            <StatTile value={turnosFijos.filter((t) => t.status === "activo").length} label="Turnos fijos activos" />
          </div>

          {/* Gráfico de ingresos por cancha */}
          {dataIngresos.length > 0 && (
            <Card className="mb-4">
              <Card.Title className="mb-4!">Ingresos y reservas por cancha</Card.Title>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={dataIngresos}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line-strong)" />
                  <XAxis dataKey="name" stroke="var(--line-strong)" tick={TICK} tickLine={false} />
                  <YAxis stroke="var(--line-strong)" tick={TICK} tickLine={false} />
                  <Tooltip {...TOOLTIP} cursor={{ fill: "var(--surface-hover)" }} />
                  <Bar dataKey="Ingresos" fill="var(--court)" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="Reservas" fill="var(--lime)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}

          {/* Gráfico de ocupación */}
          {dataTorta.length > 0 && dataTorta.some((d) => d.value > 0) && (
            <Card className="mb-4">
              <Card.Title className="mb-4!">Tasa de ocupación por cancha</Card.Title>
              <div className="grid gap-4 md:grid-cols-2 md:items-center">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={dataTorta}
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      dataKey="value"
                      stroke="var(--surface-raised)"
                      label={({ value }) => `${value}%`}
                    >
                      {dataTorta.map((_, i) => (
                        <Cell key={i} fill={COLORES[i % COLORES.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => `${value}%`} {...TOOLTIP} />
                    <Legend wrapperStyle={LEGEND} />
                  </PieChart>
                </ResponsiveContainer>
                <ul className="m-0 p-0 list-none divide-y divide-line">
                  {ocupacionPorCancha.map((c, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 py-2">
                      <span className="flex items-center gap-2 body-md">
                        <span
                          className="w-3 h-3 rounded-pill flex-none"
                          style={{ backgroundColor: COLORES[i % COLORES.length] }}
                          aria-hidden="true"
                        />
                        {c.nombre}
                      </span>
                      <span className="pd-tnum">
                        <span className="body-md font-semibold!">{c.tasa}%</span>{" "}
                        <span className="body-sm text-ink-3">
                          {c.slotsOcupados} / {c.slotsTotal}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </Card>
          )}

          {/* Horarios más y menos reservados */}
          <div className="grid gap-4 md:grid-cols-2 mb-4">
            <Card>
              <Card.Title>Horarios más populares</Card.Title>
              {listaHorarios(top5Horarios, "text-success")}
            </Card>
            <Card>
              <Card.Title>Horarios menos populares</Card.Title>
              {listaHorarios(bottom5Horarios, "text-ink-3")}
            </Card>
          </div>

          {/* Detalle por cancha */}
          <div className="pd-table-wrap mb-4">
            <div className="pd-table-head">
              <h3>Detalle por cancha</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="pd-table">
                <thead>
                  <tr>
                    <th>Cancha</th>
                    <th className="num">Reservas</th>
                    <th className="num">Ingresos</th>
                  </tr>
                </thead>
                <tbody>
                  {reservasPorCancha.map((c, i) => (
                    <tr key={i}>
                      <td className="font-semibold">{c.nombre}</td>
                      <td className="num">{c.reservas}</td>
                      <td className="num font-semibold">{formatPrecio(c.ingresos)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
