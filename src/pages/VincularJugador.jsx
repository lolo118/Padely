import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { vincularJugadorAPareja, getParejaById, getTorneoById } from "../services/torneoService";

export default function VincularJugador() {
  const { torneoId, parejaId, posicion } = useParams();
  const { user, loading: authLoading } = useAuthStore();
  const navigate = useNavigate();
  const [estado, setEstado] = useState("verificando");
  const [torneo, setTorneo] = useState(null);
  const [pareja, setPareja] = useState(null);

  useEffect(() => {
    const cargar = async () => {
      try {
        const [torneoData, parejaData] = await Promise.all([
          getTorneoById(torneoId),
          getParejaById(torneoId, parejaId),
        ]);
        setTorneo(torneoData);
        setPareja(parejaData);
      } catch {
        setEstado("error");
      }
    };
    cargar();
  }, [torneoId, parejaId]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      localStorage.setItem("padely-vincular-redirect", window.location.pathname);
      navigate("/register");
      return;
    }
    if (!pareja) return;
    const vincular = async () => {
      try {
        const pos = Number(posicion);
        const exito = await vincularJugadorAPareja(torneoId, parejaId, pos, user.uid);
        if (exito) {
          setEstado("vinculado");
        } else {
          setEstado("error");
        }
      } catch {
        setEstado("error");
      }
    };
    vincular();
  }, [user, authLoading, pareja, torneoId, parejaId, posicion, navigate]);

  if (estado === "verificando" || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "var(--bg-primary)" }}>
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p style={{ color: "var(--text-muted)" }} className="text-sm">Vinculando tu cuenta...</p>
        </div>
      </div>
    );
  }

  if (estado === "vinculado") {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "var(--bg-primary)" }}>
        <div className="themed-card rounded-2xl p-8 border text-center max-w-md mx-4">
          <div className="text-5xl mb-4">✅</div>
          <h1 className="text-xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>¡Cuenta vinculada!</h1>
          {torneo && <p className="text-sm mb-1" style={{ color: "var(--text-secondary)" }}>Torneo: {torneo.nombre}</p>}
          {pareja && <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>Pareja: {pareja.nombrePareja}</p>}
          <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
            Ahora podés recibir puntos, participar de reclamos y recibir notificaciones del torneo.
          </p>
          <button onClick={() => navigate(`/torneos/${torneoId}`)}
            className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition"
            style={{ backgroundColor: "var(--accent)" }}>
            Ver torneo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "var(--bg-primary)" }}>
      <div className="themed-card rounded-2xl p-8 border text-center max-w-md mx-4">
        <div className="text-5xl mb-4">❌</div>
        <h1 className="text-xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>Error de vinculación</h1>
        <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
          No se pudo vincular tu cuenta. El link puede haber expirado o ya fue utilizado.
        </p>
        <button onClick={() => navigate("/inicio")}
          className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition"
          style={{ backgroundColor: "var(--accent)" }}>
          Ir al inicio
        </button>
      </div>
    </div>
  );
}
