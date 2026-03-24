import { useEffect, useState } from "react";
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

const COLORES = [
  "#22c55e",
  "#3b82f6",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
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
      <div className="text-center text-gray-400 py-12">
        Cargando estadísticas...
      </div>
    );
  }

  if (!club) {
    return (
      <div className="text-center py-16 bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="text-5xl mb-4">📊</div>
        <p className="text-gray-500 font-medium">No tenés un club registrado</p>
      </div>
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
      return r.fecha === hoy.toISOString().split("T")[0];
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

  // Reservas por cancha
  const reservasPorCancha = canchas.map((c) => ({
    nombre: c.nombre,
    reservas: reservasConfirmadas.filter((r) => r.canchaId === c.id).length,
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-800">Estadísticas</h1>
        <div className="flex gap-2">
          {[
            { key: "dia", label: "Hoy" },
            { key: "semana", label: "Semana" },
            { key: "mes", label: "Mes" },
          ].map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriodo(p.key)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
                periodo === p.key
                  ? "bg-green-600 text-white"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tarjetas resumen */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 text-center">
          <p className="text-3xl font-bold text-green-600">
            ${ingresosTotales.toLocaleString()}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Ingresos ({periodoLabel})
          </p>
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 text-center">
          <p className="text-3xl font-bold text-blue-600">
            {reservasConfirmadas.length}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Reservas ({periodoLabel})
          </p>
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 text-center">
          <p className="text-3xl font-bold text-purple-600">
            {jugadoresUnicos.size}
          </p>
          <p className="text-xs text-gray-400 mt-1">Jugadores únicos</p>
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 text-center">
          <p className="text-3xl font-bold text-orange-500">
            {turnosFijos.filter((t) => t.status === "activo").length}
          </p>
          <p className="text-xs text-gray-400 mt-1">Turnos fijos activos</p>
        </div>
      </div>

      {/* Gráfico de ingresos por cancha */}
      {dataIngresos.length > 0 && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-4">
          <h2 className="font-semibold text-gray-700 mb-4">
            Ingresos y reservas por cancha
          </h2>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={dataIngresos}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="Ingresos" fill="#22c55e" radius={[6, 6, 0, 0]} />
              <Bar dataKey="Reservas" fill="#3b82f6" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Gráfico de ocupación */}
      {dataTorta.length > 0 && dataTorta.some((d) => d.value > 0) && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-4">
          <h2 className="font-semibold text-gray-700 mb-4">
            Tasa de ocupación por cancha
          </h2>
          <div className="flex items-center gap-4">
            <ResponsiveContainer width="50%" height={200}>
              <PieChart>
                <Pie
                  data={dataTorta}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  dataKey="value"
                  label={({ name, value }) => `${value}%`}
                >
                  {dataTorta.map((_, i) => (
                    <Cell key={i} fill={COLORES[i % COLORES.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => `${value}%`} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 flex flex-col gap-2">
              {ocupacionPorCancha.map((c, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: COLORES[i % COLORES.length] }}
                    />
                    <span className="text-sm text-gray-700">{c.nombre}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-semibold text-gray-700">
                      {c.tasa}%
                    </span>
                    <span className="text-xs text-gray-400 ml-1">
                      ({c.slotsOcupados}/{c.slotsTotal})
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Horarios más y menos reservados */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <h2 className="font-semibold text-gray-700 mb-3">
            Horarios más populares
          </h2>
          {top5Horarios.length === 0 ? (
            <p className="text-gray-400 text-sm">Sin datos</p>
          ) : (
            <div className="flex flex-col gap-2">
              {top5Horarios.map((h, i) => (
                <div key={h.hora} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-400 w-5">
                      {i + 1}
                    </span>
                    <span className="text-sm font-medium text-gray-700">
                      {h.hora}
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-green-600">
                    {h.cantidad} reservas
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <h2 className="font-semibold text-gray-700 mb-3">
            Horarios menos populares
          </h2>
          {bottom5Horarios.length === 0 ? (
            <p className="text-gray-400 text-sm">Sin datos</p>
          ) : (
            <div className="flex flex-col gap-2">
              {bottom5Horarios.map((h, i) => (
                <div key={h.hora} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-400 w-5">
                      {i + 1}
                    </span>
                    <span className="text-sm font-medium text-gray-700">
                      {h.hora}
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-red-400">
                    {h.cantidad} reservas
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detalle por cancha */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-4">
        <h2 className="font-semibold text-gray-700 mb-3">Detalle por cancha</h2>
        <div className="flex flex-col gap-3">
          {reservasPorCancha.map((c, i) => (
            <div
              key={i}
              className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3"
            >
              <div>
                <p className="text-sm font-semibold text-gray-700">
                  {c.nombre}
                </p>
                <p className="text-xs text-gray-400">{c.reservas} reservas</p>
              </div>
              <p className="text-sm font-bold text-green-600">
                ${c.ingresos.toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
