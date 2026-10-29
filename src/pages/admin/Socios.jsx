import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { cancelarPase, getPase, getSocios, guardarPase } from "../../services/membresiasService";
import { DIAS_SEMANA, ESTADOS_SOCIO, ETIQUETA_NIVEL, MAX_EXTRAS, MAX_SPONSORS, MESES_PASE, NIVELES, PESOS_POR_PUNTO, SUGERENCIAS_EXTRAS, TONO_NIVEL, UMBRALES_DEFECTO, estadoSocio, nombrePase, normalizarPase, textoCada, textosBeneficios } from "../../utils/membresias";
import { formatPrecio } from "../../utils/format";
import { formatFechaLarga } from "../../utils/formatDate";
import SinPermiso from "../../components/SinPermiso";
import { confirmar } from "../../components/ConfirmDialog";
import { toast } from "../../components/Toast";
import { Alert, Badge, Button, Card, Field, Input, Pills, SearchInput, Select, Tabs } from "../../components/ui";

// /admin/socios (P3-16): el Pase Club del club. Socios (nivel, puntos, estado) y la configuración: precio, cada
// cuánto se cobra (débito automático por Mercado Pago), puntos para Plata y Oro (últimos 12 meses), los beneficios de
// cada nivel (los que aplica Padely y los propios del club, de texto libre) y los sponsors con su % por nivel.
// (El equipo del club para interclubes queda para después: el modelo ya guarda la postulación.)
const TONO = { pendiente: "warning", activa: "success", vencida: "danger", cancelada: "neutral" };
const HORAS = Array.from({ length: 18 }, (_, i) => `${String(i + 7).padStart(2, "0")}:00`);

export default function Socios() {
  const club = useAuthStore((s) => s.clubActual);
  const puede = useAuthStore((s) => s.puede);
  const puedeSocios = puede("gestionarReservas");
  const puedeConfigurar = puede("configurarClub");
  const [tab, setTab] = useState(puedeSocios ? "socios" : "config");
  const [pase, setPase] = useState(undefined);
  const [socios, setSocios] = useState(null);
  const [error, setError] = useState(false);
  const [version, setVersion] = useState(0);
  const recargar = () => setVersion((v) => v + 1);
  const clubId = club?.id;

  useEffect(() => {
    if (!clubId) return undefined;
    let vivo = true;
    Promise.all([getPase(clubId), puedeSocios ? getSocios(clubId) : Promise.resolve([])])
      .then(([p, s]) => {
        if (!vivo) return;
        setPase(p);
        setSocios(s);
        setError(false);
      })
      .catch((err) => {
        console.error("Error cargando el Pase:", err);
        if (!vivo) return;
        setError(true);
        setPase((x) => (x === undefined ? null : x));
        setSocios((x) => x || []);
      });
    return () => {
      vivo = false;
    };
  }, [clubId, version, puedeSocios]);

  if (!club) return <div className="pd-skeleton h-40 rounded-lg" aria-busy="true" aria-label="Cargando" />;
  if (!puedeSocios && !puedeConfigurar) return <SinPermiso />;

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="heading-xl m-0">{nombrePase(club)}</h1>
        <p className="body-sm text-ink-2 mt-1 mb-0">La membresía de tu club: débito automático por Mercado Pago, puntos por cada gasto y niveles Bronce, Plata y Oro.</p>
      </header>
      {error && <Alert tone="warning">No pudimos leer el Pase. Probá de nuevo en un rato.</Alert>}
      {club.mercadoPago?.conectado !== true && <Alert tone="warning">Para cobrar el Pase conectá Mercado Pago en Configuración → Pagos.</Alert>}
      <Tabs
        items={[
          ...(puedeSocios ? [{ value: "socios", label: "Socios", count: (socios || []).filter((s) => estadoSocio(s).activa).length || undefined }] : []),
          ...(puedeConfigurar ? [{ value: "config", label: "Configurar" }] : []),
        ]}
        value={tab}
        onChange={setTab}
        ariaLabel="Secciones del Pase"
      />
      {tab === "socios" && <ListaSocios club={club} socios={socios} onCambio={recargar} />}
      {tab === "config" && pase !== undefined && <ConfigPase club={club} pase={pase} onGuardado={recargar} />}
    </div>
  );
}

