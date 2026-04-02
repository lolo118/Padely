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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-10 h-10 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin mb-3" />
        <p style={{ color: "var(--text-muted)" }} className="text-sm">
          Cargando...
        </p>
      </div>
    );
  }

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
    if (
      reservasHoy.some(
        (r) =>
          r.canchaId === c.id &&
          r.hora === horaAhora &&
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

  const cardStyle =
    "themed-card rounded-2xl p-5 border cursor-pointer card-hover";

  return (
    <div>
      <div className="mb-6">
        <h1
          className="text-xl font-bold"
          style={{ color: "var(--text-primary)" }}
        >
          {club ? `Bienvenido, ${club.nombre}` : "Dashboard"}
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
          Resumen del día —{" "}
          {new Date().toLocaleDateString("es-AR", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      </div>

      {/* Recordatorio completar perfil */}
      {club && (!club.telefono || !club.direccion) && (
        <div
          onClick={() => navigate("/admin/configuracion")}
          className="rounded-2xl p-4 mb-4 cursor-pointer hover:shadow-md transition border"
          style={{ backgroundColor: "var(--accent-light)", borderColor: "var(--accent)" }}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "rgba(245, 158, 11, 0.15)" }}>
              <span className="text-lg">⚠️</span>
            </div>
            <div>
              <p className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>Completá los datos de tu club</p>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                Agregá teléfono, dirección y redes sociales para que los jugadores te encuentren
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tarjetas resumen */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div onClick={() => navigate("/admin/canchas")} className={cardStyle}>
          <div className="flex items-center justify-between">
            <div>
              <p
                className="text-3xl font-bold"
                style={{ color: "var(--accent)" }}
              >
                {reservasConfirmadas.length}
              </p>
              <p
                className="text-xs mt-1"
                style={{ color: "var(--text-muted)" }}
              >
                Reservas hoy
              </p>
            </div>
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: "var(--accent-light)" }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                className="w-5 h-5"
                style={{ color: "var(--accent)" }}
              >
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
          </div>
        </div>

        <div
          onClick={() => navigate("/admin/estadisticas")}
          className={cardStyle}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-3xl font-bold" style={{ color: "#3b82f6" }}>
                ${ingresosHoy.toLocaleString()}
              </p>
              <p
                className="text-xs mt-1"
                style={{ color: "var(--text-muted)" }}
              >
                Ingresos hoy
              </p>
            </div>
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: "rgba(59,130,246,0.1)" }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#3b82f6"
                strokeWidth="1.8"
                className="w-5 h-5"
              >
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
              </svg>
            </div>
          </div>
        </div>

        <div onClick={() => navigate("/admin/canchas")} className={cardStyle}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-3xl font-bold" style={{ color: "#8b5cf6" }}>
                {turnosFijosActivos.length}
              </p>
              <p
                className="text-xs mt-1"
                style={{ color: "var(--text-muted)" }}
              >
                Turnos fijos activos
              </p>
            </div>
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: "rgba(139,92,246,0.1)" }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#8b5cf6"
                strokeWidth="1.8"
                className="w-5 h-5"
              >
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
            </div>
          </div>
        </div>

        <div onClick={() => navigate("/admin/canchas")} className={cardStyle}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-3xl font-bold" style={{ color: "#f97316" }}>
                {canchasLibresAhora}
              </p>
              <p
                className="text-xs mt-1"
                style={{ color: "var(--text-muted)" }}
              >
                Canchas libres ahora
              </p>
            </div>
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: "rgba(249,115,22,0.1)" }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#f97316"
                strokeWidth="1.8"
                className="w-5 h-5"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="12" y1="3" x2="12" y2="21" />
                <line x1="3" y1="12" x2="21" y2="12" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Reservas pendientes */}
      {reservasPendientes.length > 0 && (
        <div
          className="themed-card rounded-2xl p-5 border mb-4"
          style={{ borderColor: "rgba(245,158,11,0.3)" }}
        >
          <h2 className="font-semibold mb-3" style={{ color: "#f59e0b" }}>
            Reservas pendientes de aprobación ({reservasPendientes.length})
          </h2>
          <div className="flex flex-col gap-2">
            {reservasPendientes.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-xl px-4 py-3"
                style={{ backgroundColor: "rgba(245,158,11,0.08)" }}
              >
                <div>
                  <p
                    className="text-sm font-semibold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {r.nombreJugador || "Jugador"}
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {r.canchaName || "Cancha"} — {r.hora}
                  </p>
                </div>
                <span
                  className="text-xs font-semibold px-2 py-1 rounded-full"
                  style={{
                    backgroundColor: "rgba(245,158,11,0.15)",
                    color: "#f59e0b",
                  }}
                >
                  Pendiente
                </span>
              </div>
            ))}
            <button
              onClick={() => navigate("/admin/canchas")}
              className="text-xs font-semibold hover:underline mt-1"
              style={{ color: "var(--accent)" }}
            >
              Gestionar en Canchas →
            </button>
          </div>
        </div>
      )}

      {/* Próximas reservas */}
      <div className="themed-card rounded-2xl p-5 border mb-4">
        <h2
          className="font-semibold mb-3"
          style={{ color: "var(--text-primary)" }}
        >
          Próximas reservas hoy
        </h2>
        {proximasReservas.length === 0 ? (
          <p
            className="text-sm text-center py-4"
            style={{ color: "var(--text-muted)" }}
          >
            No hay más reservas para hoy
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {proximasReservas.map((r, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-xl px-4 py-3"
                style={{ backgroundColor: "var(--bg-card-hover)" }}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="text-sm font-bold w-14"
                    style={{ color: "var(--accent)" }}
                  >
                    {r.hora}
                  </span>
                  <div>
                    <p
                      className="text-sm font-medium"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {r.nombreJugador || "Jugador"}
                    </p>
                    <p
                      className="text-xs"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {r.canchaName || "Cancha"}
                    </p>
                  </div>
                </div>
                <span
                  className="text-xs font-semibold"
                  style={{ color: "var(--accent)" }}
                >
                  ${r.precio || 0}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Turnos activos ahora */}
      <div className="themed-card rounded-2xl p-5 border mb-4">
        <h2
          className="font-semibold mb-3"
          style={{ color: "var(--text-primary)" }}
        >
          Turnos activos ahora
        </h2>
        {(() => {
          const turnosAhora = reservasConfirmadas.filter(
            (r) => parseInt(r.hora) === horaActual,
          );
          const turnosFijosAhora = turnosFijosActivos.filter(
            (t) =>
              t.dia === diaHoy && (t.horas || [t.hora]).includes(horaAhora),
          );
          if (turnosAhora.length === 0 && turnosFijosAhora.length === 0) {
            return (
              <p
                className="text-sm text-center py-4"
                style={{ color: "var(--text-muted)" }}
              >
                No hay turnos activos en este momento
              </p>
            );
          }
          return (
            <div className="flex flex-col gap-2">
              {turnosAhora.map((r, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-xl px-4 py-3"
                  style={{ backgroundColor: "var(--accent-light)" }}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="text-sm font-bold"
                      style={{ color: "var(--accent)" }}
                    >
                      {r.hora}
                    </span>
                    <div>
                      <p
                        className="text-sm font-medium"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {r.nombreJugador || "Jugador"}
                      </p>
                      <p
                        className="text-xs"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {r.canchaName || "Cancha"}
                      </p>
                    </div>
                  </div>
                  <span
                    className="text-xs font-semibold px-2 py-1 rounded-full"
                    style={{
                      backgroundColor: "rgba(5,150,105,0.15)",
                      color: "var(--accent)",
                    }}
                  >
                    En juego
                  </span>
                </div>
              ))}
              {turnosFijosAhora.map((tf, i) => (
                <div
                  key={`tf-${i}`}
                  className="flex items-center justify-between rounded-xl px-4 py-3"
                  style={{ backgroundColor: "rgba(139,92,246,0.08)" }}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="text-sm font-bold"
                      style={{ color: "#8b5cf6" }}
                    >
                      {(tf.horas || [tf.hora]).join(", ")}
                    </span>
                    <div>
                      <p
                        className="text-sm font-medium"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {tf.nombreJugador}
                      </p>
                      <p
                        className="text-xs"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {tf.canchaName} · Turno fijo
                      </p>
                    </div>
                  </div>
                  <span
                    className="text-xs font-semibold px-2 py-1 rounded-full"
                    style={{
                      backgroundColor: "rgba(139,92,246,0.15)",
                      color: "#8b5cf6",
                    }}
                  >
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
        <div className="themed-card rounded-2xl p-5 border mb-4">
          <h2
            className="font-semibold mb-3"
            style={{ color: "var(--text-primary)" }}
          >
            Torneos próximos
          </h2>
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
                  className="flex items-center justify-between rounded-xl px-4 py-3 cursor-pointer transition"
                  style={{ backgroundColor: "var(--bg-card-hover)" }}
                >
                  <div>
                    <p
                      className="text-sm font-semibold"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {t.nombre}
                    </p>
                    <p
                      className="text-xs"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {t.sede} — {t.fechaInicio} → {t.fechaFin}
                    </p>
                  </div>
                  <span
                    className={`text-xs font-semibold px-2 py-1 rounded-full ${
                      t.status === "inscripcion"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {t.status === "inscripcion" ? "Inscripción" : "En curso"}
                  </span>
                </div>
              ))}
            {torneos.filter(
              (t) => t.status === "inscripcion" || t.status === "en_curso",
            ).length === 0 && (
              <p
                className="text-sm text-center py-4"
                style={{ color: "var(--text-muted)" }}
              >
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
          className="rounded-2xl p-4 text-sm font-semibold text-white transition hover:opacity-90"
          style={{ backgroundColor: "var(--accent)" }}
        >
          + Crear torneo
        </button>
        <button
          onClick={() => navigate("/admin/canchas")}
          className="rounded-2xl p-4 text-sm font-semibold text-white transition hover:opacity-90 bg-blue-600"
        >
          Gestionar canchas
        </button>
      </div>
    </div>
  );
}
