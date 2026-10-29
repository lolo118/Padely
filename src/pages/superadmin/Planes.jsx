import { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Field, Input, Pills, SearchInput, Select, Textarea } from "../../components/ui";
import Dialogo from "../../components/Dialogo";
import { toast } from "../../components/Toast";
import { confirmar } from "../../components/ConfirmDialog";
import { useAuthStore } from "../../store/authStore";
import { getAvisosPago, getClubesConPlan, getDatosFacturacion, getTorneosParaCobrar, guardarDatosFacturacion, guardarPlan, marcarAvisoAtendido, marcarCobroTorneo, migrarPrivacidad } from "../../services/planesService";
import { flag } from "../../services/flagsService";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { ETIQUETA_PLAN, cambiarPlan, escalonDe, estadoPlan, precioAnual, registrarPago } from "../../utils/planes";
import { formatPrecio } from "../../utils/format";
import { formatFechaHora, formatFechaLarga } from "../../utils/formatDate";

// /superadmin/planes (P3-9): planes de los clubes. Pago recibido (+1 mes, o +12 al precio de 10) con el monto del
// escalón según las canchas activas de ese momento; cambio manual de plan; avisos "Ya pagué"; cobro de torneos y los
// datos de pago que ven los clubes en Mi plan.

const FILTROS = [
  { value: "todos", label: "Todos" },
  { value: "prueba", label: "Prueba" },
  { value: "pro", label: "PRO" },
  { value: "free", label: "FREE" },
  { value: "legacy", label: "Sin plan" },
];
const TONO = { legacy: "neutral", prueba: "warning", pro: "success", free: "neutral" };
const SEMANA = 7;
const normalizar = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const fechaInput = (ms) => (ms ? new Date(ms - 3 * 3600000).toISOString().slice(0, 10) : "");

function PlanCelda({ club }) {
  const e = estadoPlan(club);
  const tipo = e.tipo === "prueba" && !e.pro ? "free" : e.tipo;
  return (
    <div className="flex flex-col gap-1">
      <span className="pd-badge-group">
        <Badge tone={TONO[tipo]}>{ETIQUETA_PLAN[tipo] || tipo}</Badge>
        {e.enGracia && <Badge tone="warning">En gracia</Badge>}
        {e.vencido && <Badge tone="danger">Vencido</Badge>}
      </span>
      <span className="caption text-ink-3 pd-tnum">
        {e.sinEmpezar ? "Sin empezar (espera la primera reserva)" : e.vence ? `Vence ${formatFechaLarga(e.vence)} · ${e.diasRestantes >= 0 ? `${e.diasRestantes} días` : `hace ${-e.diasRestantes} días`}` : e.tipo === "free" ? "Sin vencimiento" : "—"}
      </span>
    </div>
  );
}

