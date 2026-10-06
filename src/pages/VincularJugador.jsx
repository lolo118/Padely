import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { vincularJugadorAPareja, getParejaById, getTorneoById } from "../services/torneoService";

function Pantalla({ children }) {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "var(--bg-primary)" }}>
      <div className="themed-card rounded-2xl p-8 border text-center max-w-md mx-4 w-full">{children}</div>
    </div>
  );
}

export default function VincularJugador() {
  const { torneoId, parejaId, posicion } = useParams();
  const { user, loading: authLoading } = useAuthStore();
  const navigate = useNavigate();
  // null mientras no hubo acción; después: "vinculando" | "vinculado" | "ya_vinculado" | "ocupado" | "error"
  const [estado, setEstado] = useState(null);
  const [torneo, setTorneo] = useState(null);
  const [pareja, setPareja] = useState(null);

  const pos = Number(posicion) === 2 ? 2 : 1;
  const campoUid = pos === 1 ? "jugador1Uid" : "jugador2Uid";
  const nombreJugador = pareja ? (pos === 1 ? pareja.jugador1 : pareja.jugador2) : "";

  useEffect(() => {
    const cargar = async () => {
      try {
        const [torneoData, parejaData] = await Promise.all([
          getTorneoById(torneoId),
          getParejaById(torneoId, parejaId),
        ]);
        if (!torneoData || !parejaData) {
          setEstado("error");
          return;
        }
        setTorneo(torneoData);
        setPareja(parejaData);
      } catch {
        setEstado("error");
      }
    };
    cargar();
  }, [torneoId, parejaId]);

  // Hay que estar logueado: guardamos a dónde volver y vamos al registro
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      localStorage.setItem("padely-vincular-redirect", window.location.pathname);
      navigate("/register");
    }
  }, [user, authLoading, navigate]);

  // Pantalla a mostrar: se deriva de los datos cargados (no se escribe nada hasta que el jugador confirma)
  let vista;
  if (estado) vista = estado;
  else if (authLoading || !user || !pareja || !torneo) vista = "verificando";
  else {
    const actual = pareja[campoUid];
    vista = actual && actual === user.uid ? "ya_vinculado" : actual ? "ocupado" : "confirmar";
  }

  const confirmarVinculacion = async () => {
    if (!user) return;
    setEstado("vinculando");
    try {
      const resultado = await vincularJugadorAPareja(torneoId, parejaId, pos, user.uid);
      if (resultado === "ok") setEstado("vinculado");
      else if (resultado === "ya_vinculado") setEstado("ya_vinculado");
      else if (resultado === "ocupado") setEstado("ocupado");
      else setEstado("error");
    } catch (err) {
      console.error("Error vinculando:", err);
      setEstado("error");
    }
  };

  if (vista === "verificando" || vista === "vinculando") {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "var(--bg-primary)" }}>
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p style={{ color: "var(--text-muted)" }} className="text-sm">
            {vista === "vinculando" ? "Vinculando tu cuenta..." : "Verificando el link..."}
          </p>
        </div>
      </div>
    );
  }

  if (vista === "confirmar") {
    return (
      <Pantalla>
        <div className="text-5xl mb-4">🔗</div>
        <h1 className="text-xl font-bold mb-3" style={{ color: "var(--text-primary)" }}>Vincular tu cuenta</h1>
        <p className="text-sm mb-2" style={{ color: "var(--text-secondary)" }}>
          Vas a vincular tu cuenta como{" "}
          <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{nombreJugador || `Jugador ${pos}`}</span>
          {" "}en{" "}
          <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{torneo?.nombre}</span>.
        </p>
        {pareja?.nombrePareja && (
          <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>Pareja: {pareja.nombrePareja}</p>
        )}
        <p className="text-sm font-semibold mb-5" style={{ color: "var(--text-primary)" }}>¿Sos vos?</p>
        <div className="flex gap-2">
          <button
            onClick={() => navigate("/inicio")}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition"
            style={{ backgroundColor: "var(--bg-card-hover)", color: "var(--text-secondary)" }}
          >
            No soy yo
          </button>
          <button
            onClick={confirmarVinculacion}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition hover:opacity-90"
            style={{ backgroundColor: "var(--accent)" }}
          >
            Confirmar
          </button>
        </div>
      </Pantalla>
    );
  }

  if (vista === "vinculado" || vista === "ya_vinculado") {
    return (
      <Pantalla>
        <div className="text-5xl mb-4">✅</div>
        <h1 className="text-xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>
          {vista === "vinculado" ? "¡Cuenta vinculada!" : "Tu cuenta ya estaba vinculada"}
        </h1>
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
      </Pantalla>
    );
  }

  if (vista === "ocupado") {
    return (
      <Pantalla>
        <div className="text-5xl mb-4">🔒</div>
        <h1 className="text-xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>Este lugar ya está vinculado</h1>
        <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
          Otra cuenta ya se vinculó como {nombreJugador || `Jugador ${pos}`} en {torneo?.nombre}. Si creés que es un error,
          pedile al organizador que revise la pareja.
        </p>
        <button onClick={() => navigate(`/torneos/${torneoId}`)}
          className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition"
          style={{ backgroundColor: "var(--accent)" }}>
          Ver torneo
        </button>
      </Pantalla>
    );
  }

  return (
    <Pantalla>
      <div className="text-5xl mb-4">❌</div>
      <h1 className="text-xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>Error de vinculación</h1>
      <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
        No se pudo vincular tu cuenta. El link puede estar vencido o ser incorrecto.
      </p>
      <button onClick={() => navigate("/inicio")}
        className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition"
        style={{ backgroundColor: "var(--accent)" }}>
        Ir al inicio
      </button>
    </Pantalla>
  );
}
