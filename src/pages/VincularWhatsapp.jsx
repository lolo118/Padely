import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CalendarCheck, MessageCircle, X } from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { vincularReservasWhatsapp } from "../services/whatsappService";
import { Button } from "../components/ui";

// /whatsapp/vincular?c=<club>&h=<chat>&v=<vence>&s=<firma>: el link que manda el bot de WhatsApp al confirmar una
// reserva. Con la cuenta abierta, suma a la cuenta las reservas próximas que ese teléfono hizo por WhatsApp en ese club
// (y las que haga después). La firma la valida la Function waVincularReservas.
const REDIRECT_KEY = "padely-vincular-redirect";

function Pantalla({ children }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-surface">
      <div className="pd-card text-center max-w-md w-full">{children}</div>
    </div>
  );
}

export default function VincularWhatsapp() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading } = useAuthStore();
  // null | "vinculando" | { ok, reservas, clubNombre } | { error }
  const [estado, setEstado] = useState(null);
  const datos = { c: params.get("c") || "", h: params.get("h") || "", v: params.get("v") || "", s: params.get("s") || "" };
  const completo = datos.c && datos.h && datos.v && datos.s;

  const irA = (ruta) => {
    try {
      localStorage.setItem(REDIRECT_KEY, `${window.location.pathname}${window.location.search}`);
    } catch {
      // sin almacenamiento: después de entrar, el link se vuelve a abrir desde WhatsApp
    }
    navigate(ruta);
  };

  const vincular = async () => {
    setEstado("vinculando");
    try {
      setEstado({ ok: true, ...(await vincularReservasWhatsapp(datos)) });
    } catch (err) {
      console.error("Error sumando las reservas de WhatsApp:", err);
      setEstado({ error: err?.message || "No pudimos sumar las reservas. Probá de nuevo." });
    }
  };

  if (!completo) {
    return (
      <Pantalla>
        <X className="pd-icon-lg block mx-auto mb-4 text-ink-3" size={24} aria-hidden="true" />
        <h1 className="heading-md mb-2">Link incompleto</h1>
        <p className="body-md text-ink-2 mb-5">Abrí el link tal cual te llegó por WhatsApp.</p>
        <Button as="link" to="/" variant="primary">
          Ir a Padely
        </Button>
      </Pantalla>
    );
  }

  if (loading) {
    return (
      <Pantalla>
        <div className="pd-skeleton h-7 w-2/3 mx-auto" aria-busy="true" />
      </Pantalla>
    );
  }

  if (!user || user.isAnonymous) {
    return (
      <Pantalla>
        <MessageCircle className="pd-icon-lg block mx-auto mb-4 text-ink-3" size={24} aria-hidden="true" />
        <h1 className="heading-md mb-2">Sumá tus reservas a Padely</h1>
        <p className="body-md text-ink-2 mb-5">Entrá o creá tu cuenta y las reservas que hiciste por WhatsApp van a aparecer en Mis reservas.</p>
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => irA("/login")}>
            Entrar
          </Button>
          <Button variant="primary" className="flex-1" onClick={() => irA("/register")}>
            Crear cuenta
          </Button>
        </div>
      </Pantalla>
    );
  }

  if (estado && estado.ok) {
    return (
      <Pantalla>
        <CalendarCheck className="pd-icon-lg block mx-auto mb-4 text-ink-3" size={24} aria-hidden="true" />
        <h1 className="heading-md mb-2">¡Listo!</h1>
        <p className="body-md text-ink-2 mb-5">
          {estado.reservas > 0
            ? `Sumamos ${estado.reservas === 1 ? "1 reserva" : `${estado.reservas} reservas`}${estado.clubNombre ? ` de ${estado.clubNombre}` : ""} a tu cuenta.`
            : "No hay reservas próximas para sumar, pero las próximas que hagas por WhatsApp en este club van a aparecer en tu cuenta."}
        </p>
        <Button as="link" to="/mis-reservas" variant="primary">
          Ver mis reservas
        </Button>
      </Pantalla>
    );
  }

  return (
    <Pantalla>
      <MessageCircle className="pd-icon-lg block mx-auto mb-4 text-ink-3" size={24} aria-hidden="true" />
      <h1 className="heading-md mb-2">Sumar reservas de WhatsApp</h1>
      <p className="body-md text-ink-2 mb-5">Las reservas que hiciste por WhatsApp en este club van a quedar en tu cuenta de Padely, y también las próximas.</p>
      {estado?.error && (
        <p className="pd-error block mb-4" role="alert">
          {estado.error}
        </p>
      )}
      <div className="flex gap-2">
        <Button as="link" to="/inicio" className="flex-1">
          Ahora no
        </Button>
        <Button variant="primary" className="flex-1" onClick={vincular} cargando={estado === "vinculando" ? "Sumando…" : ""}>
          Sumar a mi cuenta
        </Button>
      </div>
      <p className="body-sm text-ink-3 mt-4">
        ¿No sos vos? <Link to="/login" className="underline">Entrá con otra cuenta</Link>
      </p>
    </Pantalla>
  );
}
