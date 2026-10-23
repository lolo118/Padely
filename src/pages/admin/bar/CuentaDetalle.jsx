import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, MessageSquare, Plus, Printer, X } from "lucide-react";
import { useAuthStore } from "../../../store/authStore";
import SinPermiso from "../../../components/SinPermiso";
import Dialogo from "../../../components/Dialogo";
import { toast } from "../../../components/Toast";
import { confirmar } from "../../../components/ConfirmDialog";
import { Alert, Badge, Button, Card, Field, Input } from "../../../components/ui";
import CobrarDialog from "../../../components/pos/CobrarDialog";
import PostVentaDialog from "../../../components/pos/PostVentaDialog";
import DividirDialog from "../../../components/pos/DividirDialog";
import TicketPreview from "../../../components/TicketPreview";
import useNumeracion from "../../../components/pos/useNumeracion";
import { htmlTicketCuenta } from "../../../print/ticketCuenta";
import { anchoTicketGuardado } from "../../../print/imprimir";
import { dispositivoGuardado, escucharCajaAbierta } from "../../../services/cajaService";
import { CuentaNoEditableError, anularCuenta, cobrarParte, cobrarTodo, escucharCuenta, guardarDivision, quitarItemDeCuenta, setCobrarCancha } from "../../../services/cuentasService";
import { useOnline } from "../../../utils/conexion";
import { calcularTotalesCuenta, cuentaEditable, partePagada, partesPagadas, textoTurno } from "../../../utils/cuentas";
import { formatPrecio } from "../../../utils/format";
import { formatDiaCorto, formatFechaHora, formatHora } from "../../../utils/formatDate";

