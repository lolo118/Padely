import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Check, Link2, Lock, X } from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { vincularJugadorAPareja, getParejaById, getTorneoById } from "../services/torneoService";
import { Button } from "../components/ui";

function Pantalla({ children, ...rest }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-surface">
      <div className="pd-card text-center max-w-md w-full" {...rest}>
        {children}
      </div>
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
      <Pantalla aria-busy="true">
        <div className="flex flex-col gap-3">
          <div className="pd-skeleton h-7 w-2/3 mx-auto" />
          <div className="pd-skeleton h-4 w-full" />
          <div className="pd-skeleton h-4 w-5/6 mx-auto" />
        </div>
        <p className="body-sm text-ink-3 mt-4">
          {vista === "vinculando" ? "Vinculando tu cuenta…" : "Verificando el link…"}
        </p>
      </Pantalla>
    );
  }

  if (vista === "confirmar") {
    return (
      <Pantalla>
        <Link2 className="pd-icon-lg block mx-auto mb-4 text-ink-3" size={24} aria-hidden="true" />
        <h1 className="heading-md mb-3">Vincular tu cuenta</h1>
        <p className="body-md text-ink-2 mb-2">
          Vas a vincular tu cuenta como{" "}
          <strong className="font-semibold text-ink">{nombreJugador || `Jugador ${pos}`}</strong>
          {" "}en{" "}
          <strong className="font-semibold text-ink">{torneo?.nombre}</strong>.
        </p>
        {pareja?.nombrePareja && (
          <p className="body-sm text-ink-3 mb-4">Pareja: {pareja.nombrePareja}</p>
        )}
        <p className="heading-sm mb-5">¿Sos vos?</p>
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => navigate("/inicio")}>
            No soy yo
          </Button>
          <Button variant="primary" className="flex-1" onClick={confirmarVinculacion}>
            Confirmar
          </Button>
        </div>
      </Pantalla>
    );
  }

  if (vista === "vinculado" || vista === "ya_vinculado") {
    return (
      <Pantalla>
        <Check className="pd-icon-lg block mx-auto mb-4 text-success" size={24} aria-hidden="true" />
        <h1 className="heading-md mb-2">
          {vista === "vinculado" ? "¡Cuenta vinculada!" : "Tu cuenta ya estaba vinculada"}
        </h1>
        {torneo && <p className="body-sm text-ink-2 mb-1">Torneo: {torneo.nombre}</p>}
        {pareja && <p className="body-sm text-ink-3 mb-4">Pareja: {pareja.nombrePareja}</p>}
        <p className="body-sm text-ink-3 mb-6">
          Ahora podés recibir puntos, participar de reclamos y recibir notificaciones del torneo.
        </p>
        <Button variant="primary" onClick={() => navigate(`/torneos/${torneoId}`)}>
          Ver torneo
        </Button>
      </Pantalla>
    );
  }

  if (vista === "ocupado") {
    return (
      <Pantalla>
        <Lock className="pd-icon-lg block mx-auto mb-4 text-ink-3" size={24} aria-hidden="true" />
        <h1 className="heading-md mb-2">Este lugar ya está vinculado</h1>
        <p className="body-sm text-ink-3 mb-6">
          Otra cuenta ya se vinculó como {nombreJugador || `Jugador ${pos}`} en {torneo?.nombre}. Si creés que es un error,
          pedile al organizador que revise la pareja.
        </p>
        <Button variant="primary" onClick={() => navigate(`/torneos/${torneoId}`)}>
          Ver torneo
        </Button>
      </Pantalla>
    );
  }

  return (
    <Pantalla>
      <X className="pd-icon-lg block mx-auto mb-4 text-danger" size={24} aria-hidden="true" />
      <h1 className="heading-md mb-2">Error de vinculación</h1>
      <p className="body-sm text-ink-3 mb-6">
        No se pudo vincular tu cuenta. El link puede estar vencido o ser incorrecto.
      </p>
      <Button variant="primary" onClick={() => navigate("/inicio")}>
        Ir al inicio
      </Button>
    </Pantalla>
  );
}
