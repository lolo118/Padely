import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { signOut } from "firebase/auth";
import { Users } from "lucide-react";
import { auth } from "../lib/firebase";
import { useAuthStore } from "../store/authStore";
import { getClubConfig } from "../services/canchaService";
import { aceptarInvitacion, estadoDeInvitacion, getInvitacion } from "../services/staffService";
import { ROLES, rolLabel } from "../utils/staff";
import { toast } from "../components/Toast";
import { Alert, Button, Card } from "../components/ui";

// Página de /equipo/invitacion/:clubId/:invId: la persona invitada al equipo de un club acepta la invitación.
// Misma estructura que AceptarInvitacion (torneos): una tarjeta sola, login obligatorio con vuelta por
// `padely-vincular-redirect`, y un estado por cada situación de la invitación.

const REDIRECT_KEY = "padely-vincular-redirect";

// Iniciales del club para el avatar cuando no tiene logo: "Club Norte" → "CN"
const iniciales = (nombre) =>
  String(nombre || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("");

// Logo del club o sus iniciales (pd-avatar). El nombre va al lado, así que el avatar es decorativo.
function AvatarClub({ club }) {
  const letras = iniciales(club?.nombre);
  return (
    <span className="pd-avatar pd-avatar-lg" aria-hidden="true">
      {club?.logoUrl ? <img src={club.logoUrl} alt="" /> : letras || <Users className="pd-icon-lg" size={24} />}
    </span>
  );
}

function Frame({ children, ...rest }) {
  return (
    <div className="min-h-screen bg-surface px-4 py-8">
      <Card as="section" className="max-w-md mx-auto" {...rest}>
        {children}
      </Card>
    </div>
  );
}

export default function AceptarInvitacionStaff() {
  const { clubId, invId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, perfil, loading: authLoading, recargarStaff } = useAuthStore();
  const uid = user?.uid;

  const [club, setClub] = useState(null);
  const [inv, setInv] = useState(null);
  // "cargando" | "error" | "sin_acceso" (las reglas no dejan leerla: no es para este email) | lo que diga estadoDeInvitacion
  const [estado, setEstado] = useState("cargando");
  const [reintento, setReintento] = useState(0);
  const [aceptando, setAceptando] = useState(false);
  const [cerrando, setCerrando] = useState(false);

  // Con sesión: el club (lectura pública) y la invitación (solo la lee el invitado o quien gestiona el equipo).
  // El club que falte no bloquea la página; la invitación denegada por las reglas es "para otra cuenta".
  useEffect(() => {
    if (authLoading || !uid) return;
    let cancelado = false;
    const cargar = async () => {
      const [clubData, resultado] = await Promise.all([
        getClubConfig(clubId).catch((err) => {
          console.error("Error al cargar el club de la invitación:", err);
          return null;
        }),
        getInvitacion(clubId, invId)
          .then((data) => ({ data }))
          .catch((err) => ({ err })),
      ]);
      if (cancelado) return;
      setClub(clubData);
      if (resultado.err) {
        if (resultado.err.code === "permission-denied") {
          setEstado("sin_acceso");
        } else {
          console.error("Error al cargar la invitación de staff:", resultado.err);
          setEstado("error");
        }
        return;
      }
      setInv(resultado.data);
      setEstado(estadoDeInvitacion(resultado.data));
    };
    cargar();
    return () => {
      cancelado = true;
    };
  }, [clubId, invId, uid, authLoading, reintento]);

  // Aceptar requiere estar logueado: guardamos a dónde volver y vamos al login (Login y Register honran la clave)
  if (!authLoading && !user) {
    localStorage.setItem(REDIRECT_KEY, location.pathname);
    return <Navigate to="/login" replace />;
  }

  const reintentar = () => {
    setEstado("cargando");
    setReintento((n) => n + 1);
  };

  const aceptar = async () => {
    if (!user || !inv) return;
    setAceptando(true);
    try {
      await aceptarInvitacion(clubId, inv, { uid: user.uid, nombre: perfil?.nombre || inv.nombre, email: user.email });
      await recargarStaff();
      toast.success(club?.nombre ? `Ya sos parte del equipo de ${club.nombre}` : "Ya sos parte del equipo del club");
      navigate("/admin");
    } catch (err) {
      console.error("Error al aceptar la invitación de staff:", err);
      toast.error("No pudimos aceptar la invitación. Intentá de nuevo.");
      setAceptando(false);
    }
  };

  // Salir para entrar con la cuenta invitada; después del login se retoma este mismo enlace
  const cerrarSesion = async () => {
    setCerrando(true);
    try {
      localStorage.setItem(REDIRECT_KEY, location.pathname);
      await signOut(auth);
      window.location.href = "/login";
    } catch (err) {
      console.error("Error al cerrar sesión:", err);
      toast.error("No pudimos cerrar la sesión. Intentá de nuevo.");
      setCerrando(false);
    }
  };

  if (authLoading || estado === "cargando") {
    return (
      <Frame aria-busy="true">
        <span className="sr-only">Cargando invitación…</span>
        <div className="flex items-center gap-4 mb-5">
          <div className="pd-skeleton h-20 w-20 flex-none rounded-pill" />
          <div className="flex-1 flex flex-col gap-2">
            <div className="pd-skeleton h-3 w-1/3" />
            <div className="pd-skeleton h-6 w-2/3" />
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <div className="pd-skeleton h-6 w-1/2" />
          <div className="pd-skeleton h-4" />
          <div className="pd-skeleton h-11" />
        </div>
      </Frame>
    );
  }

  const emailUsuario = String(user.email || "").toLowerCase();
  const esDueno = !!club && club.ownerUid === user.uid;
  const paraOtroEmail = !!inv && String(inv.email || "").toLowerCase() !== emailUsuario;
  const descripcionRol = inv ? ROLES[inv.rol]?.descripcion : "";

  const botonSalir = (
    <Button block onClick={cerrarSesion} cargando={cerrando ? "Cerrando sesión…" : ""}>
      Cerrar sesión
    </Button>
  );
  const linkPanel = (
    <Button as="link" to="/admin" variant="primary" block>
      Ir al panel del club
    </Button>
  );
  const linkInicio = (
    <Button as="link" to="/" block>
      Ir al inicio
    </Button>
  );

  // El cuerpo de la tarjeta según la situación, en orden: no cargó, no existe, no es para esta cuenta, ya es el
  // dueño, cancelada/vencida/aceptada, pendiente.
  const cuerpo = () => {
    if (estado === "error") {
      return (
        <>
          <Alert tone="danger">No pudimos cargar la invitación. Intentá de nuevo.</Alert>
          <Button block onClick={reintentar}>
            Reintentar
          </Button>
        </>
      );
    }
    if (estado === "no_existe") {
      return (
        <>
          <p className="body-md text-ink">Esta invitación no existe o el enlace está mal.</p>
          {linkInicio}
        </>
      );
    }
    if (estado === "sin_acceso") {
      return (
        <>
          <p className="body-md text-ink">
            Esta invitación es para otra cuenta. Cerrá sesión e ingresá con el email al que llegó la invitación.
          </p>
          <p className="body-sm text-ink-2">Si ya estás con esa cuenta, el enlace puede estar mal.</p>
          {botonSalir}
        </>
      );
    }
    if (esDueno) {
      return (
        <>
          <p className="body-md text-ink">Ya sos el dueño de este club.</p>
          {linkPanel}
        </>
      );
    }
    if (paraOtroEmail) {
      return (
        <>
          <p className="body-md text-ink">
            Esta invitación es para <strong className="font-semibold">{inv.email}</strong>. Cerrá sesión e ingresá con
            esa cuenta.
          </p>
          {botonSalir}
        </>
      );
    }
    if (estado === "cancelada") {
      return (
        <>
          <p className="body-md text-ink">El club canceló esta invitación.</p>
          {linkInicio}
        </>
      );
    }
    if (estado === "vencida") {
      return (
        <>
          <p className="body-md text-ink">Esta invitación venció. Pedile al club una nueva.</p>
          {linkInicio}
        </>
      );
    }
    if (estado === "aceptada") {
      return (
        <>
          <Alert tone="success">Ya aceptaste esta invitación.</Alert>
          {linkPanel}
        </>
      );
    }
    return (
      <>
        <div>
          <h2 className="heading-md">Te invitan como {rolLabel(inv.rol)}</h2>
          {descripcionRol && <p className="body-sm text-ink-2 mt-1">{descripcionRol}</p>}
        </div>
        <Button variant="primary" block onClick={aceptar} cargando={aceptando ? "Aceptando…" : ""}>
          Aceptar invitación
        </Button>
        <p className="body-sm text-ink-3">Ingresaste como {user.email}.</p>
      </>
    );
  };

  return (
    <Frame>
      <div className="flex items-center gap-4 mb-5">
        <AvatarClub club={club} />
        <div className="min-w-0">
          <p className="pd-eyebrow mb-1!">Invitación al equipo</p>
          <h1 className="heading-md">{club?.nombre || "Club"}</h1>
        </div>
      </div>
      <div className="flex flex-col gap-4">{cuerpo()}</div>
    </Frame>
  );
}
