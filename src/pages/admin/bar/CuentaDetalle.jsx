import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CalendarDays, MessageSquare, Plus, Printer, X } from "lucide-react";
import { useAuthStore } from "../../../store/authStore";
import SinPermiso from "../../../components/SinPermiso";
import Dialogo from "../../../components/Dialogo";
import { toast } from "../../../components/Toast";
import { confirmar } from "../../../components/ConfirmDialog";
import { Alert, Badge, Button, Card, Field, Input, Select } from "../../../components/ui";
import CobrarDialog from "../../../components/pos/CobrarDialog";
import PostVentaDialog from "../../../components/pos/PostVentaDialog";
import DividirDialog from "../../../components/pos/DividirDialog";
import TicketPreview from "../../../components/TicketPreview";
import useNumeracion from "../../../components/pos/useNumeracion";
import ParticipantesPanel from "../../../components/cuenta/ParticipantesPanel";
import ChipsParticipantes from "../../../components/cuenta/ChipsParticipantes";
import AsignarSheet from "../../../components/cuenta/AsignarSheet";
import SumarJugadorDialog from "../../../components/cuenta/SumarJugadorDialog";
import { htmlTicketCuenta } from "../../../print/ticketCuenta";
import { anchoTicketGuardado } from "../../../print/imprimir";
import { dispositivoGuardado, escucharCajaAbierta } from "../../../services/cajaService";
import {
  CuentaCerradaError,
  CuentaNoEditableError,
  actualizarParticipante,
  anularCuenta,
  asignarLineasCuenta,
  cobrarLineas,
  cobrarParte,
  cobrarParticipantes,
  cobrarRestoAlTitular,
  cobrarTodo,
  escucharCuenta,
  guardarDivision,
  quitarItemDeCuenta,
  setCobrarCancha,
} from "../../../services/cuentasService";
import { quitarParticipante } from "../../../services/participantesService";
import { useOnline } from "../../../utils/conexion";
import { calcularTotalesCuenta, canchaPagadaEnParte, cobroDeLineas, cobroRestoAlTitular, cuentaEditable, esLegacyDividida, lineaPagada, partePagada, partesPagadas, participantesActivos, saldosDeCuenta, textoReparto, textoTurno } from "../../../utils/cuentas";
import { formatPrecio } from "../../../utils/format";
import { formatDiaCorto, formatFechaHora, formatHora } from "../../../utils/formatDate";

// Detalle de una cuenta del turno: participantes (quién está y qué debe cada uno), la cancha y el bar como dos
// libros, los consumos con su "para quién", y los cobros: a una persona, líneas elegidas, todo, o el resto al
// titular. La cuenta se cierra sola cuando nadie debe. Las ventas salen de la caja abierta de ESTE dispositivo.
// Una cuenta dividida al estilo P3-4 con partes cobradas (legacy) conserva su división hasta cerrarse.

const fmtCant = (n) => (Number(n) || 0).toLocaleString("es-AR", { maximumFractionDigits: 3 });
const TONO_ESTADO = { abierta: "success", cerrada: "neutral", anulada: "danger" };
const ETIQUETA_ESTADO = { abierta: "Abierta", cerrada: "Cerrada", anulada: "Anulada" };

function AnularCuentaDialog({ cuenta, clubId, uid, nombre, onCerrar, onAnulada }) {
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const anular = async () => {
    const texto = motivo.trim();
    if (!texto) {
      setError("Contá por qué se anula.");
      return;
    }
    const ok = await confirmar({
      titulo: "¿Anular la cuenta?",
      mensaje: "Los consumos se descartan: nunca movieron stock ni caja. La reserva queda como estaba.",
      confirmText: "Anular cuenta",
      danger: true,
    });
    if (!ok) return;
    setGuardando(true);
    try {
      await anularCuenta(clubId, cuenta, { motivo: texto, uid, nombre });
      toast.success("Cuenta anulada");
      onAnulada();
    } catch (e) {
      console.error("Error anulando la cuenta:", e);
      toast.error("No pudimos anular la cuenta.");
      setGuardando(false);
    }
  };
  return (
    <Dialogo
      titulo="Anular cuenta"
      descripcion={textoTurno(cuenta)}
      onCerrar={onCerrar}
      onSubmit={anular}
      acciones={
        <>
          <Button onClick={onCerrar}>Cancelar</Button>
          <Button type="submit" variant="danger" cargando={guardando ? "Anulando…" : ""}>
            Anular
          </Button>
        </>
      }
    >
      <div className="mt-4">
        <Field label="Motivo" error={error}>
          <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej: se cargó en el turno equivocado" data-autofocus maxLength={120} />
        </Field>
      </div>
    </Dialogo>
  );
}

