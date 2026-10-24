import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useAuthStore } from "../../../store/authStore";
import SinPermiso from "../../../components/SinPermiso";
import TicketPreview from "../../../components/TicketPreview";
import { toast } from "../../../components/Toast";
import { confirmar } from "../../../components/ConfirmDialog";
import { Alert, Badge, Button, Card, Field, Input, Pills, StatTile } from "../../../components/ui";
import { getReportesDiarios, recalcularReporte, getCaja } from "../../../services/reportesService";
import { getCategorias } from "../../../services/productosService";
import { getMovimientosCaja } from "../../../services/cajaService";
import { htmlCierreCaja } from "../../../print/cierreCaja";
import { anchoTicketGuardado } from "../../../print/imprimir";
import { PERIODOS, indicadores, porCanchaLista, porCategoriaConParticipacion, porMedioLista, rangoDePeriodo, seriePorDia, seriePorHora, sumarRollups, topProductos } from "../../../utils/reportes";
import { tonoDiferencia } from "../../../utils/caja";
import { formatPrecio } from "../../../utils/format";
import { formatDiaCorto, formatFechaHora, formatHora, getTodayLocal } from "../../../utils/formatDate";
import ExportarMenu from "../../../components/reportes/ExportarMenu";
import useMediaQuery from "../../../utils/useMediaQuery";

// Reportes del bar: lo que el dueño abre el lunes. Se arma sumando los rollups diarios (reportesDiarios) del
// período, nunca recorriendo ventas. "Recalcular este día" reconstruye un día desde ventas y cajas (callable).

const COLORES = ["var(--court)", "var(--success)", "var(--ink-3)", "var(--line-strong)", "var(--lime-text)"];
const TICK = { fontSize: 12, fill: "var(--ink-3)", fontFamily: "var(--font-sans)" };
const TOOLTIP = {
  contentStyle: { background: "var(--surface-raised)", border: "1px solid var(--line)", borderRadius: 12, color: "var(--ink)" },
  itemStyle: { color: "var(--ink)" },
  labelStyle: { color: "var(--ink-2)", fontWeight: 600 },
};
const LEGEND = { fontSize: 12, fontFamily: "var(--font-sans)" };
const fmtCant = (n) => (Number(n) || 0).toLocaleString("es-AR", { maximumFractionDigits: 3 });

