import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { CircleDot, LogOut } from "lucide-react";
import { signOut } from "firebase/auth";
import { auth, entrarAnonimo } from "../lib/firebase";
import { useAuthStore } from "../store/authStore";
import { getClubConfig } from "../services/canchaService";
import { getCancha, getReservasEnJuego, guardarNombreAnonimo, nombreAnonimoGuardado } from "../services/pedidosService";
import { textoTurno } from "../utils/cuentas";
import { tienePro } from "../utils/planes";
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
  const rol = useAuthStore((s) => s.rol);
  const clubActual = useAuthStore((s) => s.clubActual);
  const staffDe = useAuthStore((s) => s.staffDe);
  const [base, setBase] = useState({ club: null, cancha: null, cargado: false, error: false });
  const [reserva, setReserva] = useState({ valor: null, candidatas: [], cargado: false });
  const [elegidaId, setElegidaId] = useState(null); // "¿No es tu turno?": el grupoId elegido a mano
  const [eligiendo, setEligiendo] = useState(false);
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
    const cargar = () =>
      getReservasEnJuego(clubId, canchaId)
        .then((lista) => vivo && setReserva({ valor: lista[0] || null, candidatas: lista, cargado: true }))
        .catch((err) => {
          console.error("Error buscando el turno en juego:", err);
          if (vivo) setReserva({ valor: null, candidatas: [], cargado: true });
        });
    cargar();
    const t = setInterval(cargar, 60000);
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
  // P3-9: los pedidos desde la cancha son del plan PRO; un club en FREE (con QR impresos durante la prueba) no los toma
  if (!tienePro(club)) {
    return (
      <div className="max-w-2xl mx-auto flex flex-col gap-4">
        {encabezado}
        <Alert>
          <strong>Este club no toma pedidos desde la cancha por ahora.</strong> Pedí directamente en la barra.
        </Alert>
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
  // El dueño o el staff de ESTE club escaneando el QR: puede pedir igual, pero se le avisa que no es la pantalla del bar
  const esDelClub = !anonimo && ((rol === "club" && clubActual?.id === clubId) || (staffDe || []).some((s) => s.clubId === clubId));
  const avisoStaff = esDelClub ? (
    <Alert tone="court">
      <strong>Estás con la cuenta del club.</strong> Lo que pidas se carga al turno como cualquier jugador.{" "}
      <Link to="/admin/bar/barra" className="font-semibold underline">
        Ir a Barra
      </Link>
    </Alert>
  ) : null;

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
        {avisoStaff}
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
  const reservaElegida = reserva.candidatas.find((c) => (c.grupoId || c.id) === elegidaId) || reserva.valor;
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
      {avisoStaff}
      <Card as="div" className="flex flex-wrap items-center justify-between gap-2 py-3!">
        <p className="body-sm m-0">
          <span className="text-ink-2">Pedís para: </span>
          <strong>{textoTurno({ canchaNombre: reservaElegida.canchaName, horaInicio: reservaElegida.horaInicio, horaFin: reservaElegida.horaFin, nombreJugador: reservaElegida.nombreJugador })}</strong>
        </p>
        {reserva.candidatas.length > 1 && (
          <Button variant="ghost" size="sm" onClick={() => setEligiendo((v) => !v)}>
            {eligiendo ? "Listo" : "¿No es tu turno? Elegir otro"}
          </Button>
        )}
        {eligiendo && (
          <div className="w-full flex flex-wrap gap-2">
            {reserva.candidatas.map((c) => {
              const id = c.grupoId || c.id;
              const activa = id === (reservaElegida.grupoId || reservaElegida.id);
              return (
                <button key={id} type="button" className="pd-pill" aria-pressed={activa} onClick={() => { setElegidaId(id); setEligiendo(false); }}>
                  {c.horaInicio}
                  {c.horaFin ? `–${c.horaFin}` : ""} · {c.nombreJugador || "sin nombre"}
                </button>
              );
            })}
          </div>
        )}
      </Card>
      <PedirUI key={reservaElegida.grupoId || reservaElegida.id} clubId={clubId} club={club} reserva={reservaElegida} uid={user.uid} nombre={nombreJugador} origen="qr" anonimo={anonimo} qrToken={token} />
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