// ---- Socios ------------------------------------------------------------------------------------------------------
function ListaSocios({ club, socios, onCambio }) {
  const [filtro, setFiltro] = useState("activa");
  const [busqueda, setBusqueda] = useState("");
  const lista = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (socios || [])
      .map((s) => ({ ...s, est: estadoSocio(s) }))
      .filter((s) => filtro === "todos" || s.est.estado === filtro)
      .filter((s) => !q || String(s.nombre || "").toLowerCase().includes(q) || String(s.numero || "") === q)
      .sort((a, b) => (Number(b.puntos) || 0) - (Number(a.puntos) || 0));
  }, [socios, filtro, busqueda]);
  if (!socios) return <div className="pd-skeleton h-32 rounded-lg" aria-busy="true" aria-label="Cargando" />;
  const cuenta = (e) => socios.filter((s) => estadoSocio(s).estado === e).length;
  const baja = async (s) => {
    const ok = await confirmar({ titulo: `¿Dar de baja el Pase de ${s.nombre}?`, mensaje: "Se cancela su débito en Mercado Pago y los beneficios terminan hoy. Sus puntos se guardan 90 días.", confirmText: "Dar de baja", danger: true });
    if (!ok) return;
    try {
      await cancelarPase({ clubId: club.id, uid: s.id });
      toast.success("Pase dado de baja");
      onCambio();
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "No pudimos dar de baja el Pase.");
    }
  };
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Pills
          items={[
            { value: "activa", label: "Activos", count: cuenta("activa") },
            { value: "pendiente", label: "Sin autorizar", count: cuenta("pendiente") },
            { value: "vencida", label: "Vencidos", count: cuenta("vencida") },
            { value: "cancelada", label: "De baja", count: cuenta("cancelada") },
            { value: "todos", label: "Todos", count: socios.length },
          ]}
          value={filtro}
          onChange={setFiltro}
          ariaLabel="Filtrar socios"
        />
        <SearchInput value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Nombre o número" aria-label="Buscar socio" />
      </div>
      {lista.length === 0 ? (
        <Card>
          <Card.Meta>{filtro === "activa" ? "Todavía no hay socios activos. Los jugadores se suscriben desde la pestaña Pase de la página del club." : "No hay socios en esta lista."}</Card.Meta>
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
                <span className="pd-badge-group">
                  {s.est.activa && <Badge tone={TONO_NIVEL[s.nivel || "bronce"]}>{ETIQUETA_NIVEL[s.nivel || "bronce"]}</Badge>}
                  <Badge tone={TONO[s.est.estado] || "neutral"} dot>
                    {ESTADOS_SOCIO[s.est.estado] || s.est.estado}
                  </Badge>
                </span>
              </Card.Row>
              <Card.Meta className="mt-1!">
                {[`${s.puntos || 0} puntos`, s.est.vence ? `${s.est.activa ? "Se renueva" : "Venció"} el ${formatFechaLarga(s.est.vence)}` : null].filter(Boolean).join(" · ")}
              </Card.Meta>
              {s.est.activa && (
                <div className="mt-3">
                  <Button size="sm" variant="ghost" onClick={() => baja(s)}>
                    Dar de baja
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

// ---- Configuración del Pase ---------------------------------------------------------------------------------------
const VACIO = { descuentoCanchaPct: 0, franja: null, descuentoBarPct: 0, descuentoTorneoPct: 0, torneoGratis: false, diasExtraReserva: 0, sinSeña: false, extras: [] };

function ConfigPase({ club, pase, onGuardado }) {
  const [form, setForm] = useState(() => ({
    precio: pase?.precio ?? "",
    meses: pase?.meses ?? 1,
    visible: pase ? pase.visible !== false : true,
    umbrales: { ...UMBRALES_DEFECTO, ...(pase?.umbrales || {}) },
    beneficios: Object.fromEntries(NIVELES.map((n) => [n, { ...VACIO, ...(pase?.beneficios?.[n] || {}) }])),
    sponsors: (pase?.sponsors || []).map((x) => ({ ...x, pct: { bronce: 0, plata: 0, oro: 0, ...(x.pct || {}) } })),
  }));
  const setSponsor = (i, cambios) => setForm((f) => ({ ...f, sponsors: f.sponsors.map((x, j) => (j === i ? { ...x, ...cambios } : x)) }));
  const [nivel, setNivel] = useState("bronce");
  const [extra, setExtra] = useState("");
  const [guardando, setGuardando] = useState(false);
  const b = form.beneficios[nivel];
  const setB = (cambios) => setForm((f) => ({ ...f, beneficios: { ...f.beneficios, [nivel]: { ...f.beneficios[nivel], ...cambios } } }));
  const validacion = normalizarPase(form);
  const agregarExtra = (t) => {
    const x = String(t || "").trim();
    if (!x || b.extras.includes(x) || b.extras.length >= MAX_EXTRAS) return;
    setB({ extras: [...b.extras, x] });
    setExtra("");
  };
  const copiarDe = (desde) => setB({ ...form.beneficios[desde], extras: [...form.beneficios[desde].extras] });
  const guardar = async () => {
    if (validacion.error) {
      toast.error(validacion.error);
      return;
    }
    setGuardando(true);
    try {
      await guardarPase(club.id, form);
      toast.success(pase ? "Pase actualizado: los socios activos ya tienen los beneficios nuevos" : "Pase creado");
      onGuardado();
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "No pudimos guardar el Pase.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <Card.Title as="h2">Precio y puntos</Card.Title>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 md:grid-cols-4">
          <Field label="Precio ($)">
            <Input type="number" min="100" inputMode="numeric" value={form.precio} onChange={(e) => setForm({ ...form, precio: e.target.value })} />
          </Field>
          <Field label="Se cobra">
            <Select value={String(form.meses)} onChange={(e) => setForm({ ...form, meses: Number(e.target.value) })}>
              {MESES_PASE.map((m) => (
                <option key={m} value={m}>
                  {m === 1 ? "Todos los meses" : m === 12 ? "Una vez por año" : `Cada ${m} meses`}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Puntos para Plata">
            <Input type="number" min="1" inputMode="numeric" value={form.umbrales.plata} onChange={(e) => setForm({ ...form, umbrales: { ...form.umbrales, plata: e.target.value } })} />
          </Field>
          <Field label="Puntos para Oro">
            <Input type="number" min="2" inputMode="numeric" value={form.umbrales.oro} onChange={(e) => setForm({ ...form, umbrales: { ...form.umbrales, oro: e.target.value } })} />
          </Field>
        </div>
        <p className="pd-help mt-2 mb-0">
          1 punto cada {formatPrecio(PESOS_POR_PUNTO)} que el socio gasta en el club (canchas jugadas, bar con su Pase, torneos que organiza el club); cuentan los últimos 12 meses. Plata = {formatPrecio((Number(form.umbrales.plata) || 0) * PESOS_POR_PUNTO)} gastados; Oro = {formatPrecio((Number(form.umbrales.oro) || 0) * PESOS_POR_PUNTO)}.
        </p>
        <label className="flex items-center gap-2 body-sm mt-3">
          <input type="checkbox" checked={form.visible} onChange={(e) => setForm({ ...form, visible: e.target.checked })} />
          Visible en la página del club (los jugadores se pueden suscribir)
        </label>
      </Card>

      <Card>
        <Card.Row>
          <Card.Title as="h2" className="m-0">
            Beneficios por nivel
          </Card.Title>
          <Pills items={NIVELES.map((n) => ({ value: n, label: ETIQUETA_NIVEL[n] }))} value={nivel} onChange={setNivel} ariaLabel="Nivel" />
        </Card.Row>
        {nivel !== "bronce" && (
          <div className="mt-2">
            <Button size="sm" variant="ghost" onClick={() => copiarDe(nivel === "oro" ? "plata" : "bronce")}>
              Copiar los de {nivel === "oro" ? "Plata" : "Bronce"} para mejorarlos
            </Button>
          </div>
        )}
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field label="Descuento en la cancha (%)" help="Al reservar desde Padely (no en las reservas que carga el club).">
            <Input type="number" min="0" max="100" inputMode="numeric" value={b.descuentoCanchaPct || ""} onChange={(e) => setB({ descuentoCanchaPct: e.target.value })} placeholder="0" />
          </Field>
          <Field label="Descuento en el bar (%)" help="En Vender, con el botón Pase.">
            <Input type="number" min="0" max="100" inputMode="numeric" value={b.descuentoBarPct || ""} onChange={(e) => setB({ descuentoBarPct: e.target.value })} placeholder="0" />
          </Field>
          <Field label="Descuento en torneos del club (%)" help="En la inscripción online a torneos que organiza el club.">
            <Input type="number" min="0" max="100" inputMode="numeric" value={b.descuentoTorneoPct || ""} onChange={(e) => setB({ descuentoTorneoPct: e.target.value })} placeholder="0" disabled={b.torneoGratis} />
          </Field>
          <Field label="Reservar antes (días extra)" help={`El resto reserva hasta ${club.diasAnticipacion ?? 7} días antes.`}>
            <Input type="number" min="0" max="60" inputMode="numeric" value={b.diasExtraReserva || ""} onChange={(e) => setB({ diasExtraReserva: e.target.value })} placeholder="0" />
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 body-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={b.torneoGratis === true} onChange={(e) => setB({ torneoGratis: e.target.checked })} />
            Inscripción gratis a los torneos del club
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={b.sinSeña === true} onChange={(e) => setB({ sinSeña: e.target.checked })} />
            Reserva sin seña
          </label>
          {Number(b.descuentoCanchaPct) > 0 && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={!!b.franja} onChange={(e) => setB({ franja: e.target.checked ? { dias: [1, 2, 3, 4, 5], desde: "08:00", hasta: "17:00" } : null })} />
              Descuento de cancha solo algunos días y horarios
            </label>
          )}
        </div>
        {b.franja && (
          <div className="mt-3 grid gap-3">
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
        <div className="mt-4 pt-3 border-t border-line grid gap-3">
          <p className="heading-sm m-0">Beneficios del club ({ETIQUETA_NIVEL[nivel]})</p>
          <p className="pd-help m-0">Los cumplís vos: se muestran en el Pase del socio y cuando escaneás su QR.</p>
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
              placeholder="Ej.: 15 % off en la tienda de un sponsor"
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
        </div>
      </Card>

      <Card>
        <Card.Title as="h2">Sponsors</Card.Title>
        <Card.Meta className="mt-1!">Las marcas que acompañan al club y el descuento que dan a cada nivel. Se muestran en el Pase del socio y al escanear su QR (el sponsor lo verifica ahí).</Card.Meta>
        <div className="mt-3 grid gap-3">
          {form.sponsors.map((x, i) => (
            <div key={i} className="grid gap-3 sm:grid-cols-[2fr_2fr_repeat(3,1fr)_auto] items-end border-b border-line pb-3">
              <Field label="Sponsor">
                <Input value={x.nombre} onChange={(e) => setSponsor(i, { nombre: e.target.value })} maxLength={40} placeholder="Ej.: Deportes Norte" />
              </Field>
              <Field label="Detalle (opcional)">
                <Input value={x.detalle || ""} onChange={(e) => setSponsor(i, { detalle: e.target.value })} maxLength={80} placeholder="Ej.: paletas y ropa" />
              </Field>
              {NIVELES.map((n) => (
                <Field key={n} label={`${ETIQUETA_NIVEL[n]} %`}>
                  <Input type="number" min="0" max="100" inputMode="numeric" value={x.pct[n] || ""} onChange={(e) => setSponsor(i, { pct: { ...x.pct, [n]: e.target.value } })} placeholder="0" />
                </Field>
              ))}
              <Button variant="ghost" iconOnly aria-label={`Quitar ${x.nombre || "sponsor"}`} icon={<X className="pd-icon" size={16} aria-hidden="true" />} onClick={() => setForm((f) => ({ ...f, sponsors: f.sponsors.filter((_, j) => j !== i) }))} />
            </div>
          ))}
          {form.sponsors.length < MAX_SPONSORS && (
            <div>
              <Button onClick={() => setForm((f) => ({ ...f, sponsors: [...f.sponsors, { nombre: "", detalle: "", pct: { bronce: 0, plata: 0, oro: 0 } }] }))}>Agregar sponsor</Button>
            </div>
          )}
        </div>
      </Card>

      {validacion.error ? (
        <p className="pd-help m-0">{validacion.error}</p>
      ) : (
        <Alert tone="court">
          <strong>
            Así lo ve el jugador: {formatPrecio(validacion.precio)} {textoCada(validacion.meses)}.
          </strong>{" "}
          {NIVELES.map((n) => `${ETIQUETA_NIVEL[n]}: ${textosBeneficios(validacion.beneficios[n]).join(", ") || "—"}`).join(" · ")}
        </Alert>
      )}
      <div>
        <Button variant="primary" onClick={guardar} cargando={guardando ? "Guardando…" : ""}>
          {pase ? "Guardar cambios" : "Lanzar el Pase"}
        </Button>
      </div>
    </div>
  );
}