function CambiarPlanDialog({ club, uid, onCerrar, onGuardado }) {
  const e = estadoPlan(club);
  const [tipo, setTipo] = useState(e.tipo === "legacy" ? "pro" : e.tipo);
  const [vence, setVence] = useState(fechaInput(e.vence));
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const guardar = async () => {
    const venceMs = vence ? Date.parse(`${vence}T23:59:00-03:00`) : null;
    if (tipo !== "free" && !venceMs && !(tipo === "prueba")) {
      setError("Poné hasta cuándo.");
      return;
    }
    setGuardando(true);
    try {
      const nuevo = cambiarPlan(club.plan, { tipo, vence: tipo === "free" ? null : venceMs, por: uid, nota: nota.trim() || null });
      await guardarPlan(club.id, nuevo, club.plan);
      toast.success(`${club.nombre || "El club"}: ${ETIQUETA_PLAN[tipo]}`);
      onGuardado(nuevo);
    } catch (err) {
      console.error("Error cambiando el plan:", err);
      setError(err?.message || "No pudimos guardar el plan.");
      setGuardando(false);
    }
  };
  return (
    <Dialogo
      titulo="Cambiar plan"
      descripcion={club.nombre || "Club"}
      onCerrar={onCerrar}
      onSubmit={guardar}
      acciones={
        <>
          <Button onClick={onCerrar}>Cancelar</Button>
          <Button type="submit" variant="primary" cargando={guardando ? "Guardando…" : ""}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="mt-4 grid gap-4">
        <Field label="Plan">
          <Select value={tipo} onChange={(ev) => setTipo(ev.target.value)} data-autofocus>
            <option value="prueba">Prueba</option>
            <option value="pro">PRO</option>
            <option value="free">FREE</option>
          </Select>
        </Field>
        {tipo !== "free" && (
          <Field label="Vence" help={tipo === "prueba" ? "Vacío = la prueba empieza con la primera reserva." : "Para extender, poné la nueva fecha."}>
            <Input type="date" value={vence} onChange={(ev) => setVence(ev.target.value)} />
          </Field>
        )}
        <Field label="Nota (opcional)" error={error}>
          <Input value={nota} onChange={(ev) => setNota(ev.target.value)} maxLength={120} />
        </Field>
      </div>
    </Dialogo>
  );
}

function CobroTorneoDialog({ torneo, onCerrar, onGuardado }) {
  const [monto, setMonto] = useState(String(torneo.cobro?.monto || ""));
  const [guardando, setGuardando] = useState("");
  const [error, setError] = useState("");
  const guardar = async (estado) => {
    const n = Number(String(monto).replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) {
      setError("Poné el monto.");
      return;
    }
    setGuardando(estado);
    try {
      await marcarCobroTorneo(torneo.id, { monto: n, estado });
      toast.success(estado === "pagado" ? "Torneo cobrado" : "Cobro pendiente guardado");
      onGuardado({ monto: n, estado, en: new Date() });
    } catch (err) {
      console.error("Error guardando el cobro del torneo:", err);
      setError(err?.message || "No pudimos guardar el cobro.");
      setGuardando("");
    }
  };
  return (
    <Dialogo
      titulo="Cobrar torneo"
      descripcion={torneo.nombre || "Torneo"}
      onCerrar={onCerrar}
      onSubmit={() => guardar("pagado")}
      acciones={
        <>
          <Button onClick={onCerrar}>Cancelar</Button>
          <Button onClick={() => guardar("pendiente")} cargando={guardando === "pendiente" ? "Guardando…" : ""} disabled={!!guardando}>
            Pendiente
          </Button>
          <Button type="submit" variant="primary" cargando={guardando === "pagado" ? "Guardando…" : ""} disabled={!!guardando}>
            Marcar pagado
          </Button>
        </>
      }
    >
      <div className="mt-4">
        <Field label="Monto ($)" error={error}>
          <Input type="number" min="0" inputMode="numeric" value={monto} onChange={(ev) => setMonto(ev.target.value)} data-autofocus className="pd-tnum" />
        </Field>
      </div>
    </Dialogo>
  );
}

function DatosPagoCard() {
  const [datos, setDatos] = useState(null);
  const [guardando, setGuardando] = useState(false);
  useEffect(() => {
    getDatosFacturacion()
      .then((d) => setDatos({ alias: "", cbu: "", titular: "", nota: "", ...d, comisionTorneosPct: d.comisionTorneosPct !== undefined ? String(d.comisionTorneosPct) : "0" }))
      .catch(() => setDatos({ alias: "", cbu: "", titular: "", nota: "", comisionTorneosPct: "0" }));
  }, []);
  if (!datos) return <div className="pd-skeleton h-40 rounded-lg" aria-busy="true" aria-label="Cargando" />;
  const campo = (k) => ({ value: datos[k] || "", onChange: (e) => setDatos((d) => ({ ...d, [k]: e.target.value })) });
  const guardar = async (e) => {
    e.preventDefault();
    setGuardando(true);
    try {
      const pct = Math.min(10, Math.max(0, Number(String(datos.comisionTorneosPct).replace(",", ".")) || 0));
      await guardarDatosFacturacion({ alias: datos.alias.trim(), cbu: datos.cbu.trim(), titular: datos.titular.trim(), nota: datos.nota.trim(), comisionTorneosPct: pct });
      toast.success("Datos de pago guardados");
    } catch (err) {
      console.error("Error guardando los datos de pago:", err);
      toast.error("No pudimos guardar los datos de pago.");
    } finally {
      setGuardando(false);
    }
  };
  return (
    <Card as="form" onSubmit={guardar} noValidate>
      <Card.Title as="h2">Datos de pago de Padely</Card.Title>
      <Card.Meta className="mt-1!">Los ven los clubes en Mi plan.</Card.Meta>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Alias">
          <Input {...campo("alias")} maxLength={40} />
        </Field>
        <Field label="CBU / CVU">
          <Input {...campo("cbu")} maxLength={30} inputMode="numeric" className="pd-tnum" />
        </Field>
        <Field label="Titular">
          <Input {...campo("titular")} maxLength={80} />
        </Field>
        <Field label="Nota para los clubes (opcional)">
          <Textarea {...campo("nota")} maxLength={300} rows={2} />
        </Field>
        <Field label="Comisión sobre inscripciones online (%)" help="P3-14: se descuenta de cada inscripción pagada por Mercado Pago (0 a 10).">
          <Input {...campo("comisionTorneosPct")} type="number" min="0" max="10" step="0.5" inputMode="decimal" className="pd-tnum" />
        </Field>
      </div>
      <div className="mt-4">
        <Button type="submit" variant="primary" cargando={guardando ? "Guardando…" : ""}>
          Guardar datos
        </Button>
      </div>
    </Card>
  );
}

// P3-14 C: funciones que se prenden desde acá cuando el backend ya está desplegado (configuracionPadely/flags)
const FLAGS_PLATAFORMA = [
  { id: "inscripcionesOnline", label: "Inscripciones online (organizadores con Mercado Pago)", ayuda: "Prender después del deploy de las Functions de P3-14." },
  { id: "partidosAbiertos", label: "Partidos abiertos (los jugadores buscan compañeros)", ayuda: "Prender después del deploy de las Functions de P3-15." },
  { id: "membresias", label: "Pases (membresías de cada club)", ayuda: "Prender después del deploy de P3-16 (reglas, índices y Functions)." },
];
function FlagsCard() {
  const [valores, setValores] = useState(() => Object.fromEntries(FLAGS_PLATAFORMA.map((f) => [f.id, flag(f.id)])));
  const [guardando, setGuardando] = useState("");
  const cambiar = async (id, valor) => {
    setGuardando(id);
    try {
      await setDoc(doc(db, "configuracionPadely", "flags"), { [id]: valor }, { merge: true });
      setValores((v) => ({ ...v, [id]: valor }));
      toast.success(valor ? "Función habilitada" : "Función oculta");
    } catch (err) {
      console.error("Error guardando el flag:", err);
      toast.error("No pudimos guardar el cambio.");
    } finally {
      setGuardando("");
    }
  };
  return (
    <Card>
      <Card.Title as="h2">Funciones de la plataforma</Card.Title>
      {FLAGS_PLATAFORMA.map((f) => (
        <label key={f.id} className="mt-3 flex items-start gap-3 body-sm">
          <input type="checkbox" checked={!!valores[f.id]} onChange={(e) => cambiar(f.id, e.target.checked)} disabled={guardando === f.id} className="h-5 w-5 mt-0.5 accent-ink" />
          <span>
            {f.label}
            <span className="block text-ink-3">{f.ayuda}</span>
          </span>
        </label>
      ))}
    </Card>
  );
}

// P3-14: migración única de privacidad (después del deploy de 16-p3-14). Idempotente: se puede repetir.
function MigracionPrivacidadCard() {
  const [estado, setEstado] = useState({ corriendo: false, resultado: null });
  const hecha = flag("privacidadMigrada") || !!estado.resultado;
  const correr = async () => {
    const ok = await confirmar({
      titulo: "Migrar privacidad",
      mensaje: "Da un id aleatorio a los tickets digitales viejos y mueve el historial de planes y los datos de la cuenta de Mercado Pago a documentos privados. Se puede repetir sin problema.",
      confirmText: "Migrar",
    });
    if (!ok) return;
    setEstado({ corriendo: true, resultado: null });
    try {
      const r = await migrarPrivacidad();
      setEstado({ corriendo: false, resultado: r });
      toast.success(`Listo: ${r.tickets} tickets, ${r.planes} planes, ${r.cuentasMp} cuentas de MP`);
    } catch (err) {
      console.error("Error migrando la privacidad:", err);
      setEstado({ corriendo: false, resultado: null });
      toast.error("No pudimos migrar. ¿Ya se desplegaron las Functions de P3-14?");
    }
  };
  return (
    <Card>
      <Card.Title as="h2">Privacidad de tickets y planes</Card.Title>
      <Card.Meta className="mt-1!">{hecha ? "Ya migrada: los tickets nuevos usan un id aleatorio y el historial de planes es privado." : "Pendiente: correr una vez, después del deploy de P3-14."}</Card.Meta>
      <div className="mt-4">
        <Button onClick={correr} cargando={estado.corriendo ? "Migrando…" : ""}>
          {hecha ? "Volver a migrar" : "Migrar privacidad"}
        </Button>
      </div>
    </Card>
  );
}

export default function Planes() {
  const user = useAuthStore((s) => s.user);
  const [clubes, setClubes] = useState(null);
  const [avisos, setAvisos] = useState([]);
  const [torneos, setTorneos] = useState([]);
  const [error, setError] = useState(false);
  const [filtro, setFiltro] = useState("todos");
  const [busqueda, setBusqueda] = useState("");
  const [dialogo, setDialogo] = useState(null); // { modo: "plan" | "torneo", club | torneo }
  const [ocupado, setOcupado] = useState("");

  useEffect(() => {
    let vivo = true;
    Promise.all([getClubesConPlan(), getAvisosPago().catch(() => []), getTorneosParaCobrar().catch(() => [])])
      .then(([c, a, t]) => {
        if (!vivo) return;
        setClubes(c);
        setAvisos(a);
        setTorneos(t);
      })
      .catch((err) => {
        console.error("Error cargando los planes:", err);
        if (vivo) setError(true);
      });
    return () => {
      vivo = false;
    };
  }, []);

  const [ahora] = useState(() => Date.now());
  const lista = useMemo(() => {
    const q = normalizar(busqueda.trim());
    return (clubes || [])
      .map((c) => ({ ...c, _e: estadoPlan(c, ahora) }))
      .filter((c) => {
        const tipo = c._e.tipo === "prueba" && !c._e.pro ? "free" : c._e.tipo;
        return (filtro === "todos" || tipo === filtro) && (!q || normalizar(c.nombre).includes(q));
      })
      .sort((a, b) => (a._e.vence ?? Infinity) - (b._e.vence ?? Infinity));
  }, [clubes, filtro, busqueda, ahora]);
  const vencenPronto = (clubes || []).filter((c) => {
    const e = estadoPlan(c, ahora);
    return (e.tipo === "prueba" || e.tipo === "pro") && e.vence && (e.enGracia || e.vencido || e.diasRestantes <= SEMANA);
  });
  const avisosNuevos = avisos.filter((a) => a.estado === "nuevo");

  const actualizarClub = (id, plan) => setClubes((prev) => prev.map((c) => (c.id === id ? { ...c, plan } : c)));
  const marcarPago = async (club, anual) => {
    const escalon = escalonDe(club.canchasActivas);
    const monto = anual ? precioAnual(escalon) : escalon.precio;
    const ok = await confirmar({
      titulo: anual ? "Pago anual recibido" : "Pago recibido",
      mensaje: `${club.nombre || "El club"} · ${escalon.nombre} (${club.canchasActivas} canchas activas) · ${formatPrecio(monto)}. Pasa a PRO por ${anual ? "12 meses" : "1 mes"} desde su vencimiento (o desde hoy si ya venció).`,
      confirmText: "Registrar pago",
    });
    if (!ok) return;
    setOcupado(`${club.id}-${anual ? "a" : "m"}`);
    try {
      const nuevo = registrarPago(club.plan, { escalon, anual, por: user.uid });
      await guardarPlan(club.id, nuevo, club.plan);
      actualizarClub(club.id, nuevo);
      toast.success(`${club.nombre || "El club"}: PRO hasta el ${formatFechaLarga(nuevo.vence)}`);
    } catch (err) {
      console.error("Error registrando el pago:", err);
      toast.error(err?.message || "No pudimos registrar el pago.");
    } finally {
      setOcupado("");
    }
  };
  const atenderAviso = async (aviso) => {
    try {
      await marcarAvisoAtendido(aviso.id, user.uid);
      setAvisos((prev) => prev.map((a) => (a.id === aviso.id ? { ...a, estado: "atendido" } : a)));
    } catch (err) {
      console.error("Error marcando el aviso:", err);
      toast.error("No pudimos marcar el aviso.");
    }
  };

  if (error) return <Alert tone="danger">No pudimos cargar los planes. Recargá la página.</Alert>;
  if (!clubes) return <div className="pd-skeleton h-64 rounded-lg" aria-busy="true" aria-label="Cargando" />;

  const filaClub = (c) => {
    const escalon = escalonDe(c.canchasActivas);
    return (
      <li key={c.id} className="py-3 border-b border-line last:border-b-0 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="font-semibold m-0 truncate">{c.nombre || "Sin nombre"}</p>
          <p className="caption text-ink-3 m-0 pd-tnum">
            {c.canchasActivas} canchas activas · {escalon.nombre} {formatPrecio(escalon.precio)}/mes
          </p>
        </div>
        <PlanCelda club={c} />
        <div className="pd-btn-group">
          <Button size="sm" onClick={() => marcarPago(c, false)} cargando={ocupado === `${c.id}-m` ? "Guardando…" : ""}>
            Pago recibido
          </Button>
          <Button size="sm" variant="ghost" onClick={() => marcarPago(c, true)} cargando={ocupado === `${c.id}-a` ? "Guardando…" : ""}>
            Pago anual
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDialogo({ modo: "plan", club: c })}>
            Cambiar plan
          </Button>
        </div>
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="heading-lg m-0">Planes</h1>
        <p className="body-sm text-ink-2 m-0 mt-1">Prueba de 30 días, FREE con 2,5 % por pago online y PRO por escalón de canchas. Los clubes sin plan son de antes: PRO sin vencimiento.</p>
      </header>

      {avisosNuevos.length > 0 && (
        <Card>
          <Card.Title as="h2">Avisos de pago</Card.Title>
          <ul className="mt-2">
            {avisosNuevos.map((a) => (
              <li key={a.id} className="py-2 border-b border-line last:border-b-0 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="m-0 font-semibold">
                    {a.clubNombre || a.clubId} {a.monto ? <span className="pd-tnum">· {formatPrecio(a.monto)}</span> : null}
                  </p>
                  <p className="caption text-ink-3 m-0">
                    {a.creadoPorNombre || "El dueño"} · {formatFechaHora(a.creadoEn)}
                    {a.nota ? ` · ${a.nota}` : ""}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => atenderAviso(a)}>
                  Marcar atendido
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {vencenPronto.length > 0 && (
        <Card>
          <Card.Title as="h2">Vencen esta semana</Card.Title>
          <ul className="mt-2">{vencenPronto.map((c) => filaClub(c))}</ul>
        </Card>
      )}

      <Card>
        <Card.Row>
          <Card.Title as="h2">Clubes</Card.Title>
          <span className="caption text-ink-3 pd-tnum">{lista.length}</span>
        </Card.Row>
        <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center">
          <Pills items={FILTROS} value={filtro} onChange={setFiltro} ariaLabel="Filtrar por plan" />
          <SearchInput value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar club" wrapperClassName="md:max-w-xs" />
        </div>
        {lista.length ? <ul className="mt-2">{lista.map((c) => filaClub(c))}</ul> : <p className="body-sm text-ink-2 mt-3">No hay clubes con ese filtro.</p>}
      </Card>

      <Card>
        <Card.Title as="h2">Torneos</Card.Title>
        <Card.Meta className="mt-1!">Se cobran por torneo. El monto lo ponés acá.</Card.Meta>
        {torneos.length ? (
          <ul className="mt-2">
            {torneos.map((t) => (
              <li key={t.id} className="py-2 border-b border-line last:border-b-0 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="m-0 font-semibold truncate">{t.nombre || "Torneo"}</p>
                  <p className="caption text-ink-3 m-0">{t.club?.nombre ? `Sede: ${t.club.nombre}` : "Sin sede"}</p>
                </div>
                <span className="pd-badge-group">
                  {t.cobro ? <Badge tone={t.cobro.estado === "pagado" ? "success" : "warning"}>{`${t.cobro.estado === "pagado" ? "Pagado" : "Pendiente"} · ${formatPrecio(t.cobro.monto)}`}</Badge> : <Badge>Sin cobrar</Badge>}
                </span>
                <Button size="sm" variant="ghost" onClick={() => setDialogo({ modo: "torneo", torneo: t })}>
                  Cobrar torneo
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="body-sm text-ink-2 mt-3">Todavía no hay torneos.</p>
        )}
      </Card>

      <DatosPagoCard />

      <MigracionPrivacidadCard />

      <FlagsCard />

      {dialogo?.modo === "plan" && (
        <CambiarPlanDialog
          club={dialogo.club}
          uid={user.uid}
          onCerrar={() => setDialogo(null)}
          onGuardado={(plan) => {
            actualizarClub(dialogo.club.id, plan);
            setDialogo(null);
          }}
        />
      )}
      {dialogo?.modo === "torneo" && (
        <CobroTorneoDialog
          torneo={dialogo.torneo}
          onCerrar={() => setDialogo(null)}
          onGuardado={(cobro) => {
            setTorneos((prev) => prev.map((t) => (t.id === dialogo.torneo.id ? { ...t, cobro } : t)));
            setDialogo(null);
          }}
        />
      )}
    </div>
  );
}
