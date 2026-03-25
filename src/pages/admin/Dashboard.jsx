import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import { getTorneosByOrganizer } from "../../services/torneoService";
import {
  getClubByOwner,
  getCanchas,
  getReservas,
  getTurnosFijos,
} from "../../services/canchaService";

export default function Dashboard() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [club, setClub] = useState(null);
  const [torneos, setTorneos] = useState([]);
  const [canchas, setCanchas] = useState([]);
  const [reservasHoy, setReservasHoy] = useState([]);
  const [turnosFijos, setTurnosFijos] = useState([]);
  const [loading, setLoading] = useState(true);

  const hoy = new Date().toISOString().split("T")[0];
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
          const [canchasData, reservasData, turnosData] = await Promise.all([
            getCanchas(clubData.id),
            getReservas(clubData.id, hoy),
            getTurnosFijos(clubData.id),
          ]);
          setCanchas(canchasData);
          setReservasHoy(reservasData);
          setTurnosFijos(turnosData);
        }
      } catch (err) {
        console.error("Error al cargar dashboard:", err);
      }
      setLoading(false);
    };
    cargar();
  }, [user]);

  if (loading) {
    return <div className="text-center text-gray-400 py-12">Cargando...</div>;
  }

  const torneosActivos = torneos.filter(
    (t) => t.status === "inscripcion" || t.status === "en_curso",
  );
  const reservasConfirmadas = reservasHoy.filter(
    (r) => r.status === "confirmada",
  );
  const reservasPendientes = reservasHoy.filter(
    (r) => r.status === "pendiente",
  );
  const ingresosHoy = reservasConfirmadas.reduce(
    (sum, r) => sum + (Number(r.precio) || 0),
    0,
  );
  const turnosFijosActivos = turnosFijos.filter((t) => t.status === "activo");

  // Canchas libres ahora
  const horaAhora = `${String(horaActual).padStart(2, "0")}:00`;
  const partesFecha = hoy.split("-");
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

  const canchasLibresAhora = canchas.filter((c) => {
    const disponible = (c.horariosDisponibles || []).includes(horaAhora);
    if (!disponible) return false;
    const ocupada = reservasHoy.some(
      (r) =>
        r.canchaId === c.id && r.hora === horaAhora && r.status !== "cancelada",
    );
    if (ocupada) return false;
    const tieneTurnoFijo = turnosFijosActivos.some(
      (t) =>
        t.canchaId === c.id &&
        t.dia === diaHoy &&
        (t.horas || [t.hora]).includes(horaAhora),
    );
    if (tieneTurnoFijo) return false;
    return true;
  }).length;

  // Próximas horas con reservas hoy
  const proximasReservas = reservasConfirmadas
    .filter((r) => {
      const horaReserva = parseInt(r.hora);
      return horaReserva >= horaActual;
    })
    .sort((a, b) => a.hora.localeCompare(b.hora))
    .slice(0, 5);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-800">
          {club ? `Bienvenido, ${club.nombre}` : "Dashboard"}
        </h1>
        <p className="text-sm text-gray-400 mt-1">
          Resumen del día —{" "}
          {new Date().toLocaleDateString("es-AR", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      </div>

      {/* Tarjetas resumen */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div
          onClick={() => navigate("/admin/canchas")}
          className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-3xl font-bold text-green-600">
                {reservasConfirmadas.length}
              </p>
              <p className="text-xs text-gray-400 mt-1">Reservas hoy</p>
            </div>
            <span className="text-3xl">📅</span>
          </div>
        </div>

        <div
          onClick={() => navigate("/admin/estadisticas")}
          className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-3xl font-bold text-blue-600">
                ${ingresosHoy.toLocaleString()}
              </p>
              <p className="text-xs text-gray-400 mt-1">Ingresos hoy</p>
            </div>
            <span className="text-3xl">💰</span>
          </div>
        </div>

        <div
          onClick={() => navigate("/admin/torneos")}
          className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-3xl font-bold text-purple-600">
                {turnosFijosActivos.length}
              </p>
              <p className="text-xs text-gray-400 mt-1">Turnos fijos activos</p>
            </div>
            <span className="text-3xl">📌</span>
          </div>
        </div>

        <div
          onClick={() => navigate("/admin/canchas")}
          className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-3xl font-bold text-orange-500">
                {canchasLibresAhora}
              </p>
              <p className="text-xs text-gray-400 mt-1">Canchas libres ahora</p>
            </div>
            <span className="text-3xl">🟢</span>
          </div>
        </div>
      </div>

      {/* Reservas pendientes de aprobación */}
      {reservasPendientes.length > 0 && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-yellow-200 mb-4">
          <h2 className="font-semibold text-yellow-700 mb-3">
            Reservas pendientes de aprobación ({reservasPendientes.length})
          </h2>
          <div className="flex flex-col gap-2">
            {reservasPendientes.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between bg-yellow-50 rounded-xl px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-gray-700">
                    {r.nombreJugador || "Jugador"}
                  </p>
                  <p className="text-xs text-gray-400">
                    {r.canchaName || "Cancha"} — {r.hora}
                  </p>
                </div>
                <span className="text-xs font-semibold px-2 py-1 rounded-full bg-yellow-100 text-yellow-700">
                  Pendiente
                </span>
              </div>
            ))}
            <button
              onClick={() => navigate("/admin/canchas")}
              className="text-xs text-green-600 font-semibold hover:underline mt-1"
            >
              Gestionar en Canchas →
            </button>
          </div>
        </div>
      )}

      {/* Próximas reservas de hoy */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-4">
        <h2 className="font-semibold text-gray-700 mb-3">
          Próximas reservas hoy
        </h2>
        {proximasReservas.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-4">
            No hay más reservas para hoy
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {proximasReservas.map((r, i) => (
              <div
                key={i}
                className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-green-600 w-14">
                    {r.hora}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-gray-700">
                      {r.nombreJugador || "Jugador"}
                    </p>
                    <p className="text-xs text-gray-400">
                      {r.canchaName || "Cancha"}
                    </p>
                  </div>
                </div>
                <span className="text-xs font-semibold text-green-600">
                  ${r.precio || 0}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Turnos activos ahora */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-4">
        <h2 className="font-semibold text-gray-700 mb-3">
          Turnos activos ahora
        </h2>
        {(() => {
          const turnosAhora = reservasConfirmadas.filter((r) => {
            const horaReserva = parseInt(r.hora);
            return horaReserva === horaActual;
          });
          const turnosFijosAhora = turnosFijosActivos.filter(
            (t) =>
              t.dia === diaHoy && (t.horas || [t.hora]).includes(horaAhora),
          );

          if (turnosAhora.length === 0 && turnosFijosAhora.length === 0) {
            return (
              <p className="text-gray-400 text-sm text-center py-4">
                No hay turnos activos en este momento
              </p>
            );
          }

          return (
            <div className="flex flex-col gap-2">
              {turnosAhora.map((r, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between bg-green-50 rounded-xl px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-green-600">
                      {r.hora}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-gray-700">
                        {r.nombreJugador || "Jugador"}
                      </p>
                      <p className="text-xs text-gray-400">
                        {r.canchaName || "Cancha"}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold px-2 py-1 rounded-full bg-green-100 text-green-600">
                    En juego
                  </span>
                </div>
              ))}
              {turnosFijosAhora.map((tf, i) => (
                <div
                  key={`tf-${i}`}
                  className="flex items-center justify-between bg-purple-50 rounded-xl px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-purple-600">
                      {(tf.horas || [tf.hora]).join(", ")}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-gray-700">
                        {tf.nombreJugador}
                      </p>
                      <p className="text-xs text-gray-400">
                        {tf.canchaName} · Turno fijo
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold px-2 py-1 rounded-full bg-purple-100 text-purple-600">
                    Fijo
                  </span>
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      {/* Torneos próximos */}
      {torneos.length > 0 && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-4">
          <h2 className="font-semibold text-gray-700 mb-3">Torneos próximos</h2>
          <div className="flex flex-col gap-2">
            {torneos
              .filter(
                (t) => t.status === "inscripcion" || t.status === "en_curso",
              )
              .slice(0, 3)
              .map((t) => (
                <div
                  key={t.id}
                  onClick={() => navigate(`/admin/torneos/${t.id}`)}
                  className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3 cursor-pointer hover:bg-gray-100 transition"
                >
                  <div>
                    <p className="text-sm font-semibold text-gray-700">
                      {t.nombre}
                    </p>
                    <p className="text-xs text-gray-400">
                      {t.sede} — {t.fechaInicio} → {t.fechaFin}
                    </p>
                  </div>
                  <span
                    className={`text-xs font-semibold px-2 py-1 rounded-full ${
                      t.status === "inscripcion"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-green-100 text-green-700"
                    }`}
                  >
                    {t.status === "inscripcion" ? "Inscripción" : "En curso"}
                  </span>
                </div>
              ))}
            {torneos.filter(
              (t) => t.status === "inscripcion" || t.status === "en_curso",
            ).length === 0 && (
              <p className="text-gray-400 text-sm text-center py-4">
                No hay torneos próximos
              </p>
            )}
          </div>
        </div>
      )}

      {/* Accesos rápidos */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => navigate("/admin/torneos/nuevo")}
          className="bg-green-600 text-white rounded-2xl p-4 text-sm font-semibold hover:bg-green-700 transition"
        >
          + Crear torneo
        </button>
        <button
          onClick={() => navigate("/admin/canchas")}
          className="bg-blue-600 text-white rounded-2xl p-4 text-sm font-semibold hover:bg-blue-700 transition"
        >
          Gestionar canchas
        </button>
      </div>
    </div>
  );
}
