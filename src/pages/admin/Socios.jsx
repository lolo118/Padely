import { useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { agregarSocioManual, cupoOcupado, darDeBaja, getPlanesSocio, getSocios, guardarPlanSocio, rechazarPedido, registrarPago } from "../../services/membresiasService";
import { DIAS_SEMANA, ESTADOS_SOCIO, MAX_EXTRAS, PERIODOS, estadoSocio, etiquetaPeriodo, normalizarPlan, textosBeneficios } from "../../utils/membresias";
import { MEDIOS_VENTA, ETIQUETA_MEDIO_VENTA } from "../../utils/ventas";
import { formatPrecio } from "../../utils/format";
import { formatFechaLarga } from "../../utils/formatDate";
import Dialogo from "../../components/Dialogo";
import SinPermiso from "../../components/SinPermiso";
import { confirmar } from "../../components/ConfirmDialog";
import { toast } from "../../components/Toast";
import { Alert, Badge, Button, Card, Field, Input, Pills, SearchInput, Select, Tabs, Textarea } from "../../components/ui";

// /admin/socios (P3-16): los socios del club (pedidos, activos, vencidos) y sus planes. El club arma cada plan con
// beneficios que aplica Padely (descuento en la cancha y el bar, sin seña, reservar antes) y extras de texto libre
// que cumple en persona (estacionamiento, lugar en exhibiciones…). El cobro es a mano: "Aprobar y cobrar" /
// "Registrar pago" suman el período desde hoy o desde el vencimiento si sigue vigente.

const TONO = { pendiente: "warning", activa: "success", vencida: "danger", cancelada: "neutral", rechazada: "neutral" };
const SUGERENCIAS_EXTRAS = ["Estacionamiento para socios", "Lugar reservado en exhibiciones", "Toalla y agua en cada turno", "Descuento en clases", "Prioridad en los torneos del club"];
const HORAS = Array.from({ length: 18 }, (_, i) => `${String(i + 7).padStart(2, "0")}:00`);

export default function Socios() {
  const club = useAuthStore((s) => s.clubActual);
  const puede = useAuthStore((s) => s.puede);
  const [tab, setTab] = useState("socios");
  const [planes, setPlanes] = useState(null);
  const [socios, setSocios] = useState(null);
  const [error, setError] = useState(false);

  const [version, setVersion] = useState(0);
  const recargar = () => setVersion((v) => v + 1);
  const clubId = club?.id;
  useEffect(() => {
    if (!clubId) return undefined;
    let vivo = true;
    Promise.all([getPlanesSocio(clubId), getSocios(clubId)])
      .then(([p, s]) => {
        if (!vivo) return;
        setPlanes(p);
        setSocios(s);
        setError(false);
      })
      .catch((err) => {
        console.error("Error cargando socios:", err);
        if (!vivo) return;
        setError(true);
        setPlanes((x) => x || []);
        setSocios((x) => x || []);
      });
    return () => {
      vivo = false;
    };
  }, [clubId, version]);

  if (!club) return <div className="pd-skeleton h-40 rounded-lg" aria-busy="true" aria-label="Cargando" />;
  if (!puede("gestionarReservas") && !puede("configurarClub")) return <SinPermiso />;
  const pendientes = (socios || []).filter((s) => s.estado === "pendiente").length;

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="heading-xl m-0">Socios</h1>
        <p className="body-sm text-ink-2 mt-1 mb-0">Tus planes de socio, los pedidos y quién está al día.</p>
      </header>
      {error && <Alert tone="warning">No pudimos leer los socios. Si la función es nueva, puede faltar la actualización de Padely: probá de nuevo en un rato.</Alert>}
      <Tabs
        items={[
          { value: "socios", label: "Socios", count: pendientes || undefined },
          { value: "planes", label: "Planes", count: planes?.length || undefined },
        ]}
        value={tab}
        onChange={setTab}
        ariaLabel="Secciones de socios"
      />
      {tab === "socios" ? (
        <ListaSocios club={club} socios={socios} planes={planes} onCambio={recargar} irAPlanes={() => setTab("planes")} />
      ) : (
        <ListaPlanes club={club} planes={planes} socios={socios || []} puedeEditar={puede("configurarClub")} onCambio={recargar} />
      )}
    </div>
  );
}