// Tabla en escritorio, tarjetas en el teléfono: UN solo layout en el DOM (useMediaQuery). columnas: [{ clave, label, num?, render? }]
function Tabla({ columnas, filas, claveFila, vacio }) {
  const escritorio = useMediaQuery("(min-width: 768px)");
  if (!filas.length) return <p className="body-sm text-ink-2 m-0 py-6 text-center">{vacio}</p>;
  const valor = (f, c) => (c.render ? c.render(f) : f[c.clave]);
  if (!escritorio) {
    return (
      <div className="flex flex-col gap-3">
        {filas.map((f) => (
          <Card key={claveFila(f)}>
            <Card.Title className="text-[17px]! leading-6!">{valor(f, columnas[0])}</Card.Title>
            <dl className="pd-dl mt-3">
              {columnas.slice(1).map((c) => (
                <div key={c.clave}>
                  <dt>{c.label}</dt>
                  <dd className={c.num ? "pd-tnum" : ""}>{valor(f, c)}</dd>
                </div>
              ))}
            </dl>
          </Card>
        ))}
      </div>
    );
  }
  return (
    <div className="pd-table-wrap">
      <div className="overflow-x-auto">
        <table className="pd-table">
            <thead>
              <tr>
                {columnas.map((c) => (
                  <th key={c.clave} className={c.num ? "num" : undefined}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={claveFila(f)}>
                  {columnas.map((c) => (
                    <td key={c.clave} className={c.num ? "num pd-tnum" : undefined}>
                      {valor(f, c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
      </div>
    </div>
  );
}

export default function Reportes() {
  const clubActual = useAuthStore((s) => s.clubActual);
  const clubCargado = useAuthStore((s) => s.clubCargado);
  const puede = useAuthStore((s) => s.puede);
  const clubId = clubActual?.id || null;
  const puedeEntrar = !!clubActual && puede("verReportes");
  const hoy = getTodayLocal();

  const [periodo, setPeriodo] = useState("hoy");
  const [rangoManual, setRangoManual] = useState({ desde: hoy, hasta: hoy });
  const [estado, setEstado] = useState({ clave: null, rollups: [], error: false });
  const [categorias, setCategorias] = useState([]);
  const [recalculando, setRecalculando] = useState(false);
  const [ticket, setTicket] = useState(null);
  const [version, setVersion] = useState(0);

  const rango = useMemo(() => rangoDePeriodo(periodo, hoy, rangoManual), [periodo, hoy, rangoManual]);
  const clave = `${clubId}|${rango.desde}|${rango.hasta}|${version}`;

  useEffect(() => {
    if (!clubId || !puedeEntrar) return undefined;
    let vivo = true;
    getReportesDiarios(clubId, rango.desde, rango.hasta)
      .then((rollups) => vivo && setEstado({ clave, rollups, error: false }))
      .catch((err) => {
        console.error("Error cargando los reportes:", err);
        if (vivo) setEstado({ clave, rollups: [], error: true });
      });
    return () => {
      vivo = false;
    };
  }, [clubId, puedeEntrar, rango.desde, rango.hasta, clave]);

  useEffect(() => {
    if (!clubId || !puedeEntrar) return undefined;
    let vivo = true;
    getCategorias(clubId)
      .then((lista) => vivo && setCategorias(lista))
      .catch((err) => console.error("Error cargando categorías:", err));
    return () => {
      vivo = false;
    };
  }, [clubId, puedeEntrar]);

  const cargando = estado.clave !== clave;
  const totales = useMemo(() => sumarRollups(estado.rollups), [estado.rollups]);
  const ind = useMemo(() => indicadores(totales), [totales]);
  const nombresCat = useMemo(() => Object.fromEntries(categorias.map((c) => [c.id, c.nombre])), [categorias]);
  const unDia = rango.desde === rango.hasta;
  const medios = porMedioLista(totales);
  const serie = unDia ? seriePorHora(totales) : seriePorDia(totales, rango.desde, rango.hasta);
  const top = topProductos(totales, 10);
  const maxTop = top.length ? top[0].total : 0;
  const cats = porCategoriaConParticipacion(totales, nombresCat);
  const canchas = porCanchaLista(totales);
  const cierres = [...totales.cierres].sort((a, b) => (b.cerradaEn?.toMillis?.() || 0) - (a.cerradaEn?.toMillis?.() || 0));
  const sinDatos = !cargando && !estado.error && estado.rollups.length === 0;
  // Margen solo sobre líneas con costo conocido; el sufijo dice qué le falta o qué se estimó
  const sufijosMargen = [ind.margenParcial && "parcial", ind.margenEstimado && "con costos estimados"].filter(Boolean);
  const etiquetaMargen = sufijosMargen.length ? `Margen (${sufijosMargen.join(", ")})` : "Margen";
  const sinMargen = ind.margen === null && ind.ventas > 0;
  const etiquetaPeriodo = unDia ? formatDiaCorto(rango.desde) : `${formatDiaCorto(rango.desde)} – ${formatDiaCorto(rango.hasta)}`;

  const recalcular = async () => {
    const ok = await confirmar({
      titulo: `¿Recalcular el ${formatDiaCorto(rango.desde)}?`,
      mensaje: "Se vuelve a armar el reporte de ese día desde las ventas y los cierres de caja. Tarda unos segundos.",
      confirmText: "Recalcular",
    });
    if (!ok) return;
    setRecalculando(true);
    try {
      const r = await recalcularReporte(clubId, rango.desde);
      toast.success(`Reporte recalculado: ${r.ventas} ventas, ${r.cierres} cierres`);
      setVersion((v) => v + 1);
    } catch (err) {
      console.error("Error recalculando el reporte:", err);
      toast.error(err?.code === "functions/permission-denied" ? "Solo quien ve los reportes puede recalcularlos." : "No se pudo recalcular. Intentá de nuevo.");
    } finally {
      setRecalculando(false);
    }
  };

  const verCierre = async (c) => {
    try {
      const [caja, movimientos] = await Promise.all([getCaja(clubId, c.cajaId), getMovimientosCaja(clubId, c.cajaId)]);
      if (!caja) throw new Error("La caja no existe");
      setTicket({ titulo: "Cierre de caja", descripcion: `${caja.dispositivo} · ${formatFechaHora(caja.abiertaEn)} → ${formatHora(caja.cerradaEn)}`, html: htmlCierreCaja({ club: clubActual, caja, movimientos }) });
    } catch (err) {
      console.error("Error cargando el cierre:", err);
      toast.error("No pudimos abrir ese cierre.");
    }
  };

  if (!clubCargado) return <div className="pd-skeleton h-64 rounded-lg" aria-busy="true" aria-label="Cargando" />;
  if (!clubActual || !puedeEntrar) {
    return (
      <div>
        <h1 className="heading-lg m-0 mb-4">Reportes</h1>
        <SinPermiso />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="heading-lg m-0">Reportes</h1>
          <p className="body-sm text-ink-2 mt-1 mb-0">Ventas del bar · {etiquetaPeriodo}</p>
        </div>
        <div className="pd-btn-group">
          <ExportarMenu clubId={clubId} club={clubActual} rango={rango} categorias={categorias} />
          {unDia && (
            <Button variant="ghost" icon={<RefreshCw className="pd-icon" size={20} aria-hidden="true" />} onClick={recalcular} cargando={recalculando ? "Recalculando…" : ""}>
              Recalcular este día
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <Pills items={PERIODOS} value={periodo} onChange={setPeriodo} ariaLabel="Período" />
        {periodo === "rango" && (
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Desde" className="w-[170px]">
              <Input type="date" value={rangoManual.desde} max={hoy} onChange={(e) => setRangoManual((r) => ({ ...r, desde: e.target.value }))} />
            </Field>
            <Field label="Hasta" className="w-[170px]">
              <Input type="date" value={rangoManual.hasta} max={hoy} onChange={(e) => setRangoManual((r) => ({ ...r, hasta: e.target.value }))} />
            </Field>
          </div>
        )}
      </div>

      {estado.error && <Alert tone="danger">No pudimos cargar los reportes. Recargá la página.</Alert>}
      {sinDatos && (
        <Alert>
          Sin ventas registradas en este período. Las ventas de antes de hoy (anteriores a este reporte) aparecen después de "Recalcular este día" para cada fecha.
        </Alert>
      )}

      {/* 1. Indicadores */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4" aria-busy={cargando || undefined}>
        <StatTile value={cargando ? "…" : fmtCant(ind.ventas)} label="Ventas" />
        <StatTile value={cargando ? "…" : formatPrecio(ind.total)} label="Total vendido" delta={ind.descuentos > 0 ? `Descuentos −${formatPrecio(ind.descuentos)}` : undefined} down={ind.descuentos > 0} />
        <StatTile value={cargando ? "…" : formatPrecio(ind.ticketPromedio)} label="Ticket promedio" />
        <StatTile value={cargando ? "…" : ind.margen === null ? "—" : formatPrecio(ind.margen)} label={etiquetaMargen} />
        <StatTile value={cargando ? "…" : fmtCant(ind.anuladas)} label="Anuladas" delta={ind.totalAnulado ? `−${formatPrecio(ind.totalAnulado)}` : undefined} down={ind.totalAnulado > 0} />
      </div>
      {(sinMargen || ind.margenParcial || ind.margenEstimado) && (
        <p className="pd-help -mt-3 m-0">
          {sinMargen && "Sin margen: ninguna línea del período tiene costo conocido. Si el día es anterior a este reporte, probá \"Recalcular este día\". "}
          {ind.margenParcial && "Margen parcial: las líneas sin costo (productos sin costo cargado, o pedidos desde el celular, que no llevan costo) quedan fuera del margen, no entran a precio completo. Cargá los costos en Productos y recalculá el día. "}
          {ind.margenEstimado && "Con costos estimados: al recalcular el día, las líneas sin costo tomaron el costo actual del producto."}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 2. Por medio de pago */}
        <Card>
          <Card.Title className="mb-4!">Por medio de pago</Card.Title>
          {medios.length === 0 ? (
            <p className="body-sm text-ink-2 m-0 py-6 text-center">Sin cobros en el período.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 sm:items-center">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={medios} cx="50%" cy="50%" outerRadius={80} dataKey="total" nameKey="label" stroke="var(--surface-raised)">
                    {medios.map((_, i) => (
                      <Cell key={i} fill={COLORES[i % COLORES.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => formatPrecio(v)} {...TOOLTIP} />
                  <Legend wrapperStyle={LEGEND} />
                </PieChart>
              </ResponsiveContainer>
              <ul className="m-0 p-0 list-none divide-y divide-line">
                {medios.map((m, i) => (
                  <li key={m.medio} className="flex items-center justify-between gap-3 py-2 body-sm">
                    <span className="flex items-center gap-2">
                      <span className="inline-block w-3 h-3 rounded-pill" style={{ background: COLORES[i % COLORES.length] }} aria-hidden="true" />
                      {m.label}
                    </span>
                    <span className="pd-tnum font-semibold">{formatPrecio(m.total)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        {/* 3. Ventas por día / por hora */}
        <Card>
          <Card.Title className="mb-4!">{unDia ? "Ventas por hora" : "Ventas por día"}</Card.Title>
          {ind.total === 0 && ind.ventas === 0 ? (
            <p className="body-sm text-ink-2 m-0 py-6 text-center">Nada que graficar todavía.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={serie}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line-strong)" />
                <XAxis dataKey="name" stroke="var(--line-strong)" tick={TICK} tickLine={false} interval={unDia ? 1 : "preserveStartEnd"} />
                <YAxis stroke="var(--line-strong)" tick={TICK} tickLine={false} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)} />
                <Tooltip {...TOOLTIP} cursor={{ fill: "var(--surface-hover)" }} formatter={(v, n) => (n === "total" ? [formatPrecio(v), "Total"] : [v, "Ventas"])} />
                <Bar dataKey="total" name="total" fill="var(--lime)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* 4. Top 10 */}
      <Card className="p-0!">
        <div className="pd-table-head">
          <h3>
            Top 10 productos<span className="pd-count">{top.length}</span>
          </h3>
        </div>
        <div className="px-4 pb-4 md:px-0 md:pb-0">
          <Tabla
            vacio="Sin consumos en el período."
            claveFila={(p) => p.id}
            columnas={[
              {
                clave: "nombre",
                label: "Producto",
                render: (p) => (
                  <span className="block">
                    <span className="font-semibold">{p.nombre}</span>
                    <span className="block h-1.5 mt-1 rounded-pill bg-surface-sunken overflow-hidden" aria-hidden="true">
                      <span className="block h-full bg-court rounded-pill" style={{ width: `${maxTop ? Math.max(4, Math.round((p.total / maxTop) * 100)) : 0}%` }} />
                    </span>
                  </span>
                ),
              },
              { clave: "cantidad", label: "Cantidad", num: true, render: (p) => fmtCant(p.cantidad) },
              { clave: "total", label: "Total", num: true, render: (p) => formatPrecio(p.total) },
              { clave: "margen", label: "Margen", num: true, render: (p) => (p.margen === null ? "—" : formatPrecio(p.margen)) },
            ]}
            filas={top}
          />
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 5. Por categoría */}
        <Card className="p-0!">
          <div className="pd-table-head">
            <h3>Por categoría</h3>
          </div>
          <div className="px-4 pb-4 md:px-0 md:pb-0">
            <Tabla
              vacio="Sin consumos en el período."
              claveFila={(c) => c.id}
              columnas={[
                { clave: "nombre", label: "Categoría", render: (c) => <span className="font-semibold">{c.nombre}</span> },
                { clave: "cantidad", label: "Cantidad", num: true, render: (c) => fmtCant(c.cantidad) },
                { clave: "total", label: "Total", num: true, render: (c) => formatPrecio(c.total) },
                { clave: "participacion", label: "Participación", num: true, render: (c) => `${c.participacion} %` },
              ]}
              filas={cats}
            />
          </div>
        </Card>

        {/* 6. Consumo por cancha */}
        <Card className="p-0!">
          <div className="pd-table-head">
            <h3>Consumo por cancha</h3>
            <span className="body-sm text-ink-2">Cuentas del turno cerradas</span>
          </div>
          <div className="px-4 pb-4 md:px-0 md:pb-0">
            <Tabla
              vacio="Sin cuentas del turno cerradas en el período."
              claveFila={(c) => c.id}
              columnas={[
                {
                  clave: "nombre",
                  label: "Cancha",
                  render: (c) => (
                    <Link to={unDia ? `/admin/bar/cuentas?cancha=${c.id}&fecha=${rango.desde}` : `/admin/bar/cuentas?cancha=${c.id}&desde=${rango.desde}&hasta=${rango.hasta}`} className="font-semibold hover:underline">
                      {c.nombre}
                    </Link>
                  ),
                },
                { clave: "cuentas", label: "Cuentas", num: true, render: (c) => fmtCant(c.cuentas) },
                { clave: "consumos", label: "Consumos", num: true, render: (c) => formatPrecio(c.consumos) },
                { clave: "cancha", label: "Cancha cobrada", num: true, render: (c) => formatPrecio(c.cancha) },
              ]}
              filas={canchas}
            />
          </div>
        </Card>
      </div>

      {/* 7. Cierres de caja */}
      <Card className="p-0!">
        <div className="pd-table-head">
          <h3>
            Cierres de caja<span className="pd-count">{cierres.length}</span>
          </h3>
        </div>
        <div className="px-4 pb-4 md:px-0 md:pb-0">
          <Tabla
            vacio="Sin cierres de caja en el período."
            claveFila={(c) => `${c.cajaId}-${c.fecha}`}
            columnas={[
              { clave: "dispositivo", label: "Dispositivo", render: (c) => <span className="font-semibold">{c.dispositivo || "—"}</span> },
              { clave: "horas", label: "Apertura → cierre", render: (c) => `${formatFechaHora(c.abiertaEn)} → ${formatHora(c.cerradaEn)}` },
              { clave: "esperado", label: "Esperado", num: true, render: (c) => formatPrecio(c.esperadoEfectivo) },
              { clave: "contado", label: "Contado", num: true, render: (c) => formatPrecio(c.efectivoContado) },
              {
                clave: "diferencia",
                label: "Diferencia",
                num: true,
                render: (c) => (
                  <Badge tone={tonoDiferencia(c.diferencia)} className="pd-tnum">
                    {c.diferencia < 0 ? "−" : c.diferencia > 0 ? "+" : ""}
                    {formatPrecio(Math.abs(c.diferencia))}
                  </Badge>
                ),
              },
              {
                clave: "ver",
                label: "",
                render: (c) => (
                  <Button size="sm" variant="ghost" onClick={() => verCierre(c)}>
                    Ver
                  </Button>
                ),
              },
            ]}
            filas={cierres}
          />
        </div>
      </Card>

      {ticket && <TicketPreview titulo={ticket.titulo} descripcion={ticket.descripcion} html={ticket.html} ancho={anchoTicketGuardado()} onCerrar={() => setTicket(null)} />}
    </div>
  );
}