// Detalle de una cuenta del turno: cancha + seña + consumos, totales, y cerrar (cobrar todo, dividir, anular).
// Las ventas que cierran la cuenta salen de la caja abierta de ESTE dispositivo, como en Vender.

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
  const [dialogo, setDialogo] = useState(null); // "cobrarTodo" | "anular" | "dividir" | { parteId }
  const [ultimaVenta, setUltimaVenta] = useState(null); // { venta, cerroCuenta }
  const [ticketCuenta, setTicketCuenta] = useState(null); // html de la cuenta a previsualizar
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
  const editable = cuentaEditable(cuenta);
  const pagadas = partesPagadas(cuenta);
  const c = cuenta.cancha || {};
  // Cuenta cerrada que cobró la cancha con la seña pendiente: la seña se cobró acá y la Function dejó la reserva con
  // señaPagada (cuenta.cancha.señaPagada es la foto de cuando se abrió la cuenta, por eso no se mira sola)
  const señaCobradaEnCuenta = cuenta.estado === "cerrada" && c.cobrar !== false && c.señaPagada !== true && Number(c.seña) > 0;
  const ctx = () => ({ dispositivo, cajaId: caja?.id, uid, nombre });

  const quitar = async (linea) => {
    try {
      await quitarItemDeCuenta(clubId, cuenta.id, linea.lineaId);
      toast.success("Consumo quitado");
    } catch (e) {
      console.error("Error quitando el consumo:", e);
      toast.error(e instanceof CuentaNoEditableError ? e.message : "No pudimos quitar el consumo.");
    }
  };
  const cambiarCobrarCancha = async (valor) => {
    try {
      await setCobrarCancha(clubId, cuenta.id, valor);
    } catch (e) {
      console.error("Error cambiando el cobro de la cancha:", e);
      toast.error(e instanceof CuentaNoEditableError ? e.message : "No pudimos guardar el cambio.");
    }
  };
  const confirmarCobrarTodo = async (calculo) => {
    if (!caja) throw new Error("Abrí la caja para cobrar");
    setOcupado(true);
    try {
      const numero = await tomar();
      const { venta } = await cobrarTodo(clubId, cuenta, calculo, { ...ctx(), numero });
      toast.success(`Cuenta cobrada · ${venta.numero} · ${formatPrecio(venta.total)}`);
      setDialogo(null);
      setUltimaVenta({ venta: { ...venta, creadoEn: new Date(), estado: "ok" }, cerroCuenta: true });
    } finally {
      setOcupado(false);
    }
  };
  const confirmarCobrarParte = async (parteId, calculo) => {
    if (!caja) throw new Error("Abrí la caja para cobrar");
    setOcupado(true);
    try {
      const numero = await tomar();
      const { venta, cerrada } = await cobrarParte(clubId, cuenta, parteId, calculo, { ...ctx(), numero });
      toast.success(`${cerrada ? "Cuenta cerrada" : "Parte cobrada"} · ${venta.numero} · ${formatPrecio(venta.total)}`);
      setDialogo(null);
      setUltimaVenta({ venta: { ...venta, creadoEn: new Date(), estado: "ok" }, cerroCuenta: cerrada });
    } finally {
      setOcupado(false);
    }
  };
  const guardarLaDivision = async (division) => {
    await guardarDivision(clubId, cuenta.id, division);
    toast.success("División guardada");
    setDialogo(null);
  };
  // El ticket de la cuenta se arma con la cuenta tal como está (pre-cuenta mientras sigue abierta)
  const verTicketCuenta = (c = cuenta) => setTicketCuenta(htmlTicketCuenta({ club: clubActual, cuenta: c, clubId }));
  const parteCobrando = dialogo && typeof dialogo === "object" && dialogo.parteId ? (cuenta.division?.partes || []).find((p) => p.parteId === dialogo.parteId) : null;

  const puedeCobrar = abierta && !!caja && totales.total >= 0 && (cuenta.items?.length > 0 || totales.cancha > 0);

  return (
    <div className="flex flex-col gap-6 max-w-[960px]">
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
            {cuenta.division?.partes?.length ? <Badge>{`${pagadas}/${cuenta.division.partes.length} partes pagadas`}</Badge> : null}
            {Number(cuenta.pedidosPendientes) > 0 && (
              <Link to="/admin/bar/barra" className="pd-badge pd-badge-warning">
                {cuenta.pedidosPendientes === 1 ? "1 pedido en espera" : `${cuenta.pedidosPendientes} pedidos en espera`}
              </Link>
            )}
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
      {abierta && !editable && <Alert>Ya hay partes cobradas: los consumos, la cancha y la división no se cambian más. Cobrá las partes que faltan.</Alert>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="flex flex-col gap-6 min-w-0">
          {/* Cancha */}
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
                </dd>
              </div>
            </dl>
            <label className={["pd-check mt-4", !editable && "opacity-50 cursor-not-allowed!"].filter(Boolean).join(" ")}>
              <input type="checkbox" checked={c.cobrar !== false} disabled={!editable} onChange={(e) => cambiarCobrarCancha(e.target.checked)} />
              Cobrar la cancha en esta cuenta
            </label>
            <p className="pd-help mt-1 mb-0">
              {c.cobrar === false
                ? "La cancha se cobró (o se cobra) por otro lado: la cuenta solo lleva los consumos."
                : señaCobradaEnCuenta
                  ? "La seña se cobró con la cancha en esta cuenta: la reserva quedó con la seña pagada."
                  : c.señaPagada && Number(c.seña) > 0
                    ? "La seña ya pagada se descuenta de la cancha."
                    : Number(c.seña) > 0
                      ? "La seña está pendiente: se cobra junto con la cancha y la reserva queda con la seña pagada."
                      : "Se cobra el precio completo de la cancha."}
            </p>
          </Card>

          {/* Consumos */}
          <Card className="p-0!">
            <div className="pd-table-head">
              <h3>
                Consumos<span className="pd-count">{(cuenta.items || []).length}</span>
              </h3>
              {abierta && editable && (
                <Button size="sm" icon={<Plus className="pd-icon" size={20} aria-hidden="true" />} onClick={() => navigate(`/admin/bar/vender?cuenta=${cuenta.id}`)}>
                  Agregar
                </Button>
              )}
            </div>
            {(cuenta.items || []).length === 0 ? (
              <p className="body-sm text-ink-2 m-0 px-4 pb-4">Sin consumos todavía.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="pd-table">
                  <thead>
                    <tr>
                      <th>Hora</th>
                      <th>Consumo</th>
                      <th className="num">Cant.</th>
                      <th className="num">Subtotal</th>
                      <th>Quién</th>
                      {abierta && editable && (
                        <th>
                          <span className="sr-only">Quitar</span>
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {cuenta.items.map((it) => (
                      <tr key={it.lineaId}>
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
                        <td>{it.agregadoPor === uid ? "Vos" : it.agregadoPorNombre || "—"}</td>
                        {abierta && editable && (
                          <td className="num">
                            <Button variant="ghost" size="sm" iconOnly aria-label={`Quitar ${it.nombre}`} icon={<X className="pd-icon" size={20} aria-hidden="true" />} onClick={() => quitar(it)} />
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* División: una fila por parte, cada una se cobra por separado */}
          {cuenta.division?.partes?.length > 0 && (
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
                        {p.items?.length ? ` · ${p.items.length} propios` : ""}
                        {p.compartidos?.length ? ` · ${p.compartidos.length} compartidos` : ""}
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
        </div>

        {/* Totales y acciones */}
        <aside className="pd-card flex flex-col gap-3 lg:sticky lg:top-6" aria-label="Totales">
          <dl className="m-0 grid gap-2">
            <div className="flex items-center justify-between body-sm text-ink-2">
              <dt>Consumos</dt>
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
          </dl>
          {abierta && (
            <div className="flex flex-col gap-2 mt-1">
              {!cuenta.division?.partes?.length && (
                <Button variant="primary" className="w-full h-12!" disabled={!puedeCobrar || sinNumeros || ocupado} onClick={() => setDialogo("cobrarTodo")}>
                  Cobrar todo
                </Button>
              )}
              {editable && !cuenta.division?.partes?.length && (
                <Button className="w-full" disabled={totales.total <= 0} onClick={() => setDialogo("dividir")}>
                  Dividir entre jugadores
                </Button>
              )}
              {puedeAnular && pagadas === 0 && (
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

      {dialogo === "cobrarTodo" && <CobrarDialog total={totales.total} sinNumeros={sinNumeros} onCerrar={() => setDialogo(null)} onConfirmar={confirmarCobrarTodo} />}
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
      {dialogo === "dividir" && <DividirDialog cuenta={cuenta} onCerrar={() => setDialogo(null)} onGuardar={guardarLaDivision} />}
      {parteCobrando && (
        <CobrarDialog total={parteCobrando.total} sinNumeros={sinNumeros} onCerrar={() => setDialogo(null)} onConfirmar={(calculo) => confirmarCobrarParte(parteCobrando.parteId, calculo)} />
      )}
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