// ---- Socios ------------------------------------------------------------------------------------------------------
function ListaSocios({ club, socios, planes, onCambio, irAPlanes }) {
  const uid = useAuthStore((s) => s.user?.uid);
  const nombreStaff = useAuthStore((s) => s.perfil?.nombre || s.user?.email || null);
  const [filtro, setFiltro] = useState("pendiente");
  const [busqueda, setBusqueda] = useState("");
  const [cobro, setCobro] = useState(null); // { socio | null (alta manual) }
  const lista = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (socios || [])
      .map((s) => ({ ...s, est: estadoSocio(s) }))
      .filter((s) => filtro === "todos" || s.est.estado === filtro)
      .filter((s) => !q || String(s.nombre || "").toLowerCase().includes(q) || String(s.numero || "") === q)
      .sort((a, b) => String(a.nombre || "").localeCompare(String(b.nombre || ""), "es"));
  }, [socios, filtro, busqueda]);

  if (!socios || !planes) return <div className="pd-skeleton h-32 rounded-lg" aria-busy="true" aria-label="Cargando" />;
  const cuenta = (e) => socios.filter((s) => estadoSocio(s).estado === e).length;

  const rechazar = async (s) => {
    const ok = await confirmar({ titulo: `¿Rechazar a ${s.nombre}?`, mensaje: "Le avisamos que no se aceptó su pedido.", confirmText: "Rechazar", danger: true });
    if (!ok) return;
    try {
      await rechazarPedido(club.id, s.id);
      toast.success("Pedido rechazado");
      onCambio();
    } catch (err) {
      console.error(err);
      toast.error("No pudimos guardar el cambio.");
    }
  };
  const baja = async (s) => {
    const ok = await confirmar({ titulo: `¿Dar de baja a ${s.nombre}?`, mensaje: "Deja de tener los beneficios desde ahora. Lo pagado no se devuelve desde Padely.", confirmText: "Dar de baja", danger: true });
    if (!ok) return;
    try {
      await darDeBaja(club.id, s.id);
      toast.success("Socio dado de baja");
      onCambio();
    } catch (err) {
      console.error(err);
      toast.error("No pudimos guardar el cambio.");
    }
  };

  if (!planes.length) {
    return (
      <Card>
        <Card.Title as="h2">Primero armá un plan</Card.Title>
        <Card.Meta className="mt-1!">Elegí precio, período y beneficios (descuentos, reservar antes, estacionamiento…). Después los jugadores lo piden desde la página del club.</Card.Meta>
        <div className="mt-4">
          <Button variant="primary" onClick={irAPlanes}>
            Crear un plan
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Pills
          items={[
            { value: "pendiente", label: "Pedidos", count: cuenta("pendiente") },
            { value: "activa", label: "Activos", count: cuenta("activa") },
            { value: "vencida", label: "Vencidos", count: cuenta("vencida") },
            { value: "todos", label: "Todos", count: socios.length },
          ]}
          value={filtro}
          onChange={setFiltro}
          ariaLabel="Filtrar socios"
        />
        <div className="flex items-center gap-2">
          <SearchInput value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Nombre o número" aria-label="Buscar socio" />
          <Button variant="primary" icon={<Plus className="pd-icon" size={16} aria-hidden="true" />} onClick={() => setCobro({ socio: null })}>
            Agregar socio
          </Button>
        </div>
      </div>
      {lista.length === 0 ? (
        <Card>
          <Card.Meta>{filtro === "pendiente" ? "No hay pedidos nuevos. Los jugadores piden ser socios desde la página del club." : "No hay socios en esta lista."}</Card.Meta>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {lista.map((s) => (
            <Card key={s.id}>
              <Card.Row>
                <Card.Title as="h3" className="m-0">
                  {s.nombre}
                  {s.numero ? <span className="text-ink-3 font-normal"> · Nº {s.numero}</span> : null}
                </Card.Title>
                <Badge tone={TONO[s.est.estado] || "neutral"} dot>
                  {ESTADOS_SOCIO[s.est.estado] || s.est.estado}
                </Badge>
              </Card.Row>
              <Card.Meta className="mt-1!">
                {[s.planNombre, s.est.vence ? `${s.est.estado === "activa" ? "Vence" : "Venció"} el ${formatFechaLarga(s.est.vence)}` : null, s.manual ? "Cargado por el club" : null].filter(Boolean).join(" · ")}
              </Card.Meta>
              {s.est.porVencer && <p className="body-sm text-warning mt-1 mb-0">Vence en {s.est.diasRestantes} {s.est.diasRestantes === 1 ? "día" : "días"}</p>}
              <div className="pd-btn-group mt-3">
                {s.est.estado === "pendiente" ? (
                  <>
                    <Button size="sm" variant="primary" onClick={() => setCobro({ socio: s })}>
                      Aprobar y cobrar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => rechazar(s)}>
                      Rechazar
                    </Button>
                  </>
                ) : s.est.estado === "activa" || s.est.estado === "vencida" ? (
                  <>
                    <Button size="sm" onClick={() => setCobro({ socio: s })}>
                      Registrar pago
                    </Button>
                    {s.est.estado === "activa" && (
                      <Button size="sm" variant="ghost" onClick={() => baja(s)}>
                        Dar de baja
                      </Button>
                    )}
                  </>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}
      {cobro && (
        <CobroDialog
          club={club}
          socio={cobro.socio}
          planes={planes}
          socios={socios}
          onCerrar={() => setCobro(null)}
          onListo={() => {
            setCobro(null);
            onCambio();
          }}
          staff={{ uid, nombre: nombreStaff }}
        />
      )}
    </>
  );
}

// Aprobar un pedido, renovar o dar de alta a mano: plan, monto y medio
function CobroDialog({ club, socio, planes, socios, staff, onCerrar, onListo }) {
  const [planId, setPlanId] = useState(socio?.planId || planes[0]?.id || "");
  const plan = planes.find((p) => p.id === planId) || null;
  const [monto, setMonto] = useState(plan ? String(plan.precio) : "");
  const [medio, setMedio] = useState("efectivo");
  const [datos, setDatos] = useState({ nombre: "", telefono: "", email: "" });
  const [guardando, setGuardando] = useState(false);
  const est = estadoSocio(socio);
  const sinCupo = plan && plan.cupo != null && !est.activa && cupoOcupado(socios.filter((s) => s.id !== socio?.id), plan.id) >= plan.cupo;

  const guardar = async (e) => {
    e?.preventDefault?.();
    if (!plan) return;
    setGuardando(true);
    try {
      const opciones = { monto: Number(monto) || 0, medio, por: staff.uid || null, porNombre: staff.nombre || null };
      if (socio) await registrarPago(club.id, socio, plan, opciones);
      else await agregarSocioManual(club.id, datos, plan, opciones);
      toast.success(socio ? (est.activa ? "Pago registrado: membresía extendida" : `${socio.nombre} ya es socio`) : "Socio agregado");
      onListo();
    } catch (err) {
      console.error("No se pudo registrar el pago del socio:", err);
      toast.error(err?.message || "No pudimos guardar.");
      setGuardando(false);
    }
  };

  return (
    <Dialogo
      titulo={socio ? (socio.estado === "pendiente" ? `Aprobar a ${socio.nombre}` : `Registrar pago de ${socio.nombre}`) : "Agregar socio"}
      descripcion={socio ? (est.activa ? "Sigue vigente: el período nuevo se suma desde su vencimiento." : "La membresía arranca hoy.") : "Para alguien que paga en el club. Si después se registra en Padely, lo vinculás desde su pedido."}
      onCerrar={onCerrar}
      onSubmit={guardar}
      acciones={
        <>
          <Button onClick={onCerrar}>Cancelar</Button>
          <Button type="submit" variant="primary" disabled={!plan || sinCupo || (!socio && !datos.nombre.trim())} cargando={guardando ? "Guardando…" : ""}>
            {socio && socio.estado === "pendiente" ? "Aprobar y registrar pago" : "Registrar pago"}
          </Button>
        </>
      }
    >
      <div className="mt-4 grid gap-4">
        {!socio && (
          <>
            <Field label="Nombre y apellido">
              <Input value={datos.nombre} onChange={(e) => setDatos({ ...datos, nombre: e.target.value })} data-autofocus maxLength={80} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Teléfono (opcional)">
                <Input value={datos.telefono} onChange={(e) => setDatos({ ...datos, telefono: e.target.value })} inputMode="tel" maxLength={30} />
              </Field>
              <Field label="Email (opcional)">
                <Input type="email" value={datos.email} onChange={(e) => setDatos({ ...datos, email: e.target.value })} maxLength={120} />
              </Field>
            </div>
          </>
        )}
        <Field label="Plan" error={sinCupo ? "Este plan no tiene más cupo." : ""}>
          <Select
            value={planId}
            onChange={(e) => {
              setPlanId(e.target.value);
              const p = planes.find((x) => x.id === e.target.value);
              if (p) setMonto(String(p.precio));
            }}
          >
            {planes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} · {formatPrecio(p.precio)} {etiquetaPeriodo(p.periodo).toLowerCase()}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Monto cobrado ($)">
            <Input type="number" min="0" value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="numeric" />
          </Field>
          <Field label="Medio">
            <Select value={medio} onChange={(e) => setMedio(e.target.value)}>
              {MEDIOS_VENTA.map((m) => (
                <option key={m} value={m}>
                  {ETIQUETA_MEDIO_VENTA[m]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <p className="pd-help m-0">El cobro no pasa por la caja del bar: anotalo como ingreso del club como hacés hoy.</p>
      </div>
    </Dialogo>
  );
}

// ---- Planes ------------------------------------------------------------------------------------------------------
function ListaPlanes({ club, planes, socios, puedeEditar, onCambio }) {
  const [editando, setEditando] = useState(null); // { plan | null }
  if (!planes) return <div className="pd-skeleton h-32 rounded-lg" aria-busy="true" aria-label="Cargando" />;
  return (
    <>
      {puedeEditar && (
        <div>
          <Button variant="primary" icon={<Plus className="pd-icon" size={16} aria-hidden="true" />} onClick={() => setEditando({ plan: null })}>
            Nuevo plan
          </Button>
        </div>
      )}
      {planes.length === 0 ? (
        <Card>
          <Card.Title as="h2">Todavía no tenés planes de socio</Card.Title>
          <Card.Meta className="mt-1!">Ejemplos: "Socio mensual" con 15 % off en la cancha y en el bar; "Socio mañana" con 30 % off de lunes a viernes de 8 a 17; "Socio Gold" con estacionamiento y lugar en las exhibiciones.</Card.Meta>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {planes.map((p) => {
            const activos = socios.filter((s) => s.planId === p.id && estadoSocio(s).activa).length;
            return (
              <Card key={p.id}>
                <Card.Row>
                  <Card.Title as="h3" className="m-0">
                    {p.nombre}
                  </Card.Title>
                  {p.visible === false ? <Badge>Oculto</Badge> : <Badge tone="court">Visible</Badge>}
                </Card.Row>
                <p className="numeral-md pd-tnum mt-1 mb-0">
                  {formatPrecio(p.precio)} <span className="body-sm text-ink-3">/ {etiquetaPeriodo(p.periodo).toLowerCase()}</span>
                </p>
                {p.descripcion && <p className="body-sm text-ink-2 mt-1 mb-0">{p.descripcion}</p>}
                <ul className="body-sm mt-2 mb-0 pl-5">
                  {textosBeneficios(p.beneficios).map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
                <Card.Meta className="mt-2!">
                  {activos} {activos === 1 ? "socio activo" : "socios activos"}
                  {p.cupo ? ` · cupo ${p.cupo}` : ""}
                </Card.Meta>
                {puedeEditar && (
                  <div className="mt-3">
                    <Button size="sm" onClick={() => setEditando({ plan: p })}>
                      Editar
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
      {editando && (
        <PlanDialog
          club={club}
          plan={editando.plan}
          onCerrar={() => setEditando(null)}
          onListo={() => {
            setEditando(null);
            onCambio();
          }}
        />
      )}
    </>
  );
}

const PLAN_VACIO = { nombre: "", descripcion: "", precio: "", periodo: "mensual", visible: true, cupo: "", beneficios: { descuentoCanchaPct: 0, franja: null, descuentoBarPct: 0, diasExtraReserva: 0, sinSeña: false, extras: [] } };

function PlanDialog({ club, plan, onCerrar, onListo }) {
  const [form, setForm] = useState(() => (plan ? { ...PLAN_VACIO, ...plan, cupo: plan.cupo ?? "", beneficios: { ...PLAN_VACIO.beneficios, ...plan.beneficios } } : PLAN_VACIO));
  const [extra, setExtra] = useState("");
  const [guardando, setGuardando] = useState(false);
  const b = form.beneficios;
  const setB = (cambios) => setForm((f) => ({ ...f, beneficios: { ...f.beneficios, ...cambios } }));
  const conFranja = !!b.franja;
  const validacion = normalizarPlan(form);

  const agregarExtra = (texto) => {
    const t = String(texto || "").trim();
    if (!t || b.extras.includes(t) || b.extras.length >= MAX_EXTRAS) return;
    setB({ extras: [...b.extras, t] });
    setExtra("");
  };
  const guardar = async (e) => {
    e?.preventDefault?.();
    if (validacion.error) {
      toast.error(validacion.error);
      return;
    }
    setGuardando(true);
    try {
      await guardarPlanSocio(club.id, form, plan?.id || null);
      toast.success(plan ? "Plan actualizado" : "Plan creado");
      onListo();
    } catch (err) {
      console.error("No se pudo guardar el plan:", err);
      toast.error(err?.message || "No pudimos guardar el plan.");
      setGuardando(false);
    }
  };

  return (
    <Dialogo
      titulo={plan ? `Editar ${plan.nombre}` : "Nuevo plan de socio"}
      descripcion="Los cambios valen para las altas y renovaciones nuevas; quien ya es socio conserva sus beneficios hasta renovar."
      onCerrar={onCerrar}
      onSubmit={guardar}
      ancho
      acciones={
        <>
          <Button onClick={onCerrar}>Cancelar</Button>
          <Button type="submit" variant="primary" cargando={guardando ? "Guardando…" : ""}>
            Guardar plan
          </Button>
        </>
      }
    >
      <div className="mt-4 grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre">
            <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej.: Socio mensual" maxLength={60} data-autofocus />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Precio ($)">
              <Input type="number" min="0" inputMode="numeric" value={form.precio} onChange={(e) => setForm({ ...form, precio: e.target.value })} />
            </Field>
            <Field label="Período">
              <Select value={form.periodo} onChange={(e) => setForm({ ...form, periodo: e.target.value })}>
                {PERIODOS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </div>
        <Field label="Descripción (opcional)">
          <Textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} maxLength={280} rows={2} />
        </Field>

        <fieldset className="grid gap-3 border border-line rounded-lg p-4 m-0">
          <legend className="heading-sm px-1">Beneficios que aplica Padely</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Descuento en la cancha (%)" help="Se aplica solo al reservar desde Padely.">
              <Input type="number" min="0" max="100" inputMode="numeric" value={b.descuentoCanchaPct || ""} onChange={(e) => setB({ descuentoCanchaPct: e.target.value })} placeholder="0" />
            </Field>
            <Field label="Descuento en el bar (%)" help="En Vender, con el botón Socio.">
              <Input type="number" min="0" max="100" inputMode="numeric" value={b.descuentoBarPct || ""} onChange={(e) => setB({ descuentoBarPct: e.target.value })} placeholder="0" />
            </Field>
          </div>
          {Number(b.descuentoCanchaPct) > 0 && (
            <label className="flex items-center gap-2 body-sm">
              <input type="checkbox" checked={conFranja} onChange={(e) => setB({ franja: e.target.checked ? { dias: [1, 2, 3, 4, 5], desde: "08:00", hasta: "17:00" } : null })} />
              Solo algunos días y horarios (ej.: de mañana entre semana)
            </label>
          )}
          {conFranja && (
            <div className="grid gap-3">
              <Pills
                multi
                items={DIAS_SEMANA.map((d, i) => ({ value: i, label: d }))}
                value={b.franja.dias}
                onChange={(d) => setB({ franja: { ...b.franja, dias: b.franja.dias.includes(d) ? b.franja.dias.filter((x) => x !== d) : [...b.franja.dias, d].sort() } })}
                ariaLabel="Días del descuento"
              />
              <div className="grid grid-cols-2 gap-4 max-w-sm">
                <Field label="Desde">
                  <Select value={b.franja.desde} onChange={(e) => setB({ franja: { ...b.franja, desde: e.target.value } })}>
                    {HORAS.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Hasta">
                  <Select value={b.franja.hasta} onChange={(e) => setB({ franja: { ...b.franja, hasta: e.target.value } })}>
                    {[...HORAS.slice(1), "23:59"].map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Reservar antes (días extra)" help={`El resto reserva hasta ${club.diasAnticipacion ?? 7} días antes.`}>
              <Input type="number" min="0" max="60" inputMode="numeric" value={b.diasExtraReserva || ""} onChange={(e) => setB({ diasExtraReserva: e.target.value })} placeholder="0" />
            </Field>
            <label className="flex items-center gap-2 body-sm self-end pb-3">
              <input type="checkbox" checked={b.sinSeña === true} onChange={(e) => setB({ sinSeña: e.target.checked })} />
              Reserva sin seña
            </label>
          </div>
        </fieldset>

        <fieldset className="grid gap-3 border border-line rounded-lg p-4 m-0">
          <legend className="heading-sm px-1">Beneficios del club (los cumplís vos)</legend>
          <p className="pd-help m-0">Se muestran en el carnet del socio y cuando escaneás su QR.</p>
          {b.extras.length > 0 && (
            <ul className="flex flex-wrap gap-2 m-0 p-0 list-none">
              {b.extras.map((t) => (
                <li key={t} className="pd-badge flex items-center gap-1">
                  {t}
                  <button type="button" className="text-ink-3" aria-label={`Quitar ${t}`} onClick={() => setB({ extras: b.extras.filter((x) => x !== t) })}>
                    <X className="pd-icon" size={14} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <Input
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              placeholder="Ej.: Estacionamiento para socios"
              maxLength={80}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  agregarExtra(extra);
                }
              }}
            />
            <Button onClick={() => agregarExtra(extra)} disabled={!extra.trim() || b.extras.length >= MAX_EXTRAS}>
              Agregar
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {SUGERENCIAS_EXTRAS.filter((s) => !b.extras.includes(s)).map((s) => (
              <Button key={s} size="sm" variant="ghost" onClick={() => agregarExtra(s)}>
                + {s}
              </Button>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Cupo (opcional)" help="Vacío = sin límite. Cuentan activos y pedidos.">
            <Input type="number" min="1" inputMode="numeric" value={form.cupo} onChange={(e) => setForm({ ...form, cupo: e.target.value })} />
          </Field>
          <label className="flex items-center gap-2 body-sm self-end pb-3">
            <input type="checkbox" checked={form.visible !== false} onChange={(e) => setForm({ ...form, visible: e.target.checked })} />
            Visible en la página del club (los jugadores lo pueden pedir)
          </label>
        </div>
        {validacion.error ? (
          <p className="pd-help m-0">{validacion.error}</p>
        ) : (
          <Alert tone="court">
            <strong>Así lo ve el jugador:</strong> {textosBeneficios(validacion.beneficios).join(" · ")}
          </Alert>
        )}
      </div>
    </Dialogo>
  );
}