// ¿Quién paga las líneas seleccionadas? (por defecto el titular)
function QuienPagaDialog({ participantes, titularId, total, onCerrar, onElegir }) {
  const [pagador, setPagador] = useState(titularId || participantes[0]?.id || "");
  return (
    <Dialogo
      titulo="Cobrar seleccionados"
      descripcion={`${formatPrecio(total)} · ¿quién paga?`}
      onCerrar={onCerrar}
      onSubmit={() => onElegir(pagador)}
      acciones={
        <>
          <Button onClick={onCerrar}>Cancelar</Button>
          <Button type="submit" variant="primary">
            Continuar
          </Button>
        </>
      }
    >
      <div className="mt-4">
        <Field label="Paga">
          <Select value={pagador} onChange={(e) => setPagador(e.target.value)} data-autofocus>
            {participantes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Dialogo>
  );
}

export default function CuentaDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const clubActual = useAuthStore((s) => s.clubActual);
  const clubCargado = useAuthStore((s) => s.clubCargado);
  const puede = useAuthStore((s) => s.puede);
  const user = useAuthStore((s) => s.user);
  const perfil = useAuthStore((s) => s.perfil);
  const clubId = clubActual?.id || null;
  const uid = user?.uid || null;
  const nombre = perfil?.nombre || user?.displayName || user?.email || "";
  const puedeEntrar = !!clubActual && (puede("cobrarTurnos") || puede("vender"));
  const puedeAnular = !!clubActual && puede("anularVenta");

  const online = useOnline();
  const [dispositivo] = useState(dispositivoGuardado);
  const [cajaEstado, setCajaEstado] = useState({ para: null, caja: null });
  const [estado, setEstado] = useState({ para: null, cuenta: null, error: false });
  // "cobrarTodo" | "cobrarResto" | "anular" | "dividir" | "sumar" | { parteId } | { tipo: "cobrarA", participanteId }
  // | { tipo: "quienPaga", lineaIds } | { tipo: "cobrarSel", lineaIds, pagadorId } | { tipo: "asignar", lineaIds }
  const [dialogo, setDialogo] = useState(null);
  const [seleccion, setSeleccion] = useState(() => new Set());
  const [ultimaVenta, setUltimaVenta] = useState(null); // { venta, cerroCuenta }
  const [ticketCuenta, setTicketCuenta] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [ancho] = useState(anchoTicketGuardado);

  useEffect(() => {
    if (!clubId || !puedeEntrar) return undefined;
    const unsub = escucharCajaAbierta(clubId, dispositivo, (caja) => setCajaEstado({ para: clubId, caja }), (err) => console.error("Error escuchando la caja:", err));
    return () => unsub();
  }, [clubId, dispositivo, puedeEntrar]);

  useEffect(() => {
    if (!clubId || !id || !puedeEntrar) return undefined;
    const unsub = escucharCuenta(
      clubId,
      id,
      (cuenta) => setEstado({ para: id, cuenta, error: false }),
      (err) => {
        console.error("Error escuchando la cuenta:", err);
        setEstado({ para: id, cuenta: null, error: true });
      },
    );
    return () => unsub();
  }, [clubId, id, puedeEntrar]);

  const caja = cajaEstado.para === clubId ? cajaEstado.caja : null;
  const { tomar, sinNumeros } = useNumeracion({ clubId, dispositivo, uid, activo: !!caja && puedeEntrar, online });
  const cuenta = estado.para === id ? estado.cuenta : null;
  const saldos = useMemo(() => (cuenta ? saldosDeCuenta(cuenta) : null), [cuenta]);

  if (!clubCargado || (clubActual && puedeEntrar && estado.para !== id && !estado.error)) {
    return <div className="pd-skeleton h-64 rounded-lg" aria-busy="true" aria-label="Cargando" />;
  }
  if (!clubActual || !puedeEntrar) {
    return (
      <div>
        <h1 className="heading-lg m-0 mb-4">Cuenta</h1>
        <SinPermiso />
      </div>
    );
  }
  if (estado.error || !cuenta) {
    return (
      <div className="flex flex-col gap-4">
        <Button as="link" to="/admin/bar/cuentas" variant="ghost" className="self-start" icon={<ArrowLeft className="pd-icon" size={20} aria-hidden="true" />}>
          Cuentas
        </Button>
        <Alert tone={estado.error ? "danger" : "warning"}>{estado.error ? "No pudimos cargar la cuenta." : "Esta cuenta no existe (o todavía no se cargó ningún consumo al turno)."}</Alert>
      </div>
    );
  }

  const totales = calcularTotalesCuenta(cuenta);
  const abierta = cuenta.estado === "abierta";
  const legacy = esLegacyDividida(cuenta);
  const editable = cuentaEditable(cuenta);
  const pagadas = partesPagadas(cuenta);
  const participantes = participantesActivos(cuenta);
  const c = cuenta.cancha || {};
  const señaCobradaEnCuenta = cuenta.estado === "cerrada" && c.cobrar !== false && c.señaPagada !== true && Number(c.seña) > 0;
  const canchaCongelada = canchaPagadaEnParte(cuenta);
  const ctx = () => ({ dispositivo, cajaId: caja?.id, uid, nombre });
  const puedeCobrar = abierta && !!caja && !sinNumeros;
  const hayPagos = (cuenta.pagos || []).length > 0;
  const linkTurno = `/admin/canchas?fecha=${cuenta.fecha}&turno=${cuenta.id}`;

  // ----- Cobros -----
  const cobrar = async (hacer) => {
    if (!caja) throw new Error("Abrí la caja para cobrar");
    setOcupado(true);
    try {
      const numero = await tomar();
      const { venta, cerrada } = await hacer(numero);
      toast.success(cerrada ? `Cuenta cerrada · todos pagaron · ${venta.numero}` : `Cobrado · ${venta.numero} · ${formatPrecio(venta.total)}`);
      setDialogo(null);
      setSeleccion(new Set());
      setUltimaVenta({ venta: { ...venta, creadoEn: new Date(), estado: "ok" }, cerroCuenta: cerrada });
    } finally {
      setOcupado(false);
    }
  };
  const confirmarCobrarTodo = (calculo) => cobrar((numero) => cobrarTodo(clubId, cuenta, calculo, { ...ctx(), numero }));
  const confirmarCobrarResto = (calculo) => cobrar((numero) => cobrarRestoAlTitular(clubId, cuenta, calculo, { ...ctx(), numero }));
  const confirmarCobrarA = (participanteId, calculo) => cobrar((numero) => cobrarParticipantes(clubId, cuenta, [participanteId], calculo, { ...ctx(), numero }));
  const confirmarCobrarSel = (lineaIds, pagadorId, calculo) => cobrar((numero) => cobrarLineas(clubId, cuenta, lineaIds, pagadorId, calculo, { ...ctx(), numero }));
  const confirmarCobrarParte = (parteId, calculo) => cobrar((numero) => cobrarParte(clubId, cuenta, parteId, calculo, { ...ctx(), numero }));

  // ----- Consumos -----
  const avisarError = (e, texto) => {
    console.error(texto, e);
    toast.error(e instanceof CuentaNoEditableError || e instanceof CuentaCerradaError ? e.message : e?.code === "permission-denied" ? "Sin permiso." : e?.message || texto);
  };
  const quitar = async (linea) => {
    try {
      await quitarItemDeCuenta(clubId, cuenta.id, linea.lineaId);
      toast.success("Consumo quitado");
    } catch (e) {
      avisarError(e, "No pudimos quitar el consumo.");
    }
  };
  const cambiarCobrarCancha = async (valor) => {
    try {
      await setCobrarCancha(clubId, cuenta.id, valor);
    } catch (e) {
      avisarError(e, "No pudimos guardar el cambio.");
    }
  };
  const asignar = async (lineaIds, asignadoA) => {
    await asignarLineasCuenta(clubId, cuenta.id, lineaIds, asignadoA);
    toast.success(asignadoA.length === 0 ? "Queda entre todos" : asignadoA.length === 1 ? `Asignado a ${participantes.find((p) => p.id === asignadoA[0])?.nombre || "una persona"}` : `Compartido entre ${asignadoA.length}`);
    setDialogo(null);
    setSeleccion(new Set());
  };
  const alternarSeleccion = (lineaId) =>
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (next.has(lineaId)) next.delete(lineaId);
      else next.add(lineaId);
      return next;
    });
  const seleccionadas = (cuenta.items || []).filter((it) => seleccion.has(it.lineaId));
  const totalSeleccion = cobroDeLineas(cuenta, [...seleccion], saldos?.titularId || null, { saldos }).total;

  // ----- Participantes -----
  const excluir = async (p, excluir) => {
    try {
      await actualizarParticipante(clubId, cuenta.id, p.id, { excluirCancha: excluir });
      toast.success(excluir ? `${p.nombre} no paga cancha` : `${p.nombre} vuelve a pagar cancha`);
    } catch (e) {
      avisarError(e, "No pudimos guardar el cambio.");
    }
  };
  const fijar = async (p, monto) => {
    await actualizarParticipante(clubId, cuenta.id, p.id, { canchaFija: monto });
    toast.success(monto === null ? `${p.nombre}: parte igual de cancha` : `${p.nombre}: cancha ${formatPrecio(monto)}`);
  };
  const quitarP = async (p) => {
    const ok = await confirmar({ titulo: `¿Quitar a ${p.nombre}?`, mensaje: "Sus consumos quedan sin asignar (se reparten entre los demás).", confirmText: "Quitar", danger: true });
    if (!ok) return;
    try {
      await quitarParticipante({ clubId, grupoId: cuenta.id, participanteId: p.id });
      toast.success(`${p.nombre} quitado del turno`);
    } catch (e) {
      avisarError(e, "No pudimos quitar a esa persona.");
    }
  };

  const guardarLaDivision = async (division) => {
    await guardarDivision(clubId, cuenta.id, division);
    toast.success("División guardada");
    setDialogo(null);
  };
  const verTicketCuenta = (cu = cuenta) => setTicketCuenta(htmlTicketCuenta({ club: clubActual, cuenta: cu, clubId }));
  const parteCobrando = legacy && dialogo && typeof dialogo === "object" && dialogo.parteId ? (cuenta.division?.partes || []).find((p) => p.parteId === dialogo.parteId) : null;
  const participanteCobrando = dialogo?.tipo === "cobrarA" ? saldos?.participantes.find((p) => p.id === dialogo.participanteId) : null;
  const restoTotal = saldos && !saldos.legacy ? cobroRestoAlTitular(cuenta, { saldos }).total : 0;
  const alguienDebe = !!saldos && !saldos.legacy && saldos.participantes.some((p) => p.debe > 0);
  const puedeCobrarTodo = abierta && (saldos?.pendiente || 0) > 0 && ((cuenta.items?.length || 0) > 0 || totales.cancha > 0);

  return (
    <div className="flex flex-col gap-6 max-w-[1100px]">
      <div className="flex flex-col gap-2">
        <Link to="/admin/bar/cuentas" className="body-sm text-ink-2 inline-flex items-center gap-1 hover:underline self-start">
          <ArrowLeft className="pd-icon" size={16} aria-hidden="true" /> Cuentas
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="pd-eyebrow m-0">
              {formatDiaCorto(cuenta.fecha)} · {cuenta.canchaNombre} · {cuenta.horaInicio}
              {cuenta.horaFin ? `–${cuenta.horaFin}` : ""}
            </p>
            <h1 className="heading-lg m-0 break-words">{cuenta.nombreJugador || "Sin nombre"}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={TONO_ESTADO[cuenta.estado] || "neutral"} dot={abierta}>
              {ETIQUETA_ESTADO[cuenta.estado] || cuenta.estado}
            </Badge>
            {!legacy && participantes.length > 1 && <Badge>{`${participantes.length} participantes`}</Badge>}
            {!legacy && hayPagos && <Badge tone={saldos.pendiente > 0 ? "warning" : "success"} className="pd-tnum">{`Pagado ${formatPrecio(saldos.pagadoTotal)} de ${formatPrecio(saldos.totalCuenta)}`}</Badge>}
            {legacy && cuenta.division?.partes?.length ? <Badge>{`${pagadas}/${cuenta.division.partes.length} partes pagadas`}</Badge> : null}
            {Number(cuenta.pedidosPendientes) > 0 && (
              <Link to="/admin/bar/barra" className="pd-badge pd-badge-warning">
                {cuenta.pedidosPendientes === 1 ? "1 pedido en espera" : `${cuenta.pedidosPendientes} pedidos en espera`}
              </Link>
            )}
            <Button as="link" to={linkTurno} size="sm" variant="ghost" icon={<CalendarDays className="pd-icon" size={20} aria-hidden="true" />}>
              Ver turno
            </Button>
          </div>
        </div>
      </div>

      {cuenta.estado === "anulada" && (
        <Alert tone="danger">
          <strong>Anulada</strong>
          {cuenta.anulacion?.porNombre ? ` por ${cuenta.anulacion.porNombre}` : ""}
          {cuenta.anulacion?.motivo ? `: ${cuenta.anulacion.motivo}` : ""}
          {cuenta.cerradaEn ? ` · ${formatFechaHora(cuenta.cerradaEn)}` : ""}
        </Alert>
      )}
      {cuenta.estado === "cerrada" && (
        <Alert tone="success">
          Cerrada {formatFechaHora(cuenta.cerradaEn)}
          {(cuenta.ventas || []).length ? ` · ventas ${cuenta.ventas.join(", ")}` : ""}
        </Alert>
      )}
      {abierta && !caja && (
        <Alert tone="warning">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              <strong>Abrí la caja para cobrar.</strong> Las ventas de este dispositivo ({dispositivo}) entran en su caja.
            </span>
            <Button as="link" to="/admin/bar/caja" size="sm">
              Ir a Caja
            </Button>
          </div>
        </Alert>
      )}
      {abierta && legacy && !editable && <Alert>Cuenta dividida (modo anterior): ya hay partes cobradas, los consumos y la división no se cambian más. Cobrá las partes que faltan.</Alert>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="flex flex-col gap-6 min-w-0">
          {/* Participantes */}
          {!legacy && (
            <ParticipantesPanel
              saldos={saldos}
              abierta={abierta}
              puedeCobrar={puedeCobrar}
              puedeEditar={abierta}
              ocupado={ocupado}
              onCobrar={(p) => setDialogo({ tipo: "cobrarA", participanteId: p.id })}
              onSumar={() => setDialogo("sumar")}
              onExcluir={excluir}
              onFijo={fijar}
              onQuitar={quitarP}
            />
          )}

          {/* Cancha: un libro */}
          <Card>
            <Card.Row>
              <Card.Title as="h2">Cancha</Card.Title>
              <span className="numeral-md pd-tnum">{formatPrecio(c.precioTotal)}</span>
            </Card.Row>
            <dl className="pd-dl mt-3">
              <div>
                <dt>Turno</dt>
                <dd>
                  {cuenta.canchaNombre} · {cuenta.horaInicio}
                  {cuenta.horaFin ? `–${cuenta.horaFin}` : ""} ({cuenta.turnos || 1} {cuenta.turnos === 1 ? "hora" : "horas"})
                </dd>
              </div>
              <div>
                <dt>Seña</dt>
                <dd className="flex items-center gap-2">
                  <span className="pd-tnum">{Number(c.seña) > 0 ? formatPrecio(c.seña) : "Sin seña"}</span>
                  {Number(c.seña) > 0 && (
                    <Badge tone={c.señaPagada || señaCobradaEnCuenta ? "success" : "warning"}>{señaCobradaEnCuenta ? "pagada con la cuenta" : c.señaPagada ? "pagada" : "pendiente"}</Badge>
                  )}
                  {Number(c.seña) > 0 && c.señaPagada && !legacy && <span className="body-sm text-ink-3">a favor de {cuenta.nombreJugador || "quien reservó"}</span>}
                </dd>
              </div>
              {!legacy && c.cobrar !== false && saldos?.reparto && (
                <div>
                  <dt>Cómo se reparte</dt>
                  <dd className="pd-tnum">{textoReparto(saldos) || "—"}</dd>
                </div>
              )}
            </dl>
            <label className={["pd-check mt-4", (!abierta || canchaCongelada || (legacy && !editable)) && "opacity-50 cursor-not-allowed!"].filter(Boolean).join(" ")}>
              <input type="checkbox" checked={c.cobrar !== false} disabled={!abierta || canchaCongelada || (legacy && !editable)} onChange={(e) => cambiarCobrarCancha(e.target.checked)} />
              Cobrar la cancha en esta cuenta
            </label>
            <p className="pd-help mt-1 mb-0">
              {c.cobrar === false
                ? "La cancha se cobró (o se cobra) por otro lado: la cuenta solo lleva los consumos."
                : canchaCongelada && abierta
                  ? "Alguien ya pagó su parte de cancha: la cancha se cobra en esta cuenta."
                  : señaCobradaEnCuenta
                    ? "La seña se cobró con la cancha en esta cuenta: la reserva quedó con la seña pagada."
                    : c.señaPagada && Number(c.seña) > 0
                      ? "La seña ya pagada se descuenta de la parte del titular; si sobra, baja la de los demás."
                      : Number(c.seña) > 0
                        ? "La seña está pendiente: se cobra junto con la cancha y la reserva queda con la seña pagada."
                        : "Se cobra el precio completo de la cancha, repartido entre los participantes."}
            </p>
          </Card>

          {/* Bar: el otro libro */}
          <Card className="p-0!">
            <div className="pd-table-head">
              <h3>
                Bar<span className="pd-count">{(cuenta.items || []).length}</span>
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                {!legacy && (cuenta.items || []).length > 0 && (
                  <span className="body-sm text-ink-2 pd-tnum">
                    {formatPrecio(totales.consumos)} · asignado {formatPrecio(saldos.asignadoTotal)} · sin asignar {formatPrecio(saldos.sinAsignarTotal)}
                  </span>
                )}
                {abierta && (!legacy || editable) && (
                  <Button size="sm" icon={<Plus className="pd-icon" size={20} aria-hidden="true" />} onClick={() => navigate(`/admin/bar/vender?cuenta=${cuenta.id}`)}>
                    Agregar
                  </Button>
                )}
              </div>
            </div>
            {!legacy && abierta && seleccion.size > 0 && (
              <div className="px-4 py-2 border-b border-line flex flex-wrap items-center gap-2 bg-court-soft">
                <span className="body-sm font-semibold pd-tnum">
                  {seleccion.size} {seleccion.size === 1 ? "línea" : "líneas"} · {formatPrecio(totalSeleccion)}
                </span>
                <div className="pd-btn-group ml-auto">
                  <Button size="sm" variant="primary" disabled={!puedeCobrar || ocupado || totalSeleccion <= 0} onClick={() => setDialogo({ tipo: "quienPaga", lineaIds: [...seleccion] })}>
                    Cobrar seleccionados
                  </Button>
                  <Button size="sm" onClick={() => setDialogo({ tipo: "asignar", lineaIds: [...seleccion] })}>
                    Asignar a…
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSeleccion(new Set())}>
                    Limpiar
                  </Button>
                </div>
              </div>
            )}
            {(cuenta.items || []).length === 0 ? (
              <p className="body-sm text-ink-2 m-0 px-4 pb-4">Sin consumos todavía.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="pd-table">
                  <thead>
                    <tr>
                      {!legacy && abierta && (
                        <th>
                          <span className="sr-only">Seleccionar</span>
                        </th>
                      )}
                      <th>Hora</th>
                      <th>Consumo</th>
                      <th className="num">Cant.</th>
                      <th className="num">Subtotal</th>
                      {!legacy && <th>Para</th>}
                      <th>Cargó</th>
                      {abierta && (!legacy || editable) && (
                        <th>
                          <span className="sr-only">Quitar</span>
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {cuenta.items.map((it) => {
                      const pagada = lineaPagada(cuenta, it.lineaId);
                      return (
                        <tr key={it.lineaId}>
                          {!legacy && abierta && (
                            <td>
                              <label className="pd-check">
                                <input type="checkbox" checked={seleccion.has(it.lineaId)} disabled={pagada} onChange={() => alternarSeleccion(it.lineaId)} aria-label={`Seleccionar ${it.nombre}`} />
                              </label>
                            </td>
                          )}
                          <td className="pd-tnum whitespace-nowrap">{formatHora(it.agregadoEn)}</td>
                          <td>
                            <span className="font-semibold">{it.nombre}</span>
                            <span className="block body-sm text-ink-3 pd-tnum">
                              {formatPrecio(it.precio)} c/u{it.descuento > 0 ? ` · desc. −${formatPrecio(it.descuento)}` : ""}
                            </span>
                            {it.pedidoId && (
                              <span className="inline-flex items-center gap-1 body-sm text-ink-3">
                                <MessageSquare className="pd-icon" size={14} aria-hidden="true" />
                                pedido de {it.pedidoPor || "—"}
                              </span>
                            )}
                          </td>
                          <td className="num">{fmtCant(it.cantidad)}</td>
                          <td className="num pd-tnum font-semibold">{formatPrecio(it.subtotal)}</td>
                          {!legacy && (
                            <td>
                              <span className="flex items-center gap-2">
                                <ChipsParticipantes asignadoA={it.asignadoA} participantes={participantes} onClick={abierta && !pagada ? () => setDialogo({ tipo: "asignar", lineaIds: [it.lineaId] }) : undefined} />
                                {pagada && <Badge tone="success">Pagada</Badge>}
                              </span>
                            </td>
                          )}
                          <td>{it.agregadoPor === uid ? "Vos" : it.agregadoPorNombre || "—"}</td>
                          {abierta && (!legacy || editable) && (
                            <td className="num">
                              {!pagada && <Button variant="ghost" size="sm" iconOnly aria-label={`Quitar ${it.nombre}`} icon={<X className="pd-icon" size={20} aria-hidden="true" />} onClick={() => quitar(it)} />}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Legacy P3-4: división en partes */}
          {legacy && cuenta.division?.partes?.length > 0 && (
            <Card className="p-0!">
              <div className="pd-table-head">
                <h3>
                  División{cuenta.division.modo === "total" ? " en partes iguales" : " · cada uno lo suyo"}
                  <span className="pd-count">
                    {pagadas}/{cuenta.division.partes.length} pagadas
                  </span>
                </h3>
                {abierta && editable && (
                  <Button size="sm" variant="ghost" onClick={() => setDialogo("dividir")}>
                    Cambiar
                  </Button>
                )}
              </div>
              <ul className="m-0 p-0 list-none divide-y divide-line">
                {cuenta.division.partes.map((p) => (
                  <li key={p.parteId} className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold m-0 break-words">{p.nombre}</p>
                      <p className="body-sm text-ink-2 m-0 pd-tnum">
                        Consumos {formatPrecio(p.consumos)}
                        {p.cancha ? ` · cancha ${formatPrecio(p.cancha)}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold pd-tnum">{formatPrecio(p.total)}</span>
                      {partePagada(p) ? (
                        <Badge tone="success" className="pd-tnum">
                          Pagado · {p.ventaNumero}
                        </Badge>
                      ) : abierta ? (
                        <Button size="sm" variant="primary" disabled={!caja || sinNumeros || ocupado} onClick={() => setDialogo({ parteId: p.parteId })}>
                          Cobrar
                        </Button>
                      ) : (
                        <Badge tone="warning">Pendiente</Badge>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Pagos registrados */}
          {!legacy && hayPagos && (
            <Card className="p-0!">
              <div className="pd-table-head">
                <h3>
                  Pagos<span className="pd-count">{cuenta.pagos.length}</span>
                </h3>
              </div>
              <ul className="m-0 p-0 list-none divide-y divide-line">
                {cuenta.pagos.map((pg) => {
                  const nombresDe = (ids) => (ids || []).map((pid) => participantes.find((p) => p.id === pid)?.nombre || "—");
                  const pagaron = nombresDe(pg.participanteIds);
                  const cubre = nombresDe(pg.cubreA).filter((n) => !pagaron.includes(n));
                  return (
                    <li key={pg.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold m-0">
                          {pagaron.join(", ") || "—"}
                          {cubre.length ? <span className="body-sm text-ink-2 font-normal"> · también por {cubre.join(", ")}</span> : null}
                        </p>
                        <p className="body-sm text-ink-2 m-0 pd-tnum">
                          {pg.ventaNumero} · {(pg.medios || []).map((m) => m.medio).join(" + ") || "—"} · {formatFechaHora(pg.en)}
                        </p>
                      </div>
                      <span className="font-semibold pd-tnum">{formatPrecio(pg.total)}</span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </div>

        {/* Totales y acciones */}
        <aside className="pd-card flex flex-col gap-3 lg:sticky lg:top-6" aria-label="Totales">
          <dl className="m-0 grid gap-2">
            <div className="flex items-center justify-between body-sm text-ink-2">
              <dt>Bar</dt>
              <dd className="m-0 pd-tnum">{formatPrecio(totales.consumos)}</dd>
            </div>
            <div className="flex items-center justify-between body-sm text-ink-2">
              <dt>Cancha</dt>
              <dd className="m-0 pd-tnum">{totales.cancha > 0 ? formatPrecio(totales.cancha) : "—"}</dd>
            </div>
            {totales.seña > 0 && (
              <div className="flex items-center justify-between body-sm text-ink-2">
                <dt>Seña pagada</dt>
                <dd className="m-0 pd-tnum">−{formatPrecio(totales.seña)}</dd>
              </div>
            )}
            <div className="flex items-end justify-between gap-2 pt-2 border-t border-line">
              <dt className="heading-sm">Total</dt>
              <dd className="m-0 numeral-lg pd-tnum">{formatPrecio(totales.total)}</dd>
            </div>
            {saldos && (hayPagos || legacy) && (
              <>
                <div className="flex items-center justify-between body-sm text-ink-2">
                  <dt>Pagado</dt>
                  <dd className="m-0 pd-tnum">{formatPrecio(saldos.pagadoTotal)}</dd>
                </div>
                <div className="flex items-center justify-between body-sm font-semibold">
                  <dt>Pendiente</dt>
                  <dd className="m-0 pd-tnum">{formatPrecio(saldos.pendiente)}</dd>
                </div>
              </>
            )}
          </dl>
          {abierta && (
            <div className="flex flex-col gap-2 mt-1">
              {!legacy && (
                <Button variant="primary" className="w-full h-12!" disabled={!puedeCobrarTodo || !puedeCobrar || ocupado} onClick={() => setDialogo("cobrarTodo")}>
                  {hayPagos ? `Cobrar lo que falta ${formatPrecio(saldos.pendiente)}` : "Cobrar todo"}
                </Button>
              )}
              {!legacy && hayPagos && alguienDebe && (
                <Button className="w-full" disabled={!puedeCobrar || ocupado || restoTotal <= 0} onClick={() => setDialogo("cobrarResto")}>
                  Cobrar el resto al titular
                </Button>
              )}
              {puedeAnular && !hayPagos && pagadas === 0 && (
                <Button variant="ghost" className="w-full" onClick={() => setDialogo("anular")}>
                  Anular cuenta
                </Button>
              )}
              {sinNumeros && <p className="pd-error m-0">Sin números de ticket: conectate a internet un momento.</p>}
            </div>
          )}
          <Button variant="ghost" className="w-full" icon={<Printer className="pd-icon" size={20} aria-hidden="true" />} onClick={() => verTicketCuenta()}>
            {abierta ? "Imprimir pre-cuenta" : "Reimprimir cuenta"}
          </Button>
        </aside>
      </div>

      {dialogo === "cobrarTodo" && <CobrarDialog total={saldos.pendiente} sinNumeros={sinNumeros} onCerrar={() => setDialogo(null)} onConfirmar={confirmarCobrarTodo} />}
      {dialogo === "cobrarResto" && <CobrarDialog total={restoTotal} sinNumeros={sinNumeros} onCerrar={() => setDialogo(null)} onConfirmar={confirmarCobrarResto} />}
      {participanteCobrando && <CobrarDialog total={participanteCobrando.debe} sinNumeros={sinNumeros} onCerrar={() => setDialogo(null)} onConfirmar={(calculo) => confirmarCobrarA(participanteCobrando.id, calculo)} />}
      {dialogo?.tipo === "quienPaga" && (
        <QuienPagaDialog participantes={participantes} titularId={saldos?.titularId} total={totalSeleccion} onCerrar={() => setDialogo(null)} onElegir={(pagadorId) => setDialogo({ tipo: "cobrarSel", lineaIds: dialogo.lineaIds, pagadorId })} />
      )}
      {dialogo?.tipo === "cobrarSel" && (
        <CobrarDialog total={cobroDeLineas(cuenta, dialogo.lineaIds, dialogo.pagadorId, { saldos }).total} sinNumeros={sinNumeros} onCerrar={() => setDialogo(null)} onConfirmar={(calculo) => confirmarCobrarSel(dialogo.lineaIds, dialogo.pagadorId, calculo)} />
      )}
      {dialogo?.tipo === "asignar" && (
        <AsignarSheet lineas={(cuenta.items || []).filter((it) => dialogo.lineaIds.includes(it.lineaId))} participantes={participantes} onCerrar={() => setDialogo(null)} onGuardar={(ids) => asignar(dialogo.lineaIds, ids)} />
      )}
      {dialogo === "sumar" && (
        <SumarJugadorDialog clubId={clubId} grupoId={cuenta.id} clubNombre={clubActual?.nombre} turno={{ fecha: cuenta.fecha, horaInicio: cuenta.horaInicio, horaFin: cuenta.horaFin, canchaNombre: cuenta.canchaNombre }} participantes={participantes} onCerrar={() => setDialogo(null)} />
      )}
      {dialogo === "anular" && (
        <AnularCuentaDialog
          cuenta={cuenta}
          clubId={clubId}
          uid={uid}
          nombre={nombre}
          onCerrar={() => setDialogo(null)}
          onAnulada={() => {
            setDialogo(null);
            navigate("/admin/bar/cuentas");
          }}
        />
      )}
      {dialogo === "dividir" && legacy && <DividirDialog cuenta={cuenta} onCerrar={() => setDialogo(null)} onGuardar={guardarLaDivision} />}
      {parteCobrando && <CobrarDialog total={parteCobrando.total} sinNumeros={sinNumeros} onCerrar={() => setDialogo(null)} onConfirmar={(calculo) => confirmarCobrarParte(parteCobrando.parteId, calculo)} />}
      {seleccionadas.length === 0 && null}
      {ultimaVenta && (
        <PostVentaDialog
          venta={ultimaVenta.venta}
          club={clubActual}
          clubId={clubId}
          ancho={ancho}
          imprimirDirecto={false}
          accionesExtra={
            ultimaVenta.cerroCuenta ? (
              <Button
                onClick={() => {
                  setUltimaVenta(null);
                  verTicketCuenta({ ...cuenta, estado: "cerrada", ventas: [...new Set([...(cuenta.ventas || []), ultimaVenta.venta.numero])] });
                }}
              >
                Imprimir cuenta completa
              </Button>
            ) : null
          }
          onCerrar={() => setUltimaVenta(null)}
        />
      )}
      {ticketCuenta && <TicketPreview titulo="Cuenta del turno" descripcion={textoTurno(cuenta)} html={ticketCuenta} ancho={ancho} onCerrar={() => setTicketCuenta(null)} />}
    </div>
  );
}
