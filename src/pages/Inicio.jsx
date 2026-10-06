import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { getInscripcionesByJugador } from "../services/torneoService";
import { getProximaReservaJugador } from "../services/canchaService";
import { formatFecha } from "../utils/formatDate";
import { formatPrecio } from "../utils/format";

export default function Inicio() {
  const { user, perfil } = useAuthStore();
  const navigate = useNavigate();
  const [inscripciones, setInscripciones] = useState([]);
  const [proximaReserva, setProximaReserva] = useState(null);
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
    return <div className="text-center py-12" style={{ color: "var(--text-muted)" }}>Cargando...</div>;
  }

  const inscPendientes = inscripciones.filter(
    (i) => i.status !== "confirmada" && i.status !== "rechazada"
  );
  const inscConfirmadas = inscripciones.filter((i) => i.status === "confirmada");
  // La categoría (nivel) la asigna el sistema de puntos, no cuenta como dato faltante
  const perfilIncompleto = perfil && (!perfil.telefono || !perfil.genero);

  const hora = new Date().getHours();
  const saludo = hora < 12 ? "Buenos días" : hora < 19 ? "Buenas tardes" : "Buenas noches";

  return (
    <div>
      <div className="mb-6">
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>{saludo}</p>
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{nombre}</h1>
      </div>

      {perfilIncompleto && (
        <div
          onClick={() => navigate("/perfil")}
          className="rounded-2xl p-4 mb-4 cursor-pointer hover:shadow-md transition border"
          style={{ backgroundColor: "var(--accent-light)", borderColor: "var(--accent)" }}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "rgba(245, 158, 11, 0.15)" }}>
              <span className="text-lg">⚠️</span>
            </div>
            <div>
              <p className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>Completá tu perfil</p>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                Necesitamos tus datos para inscribirte a torneos
              </p>
            </div>
          </div>
        </div>
      )}

      {proximaReserva && (
        <div
          onClick={() => navigate("/mis-reservas")}
          className="themed-card rounded-2xl p-4 mb-4 border cursor-pointer card-hover"
          style={{ borderColor: "var(--accent)" }}
        >
          <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--accent)" }}>
            Tu próxima reserva
          </p>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: "var(--accent-light)" }}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" style={{ color: "var(--accent)" }}>
                  <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate" style={{ color: "var(--text-primary)" }}>
                  {proximaReserva.clubNombre || "Club"} · {proximaReserva.canchaName || "Cancha"}
                </p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {formatFecha(proximaReserva.fecha)} · {proximaReserva.hora}
                  {proximaReserva.precio != null && ` · ${formatPrecio(proximaReserva.precio)}`}
                </p>
              </div>
            </div>
            <span
              className="text-xs font-semibold px-2 py-1 rounded-full shrink-0"
              style={
                proximaReserva.status === "confirmada"
                  ? { backgroundColor: "var(--accent-light)", color: "var(--accent)" }
                  : { backgroundColor: "rgba(245,158,11,0.12)", color: "#d97706" }
              }
            >
              {proximaReserva.status === "confirmada" ? "Confirmada" : "Pendiente"}
            </span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 mb-6">
        {[
          { to: "/hub", label: "Reservar cancha", sub: "Ver canchas disponibles", color: "#059669", bgColor: "rgba(5, 150, 105, 0.1)", icon: (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="1.8" className="w-5 h-5">
              <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="12" y1="3" x2="12" y2="21" /><line x1="3" y1="12" x2="21" y2="12" />
            </svg>
          )},
          { to: "/mis-reservas", label: "Mis reservas", sub: "Próximas y anteriores", color: "#3b82f6", bgColor: "rgba(59, 130, 246, 0.1)", icon: (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /><polyline points="9 16 11 18 15 14" />
            </svg>
          )},
          { to: "/torneos", label: "Torneos", sub: "Inscribite o mirá resultados", color: "#3b82f6", bgColor: "rgba(59, 130, 246, 0.1)", icon: (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.8" className="w-5 h-5">
              <path d="M6 9H4.5a2.5 2.5 0 010-5H6" /><path d="M18 9h1.5a2.5 2.5 0 000-5H18" /><path d="M4 22h16" /><path d="M18 2H6v7a6 6 0 0012 0V2Z" />
            </svg>
          )},
          { to: "/perfil", label: "Mi perfil", sub: "Datos y estadísticas", color: "#8b5cf6", bgColor: "rgba(139, 92, 246, 0.1)", icon: (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="1.8" className="w-5 h-5">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
            </svg>
          )},
          { to: "/marketplace", label: "Tienda", sub: "Equipamiento y accesorios", color: "#f97316", bgColor: "rgba(249, 115, 22, 0.1)", icon: (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="1.8" className="w-5 h-5">
              <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 01-8 0" />
            </svg>
          )},
        ].map((item) => (
          <div
            key={item.to}
            onClick={() => navigate(item.to)}
            className="themed-card rounded-2xl p-5 border cursor-pointer card-hover"
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ backgroundColor: item.bgColor }}>
              {item.icon}
            </div>
            <p className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>{item.label}</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{item.sub}</p>
          </div>
        ))}
      </div>

      {inscPendientes.length > 0 && (
        <div className="themed-card rounded-2xl p-5 border mb-4" style={{ borderColor: "rgba(245, 158, 11, 0.3)" }}>
          <h2 className="font-semibold text-sm mb-3" style={{ color: "var(--text-primary)" }}>
            Inscripciones pendientes ({inscPendientes.length})
          </h2>
          <div className="flex flex-col gap-2">
            {inscPendientes.map((insc) => (
              <div key={insc.id} onClick={() => navigate(`/torneos/${insc.torneoId}`)}
                className="flex items-center justify-between rounded-xl px-4 py-3 cursor-pointer transition"
                style={{ backgroundColor: "var(--bg-card-hover)" }}>
                <div>
                  <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{insc.torneoNombre}</p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>{insc.apellido1}-{insc.apellido2}</p>
                </div>
                <span className="text-xs font-semibold px-2 py-1 rounded-full bg-amber-100 text-amber-700 capitalize">
                  {(insc.status || "").replace(/_/g, " ")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {inscConfirmadas.length > 0 && (
        <div className="themed-card rounded-2xl p-5 border mb-4">
          <h2 className="font-semibold text-sm mb-3" style={{ color: "var(--text-primary)" }}>
            Mis torneos activos
          </h2>
          <div className="flex flex-col gap-2">
            {inscConfirmadas.slice(0, 3).map((insc) => (
              <div key={insc.id} onClick={() => navigate(`/torneos/${insc.torneoId}`)}
                className="flex items-center justify-between rounded-xl px-4 py-3 cursor-pointer transition"
                style={{ backgroundColor: "var(--bg-card-hover)" }}>
                <div>
                  <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{insc.torneoNombre}</p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>{insc.apellido1}-{insc.apellido2}</p>
                </div>
                <span className="text-xs font-semibold px-2 py-1 rounded-full" style={{ backgroundColor: "var(--accent-light)", color: "var(--accent)" }}>
                  Inscripto
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {inscPendientes.length === 0 && inscConfirmadas.length === 0 && (
        <div className="themed-card rounded-2xl p-8 border text-center">
          <div className="text-4xl mb-3">🎾</div>
          <p className="font-semibold" style={{ color: "var(--text-primary)" }}>¡Bienvenido a Padely!</p>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            Reservá una cancha o inscribite a un torneo para empezar
          </p>
        </div>
      )}
    </div>
  );
}
