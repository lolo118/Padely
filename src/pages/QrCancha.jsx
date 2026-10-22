import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { CircleDot, LogOut } from "lucide-react";
import { signOut } from "firebase/auth";
import { auth, entrarAnonimo } from "../lib/firebase";
import { useAuthStore } from "../store/authStore";
import { getClubConfig } from "../services/canchaService";
import { getCancha, getReservaEnJuego, guardarNombreAnonimo, nombreAnonimoGuardado } from "../services/pedidosService";
import { toast } from "../components/Toast";
import { Alert, Button, Card, Field, Input } from "../components/ui";
import PedirUI from "../components/pedidos/PedirUI";

// /c/:clubId/:canchaId?t=token — el QR pegado en la cancha. Sin cuenta: "Pedir sin cuenta" abre una sesión anónima
// de Firebase (un toque) y pide un nombre; con cuenta: directo a pedir. El pedido va al turno en juego en esa cancha.

export default function QrCancha() {
  const { clubId, canchaId } = useParams();
  const [params] = useSearchParams();
  const token = params.get("t") || "";
  const user = useAuthStore((s) => s.user);
  const perfil = useAuthStore((s) => s.perfil);
  const loading = useAuthStore((s) => s.loading);
  const [base, setBase] = useState({ club: null, cancha: null, cargado: false, error: false });
  const [reserva, setReserva] = useState({ valor: null, cargado: false });
  const [nombre, setNombre] = useState(nombreAnonimoGuardado);
  const [nombreListo, setNombreListo] = useState(() => !!nombreAnonimoGuardado());
  const [entrando, setEntrando] = useState(false);
  const [errorNombre, setErrorNombre] = useState("");

  // Club y cancha: lectura pública
  useEffect(() => {
    if (!clubId || !canchaId) return undefined;
    let vivo = true;
    Promise.all([getClubConfig(clubId), getCancha(clubId, canchaId)])
      .then(([club, cancha]) => vivo && setBase({ club, cancha, cargado: true, error: false }))
      .catch((err) => {
        console.error("Error cargando la cancha:", err);
        if (vivo) setBase({ club: null, cancha: null, cargado: true, error: true });
      });
    return () => {
      vivo = false;
    };
  }, [clubId, canchaId]);

  // El turno en juego: las reservas se leen con sesión (real o anónima)
  useEffect(() => {
    if (!clubId || !canchaId || !user) return undefined;
    let vivo = true;
    getReservaEnJuego(clubId, canchaId)
      .then((r) => vivo && setReserva({ valor: r, cargado: true }))
      .catch((err) => {
        console.error("Error buscando el turno en juego:", err);
        if (vivo) setReserva({ valor: null, cargado: true });
      });
    const t = setInterval(() => {
      getReservaEnJuego(clubId, canchaId)
        .then((r) => vivo && setReserva({ valor: r, cargado: true }))
        .catch(() => {});
    }, 60000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [clubId, canchaId, user]);

  const entrarSinCuenta = async () => {
    setEntrando(true);
    try {
      await entrarAnonimo();
    } catch (err) {
      console.error("No se pudo abrir la sesión anónima:", err);
      toast.error("No se pudo entrar sin cuenta. Probá con tu cuenta de Padely.");
    } finally {
      setEntrando(false);
    }
  };
  const confirmarNombre = () => {
    const n = nombre.trim();
    if (!n) {
      setErrorNombre("Decinos cómo te llamás, así la barra sabe a quién llevárselo.");
      return;
    }
    guardarNombreAnonimo(n);
    setNombre(n);
    setNombreListo(true);
  };
  const salir = async () => {
    await signOut(auth);
    setNombreListo(false);
    setReserva({ valor: null, cargado: false });
  };

  const { club, cancha } = base;
  const next = encodeURIComponent(`/c/${clubId}/${canchaId}${token ? `?t=${token}` : ""}`);
  const tokenOk = !!token && !!cancha && cancha.qrToken === token;

  const encabezado = (
    <header>
      <p className="pd-eyebrow m-0">{club?.nombre || "Club"}</p>
      <h1 className="heading-lg m-0 mt-1">{cancha?.nombre || "Cancha"}</h1>
    </header>
  );

  if (!base.cargado || loading) {
    return (
      <div className="max-w-2xl mx-auto flex flex-col gap-4" aria-busy="true" aria-label="Cargando">
        <div className="pd-skeleton h-8 w-48" />
        <div className="pd-skeleton h-40 rounded-lg" />
      </div>
    );
  }
  if (base.error || !club || !cancha) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card className="text-center">
          <CircleDot className="pd-icon-lg mx-auto mb-3 text-ink-3" size={24} aria-hidden="true" />
          <p className="heading-sm">Este QR no corresponde a ninguna cancha</p>
          <p className="body-sm text-ink-2 mt-1">Pedí en la barra que te den el QR actualizado.</p>
        </Card>
      </div>
    );
  }
  if (!tokenOk) {
    return (
      <div className="max-w-2xl mx-auto flex flex-col gap-4">
        {encabezado}
        <Alert tone="warning">
          <strong>Este QR venció.</strong> El club imprimió uno nuevo: pedilo en la barra, o acercate y pedí ahí mismo.
        </Alert>
      </div>
    );
  }

  // Sin sesión: elegir cómo entrar
  if (!user) {
    return (
      <div className="max-w-2xl mx-auto flex flex-col gap-4">
        {encabezado}
        <Card>
          <Card.Title as="h2">Pedí a la barra desde acá</Card.Title>
          <Card.Meta className="mt-1!">Lo que pidas te lo llevan a la cancha y va a la cuenta del turno, que se paga en el club al terminar.</Card.Meta>
          <div className="mt-4 flex flex-col gap-2">
            <Button variant="primary" onClick={entrarSinCuenta} cargando={entrando ? "Entrando…" : ""}>
              Pedir sin cuenta
            </Button>
            <Button as="link" to={`/login?next=${next}`}>
              Entrar con mi cuenta de Padely
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const anonimo = user.isAnonymous === true;
  const nombreJugador = anonimo ? nombre : perfil?.nombre || user.displayName || user.email || "";

  if (!reserva.cargado) {
    return (
      <div className="max-w-2xl mx-auto flex flex-col gap-4" aria-busy="true" aria-label="Buscando el turno">
        {encabezado}
        <div className="pd-skeleton h-24 rounded-lg" />
      </div>
    );
  }
  if (!reserva.valor) {
    return (
      <div className="max-w-2xl mx-auto flex flex-col gap-4">
        {encabezado}
        <Card className="text-center">
          <CircleDot className="pd-icon-lg mx-auto mb-3 text-ink-3" size={24} aria-hidden="true" />
          <p className="heading-sm">No hay un turno en juego en esta cancha ahora.</p>
          <p className="body-sm text-ink-2 mt-1">Si acabás de entrar, probá en unos minutos: se puede pedir desde 15 minutos antes del turno.</p>
        </Card>
        {anonimo && (
          <Button variant="ghost" size="sm" className="self-start" icon={<LogOut className="pd-icon" size={20} aria-hidden="true" />} onClick={salir}>
            Salir
          </Button>
        )}
      </div>
    );
  }
  if (anonimo && !nombreListo) {
    return (
      <div className="max-w-2xl mx-auto flex flex-col gap-4">
        {encabezado}
        <Card>
          <form
            className="flex flex-col gap-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              confirmarNombre();
            }}
          >
            <Field label="¿Cómo te llamás?" help="Para que la barra sepa a quién llevarle el pedido. Queda guardado en este celular." error={errorNombre}>
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={40} autoFocus autoComplete="given-name" />
            </Field>
            <Button type="submit" variant="primary" className="self-start">
              Continuar
            </Button>
          </form>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-4">
      <PedirUI clubId={clubId} club={club} reserva={reserva.valor} uid={user.uid} nombre={nombreJugador} origen="qr" anonimo={anonimo} qrToken={token} />
      <div className="flex flex-wrap items-center gap-3 pb-40">
        {anonimo ? (
          <>
            <span className="body-sm text-ink-3">Pedís como {nombreJugador}.</span>
            <Button variant="ghost" size="sm" onClick={() => setNombreListo(false)}>
              Cambiar nombre
            </Button>
            <Button variant="ghost" size="sm" icon={<LogOut className="pd-icon" size={20} aria-hidden="true" />} onClick={salir}>
              Salir
            </Button>
            <Link to={`/login?next=${next}`} className="body-sm text-ink-2 underline">
              Entrar con mi cuenta
            </Link>
          </>
        ) : (
          <span className="body-sm text-ink-3">Pedís como {nombreJugador}; el pedido va al turno en juego en esta cancha.</span>
        )}
      </div>
    </div>
  );
}
