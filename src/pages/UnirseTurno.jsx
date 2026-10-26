import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CircleDot } from "lucide-react";
import { entrarAnonimo } from "../lib/firebase";
import { useAuthStore } from "../store/authStore";
import { getInvitacionTurno, unirseATurno } from "../services/participantesService";
import { guardarNombreAnonimo, nombreAnonimoGuardado } from "../services/pedidosService";
import { toast } from "../components/Toast";
import { confirmar } from "../components/ConfirmDialog";
import { Alert, Button, Card, Field, Input } from "../components/ui";
import { formatDiaCorto } from "../utils/formatDate";

// /t/unirse/:clubId/:token — el link de invitación al turno (WhatsApp). Muestra club, cancha, fecha · hora y quién
// invita; con sesión: "Sumarme como <nombre>"; sin sesión: nombre + "Sumarme" (sesión anónima, como el QR de la
// cancha) o "Entrar con mi cuenta de Padely". Después de sumarse → /turno/:clubId/:grupoId (la vista Mi cuenta).

export default function UnirseTurno() {
  const { clubId, token } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const perfil = useAuthStore((s) => s.perfil);
  const loading = useAuthStore((s) => s.loading);
  const rol = useAuthStore((s) => s.rol);
  const clubActual = useAuthStore((s) => s.clubActual);
  const staffDe = useAuthStore((s) => s.staffDe);
  const [inv, setInv] = useState({ valor: null, cargada: false, error: false });
  const [nombre, setNombre] = useState(nombreAnonimoGuardado);
  const [errorNombre, setErrorNombre] = useState("");
  const [sumando, setSumando] = useState(false);

  useEffect(() => {
    if (!clubId || !token || !user) return undefined;
    let vivo = true;
    getInvitacionTurno(clubId, token)
      .then((valor) => vivo && setInv({ valor, cargada: true, error: false }))
      .catch((err) => {
        console.error("Error leyendo la invitación:", err);
        if (vivo) setInv({ valor: null, cargada: true, error: true });
      });
    return () => {
      vivo = false;
    };
  }, [clubId, token, user]);

  // Sin sesión: una anónima alcanza para leer la invitación (como el QR de la cancha)
  useEffect(() => {
    if (loading || user) return;
    entrarAnonimo().catch((err) => {
      console.error("No se pudo abrir la sesión anónima:", err);
      setInv({ valor: null, cargada: true, error: true });
    });
  }, [loading, user]);

  const anonimo = user?.isAnonymous === true;
  const nombreCuenta = perfil?.nombre || user?.displayName || user?.email || "";
  const next = encodeURIComponent(`/t/unirse/${clubId}/${token}`);
  // M2: el dueño o el staff de ESTE club abriendo el link de WhatsApp: se le avisa y no se suma sin confirmar
  const esDelClub = !anonimo && ((rol === "club" && clubActual?.id === clubId) || (staffDe || []).some((s) => s.clubId === clubId));

  const sumarme = async () => {
    const n = anonimo ? nombre.trim() : nombreCuenta;
    if (anonimo && n.length < 2) {
      setErrorNombre("Decinos cómo te llamás, así los demás saben quién sos.");
      return;
    }
    setErrorNombre("");
    setSumando(true);
    try {
      if (anonimo) guardarNombreAnonimo(n);
      let r;
      try {
        r = await unirseATurno({ clubId, token, nombre: n });
      } catch (err) {
        // M2: ya hay un invitado sin cuenta con ese nombre que no pagó nada → ¿es la misma persona desde otro celular?
        const cand = err?.code === "functions/already-exists" ? err.details?.candidato : null;
        if (!cand) throw err;
        const soyYo = await confirmar({ titulo: `¿Sos ${cand.nombre}?`, mensaje: "Ya hay alguien con ese nombre en el turno que todavía no pagó nada. Si sos vos, seguís con ese lugar y lo que ya tenía asignado.", confirmText: `Sí, soy ${cand.nombre}`, cancelText: "No, soy otra persona" });
        r = await unirseATurno({ clubId, token, nombre: n, ...(soyYo ? { reclamar: cand.id } : { nuevo: true }) });
      }
      toast.success(r?.reclamado ? "Listo, seguís en el turno con tu lugar" : "Listo, estás en el turno");
      navigate(`/turno/${clubId}/${r.grupoId}`, { replace: true });
    } catch (err) {
      console.error("Error sumándose al turno:", err);
      toast.error(err?.message || "No pudimos sumarte al turno.");
      setSumando(false);
    }
  };

  if (loading || !inv.cargada) {
    return (
      <div className="max-w-2xl mx-auto flex flex-col gap-4" aria-busy="true" aria-label="Cargando">
        <div className="pd-skeleton h-8 w-48" />
        <div className="pd-skeleton h-40 rounded-lg" />
      </div>
    );
  }
  const i = inv.valor;
  if (inv.error || !i || i.activa !== true) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card className="text-center">
          <CircleDot className="pd-icon-lg mx-auto mb-3 text-ink-3" size={24} aria-hidden="true" />
          <p className="heading-sm">Este turno ya cerró o el link no es válido.</p>
          <p className="body-sm text-ink-2 mt-1">Pedile a quien te invitó un link nuevo, o acercate a la barra.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-4">
      <header>
        <p className="pd-eyebrow m-0">{i.clubNombre || "Club"}</p>
        <h1 className="heading-lg m-0 mt-1">Sumate al turno</h1>
        <p className="body-sm text-ink-2 m-0 mt-1 pd-tnum">
          {i.canchaNombre || "Cancha"} · {formatDiaCorto(i.fecha)} · {i.horaInicio}
          {i.horaFin ? `–${i.horaFin}` : ""}
        </p>
      </header>
      <Card>
        <Card.Title as="h2">Te invitó {i.titularNombre || "el titular"}</Card.Title>
        <Card.Meta className="mt-1!">Al sumarte ves lo que te toca pagar (tu parte de la cancha y lo que pidas) y podés pedir a la barra desde el celular. Se paga en el club.</Card.Meta>
        <form
          className="mt-4 flex flex-col gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            sumarme();
          }}
        >
          {anonimo ? (
            <Field label="¿Cómo te llamás?" help="Queda guardado en este celular." error={errorNombre}>
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={40} autoFocus autoComplete="given-name" />
            </Field>
          ) : esDelClub ? (
            <Alert tone="court">
              <strong>Estás con la cuenta del club.</strong> Si te sumás, entrás al turno como un jugador más, con tu parte de la cancha. Para cargar consumos o cobrar, usá{" "}
              <Link to="/admin/bar/cuentas" className="font-semibold underline">
                Cuentas
              </Link>
              .
            </Alert>
          ) : (
            <Alert>
              Entrás como <strong>{nombreCuenta}</strong>.
            </Alert>
          )}
          <div className="flex flex-col gap-2">
            <Button type="submit" variant={esDelClub ? "secondary" : "primary"} cargando={sumando ? "Sumándote…" : ""}>
              {esDelClub ? "Sumarme igual" : anonimo ? "Sumarme" : `Sumarme como ${nombreCuenta.split(" ")[0] || "yo"}`}
            </Button>
            {anonimo && (
              <Button as="link" to={`/login?next=${next}`}>
                Entrar con mi cuenta de Padely
              </Button>
            )}
          </div>
        </form>
      </Card>
      {anonimo && (
        <p className="body-sm text-ink-3 m-0">
          Con tu cuenta de Padely, la cuenta del turno te queda en <Link to={`/login?next=${next}`} className="underline">Mis reservas</Link> y te avisamos cuando se cierre.
        </p>
      )}
    </div>
  );
}
