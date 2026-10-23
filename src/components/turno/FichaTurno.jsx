import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Check, MessageCircle, ReceiptText, ShoppingBag, X } from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuthStore } from "../../store/authStore";
import { Alert, Badge, Button, Card } from "../ui";
import { toast } from "../Toast";
import { confirmar } from "../ConfirmDialog";
import { actualizarReservaGrupo, cancelarReservaGrupo, getContactoReserva, marcarSeñaPagada } from "../../services/canchaService";
import { notificarReservaConfirmada, notificarReservaRechazada } from "../../services/notificationService";
import { abrirCuentaDelTurno, escucharCuenta } from "../../services/cuentasService";
import { escucharPedidosDeCuenta } from "../../services/pedidosService";
import { calcularTotalesCuenta, iniciales, saldosDeCuenta } from "../../utils/cuentas";
import { ESTADOS_ACTIVOS, etiquetaEstado, resumenItems, tonoEstado } from "../../utils/pedidos";
import { estadoSeña, normalizarReserva, rangoHoras } from "../../utils/reservas";
import { telefonoWhatsApp } from "../../utils/ventas";
import { formatPrecio } from "../../utils/format";
import { formatDiaCorto } from "../../utils/formatDate";

// Ficha del turno: todo lo de una reserva en un panel lateral (≥ md) u hoja inferior (teléfono). Cabecera (cancha ·
// fecha · hora, titular, WhatsApp, estado, seña), la cuenta (total, cancha vs bar, participantes con Pagó/Debe,
// "Abrir cuenta" / "Crear cuenta" / "Cobrar"), los pedidos en curso ("Ver en Barra") y las acciones del turno
// (confirmar, cancelar, seña cobrada). Se abre desde Canchas, Hoy, Vender, Barra y Cuentas; deep link
// /admin/canchas?fecha=YYYY-MM-DD&turno=<grupoId>.
//   reserva: agrupada (id = grupoId) · o grupoId (se lee reservas/{grupoId}) · onCambio(cambios) · onCerrar
const ESTADO_RESERVA = {
  confirmada: { tone: "success", label: "Confirmada" },
  pendiente: { tone: "warning", label: "Pendiente" },
  cancelada: { tone: "danger", label: "Cancelada" },
  bloqueado: { tone: "neutral", label: "Bloqueado" },
};

export default function FichaTurno({ clubId, club, reserva: reservaProp = null, grupoId: grupoIdProp = null, onCambio, onCerrar }) {
  const puede = useAuthStore((s) => s.puede);
  const user = useAuthStore((s) => s.user);
  const perfil = useAuthStore((s) => s.perfil);
  const puedeReservas = puede("gestionarReservas");
  const puedeCuentas = puede("cobrarTurnos") || puede("vender");
  const puedePedidos = puede("pedidos") || puedeCuentas;
  const uid = user?.uid || null;
  const nombre = perfil?.nombre || user?.displayName || user?.email || "";
  const [reservaLeida, setReservaLeida] = useState(null);
  const [cuenta, setCuenta] = useState({ para: null, valor: null });
  const [pedidos, setPedidos] = useState([]);
  const [contacto, setContacto] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const panel = useRef(null);
  const tituloId = useId();

  const reserva = reservaProp || reservaLeida;
  const grupoId = reservaProp ? reservaProp.grupoId || reservaProp.id : grupoIdProp;

  // Sin reserva en mano (desde Barra): se lee la cabeza del grupo
  useEffect(() => {
    if (reservaProp || !clubId || !grupoIdProp) return undefined;
    let vivo = true;
    getDoc(doc(db, "clubs", clubId, "reservas", grupoIdProp))
      .then((snap) => vivo && setReservaLeida(snap.exists() ? normalizarReserva({ id: snap.id, clubId, ...snap.data() }) : null))
      .catch((err) => console.error("Error leyendo el turno:", err));
    return () => {
      vivo = false;
    };
  }, [clubId, grupoIdProp, reservaProp]);

  useEffect(() => {
    if (!clubId || !grupoId || !puedeCuentas) return undefined;
    const unsub = escucharCuenta(clubId, grupoId, (c) => setCuenta({ para: grupoId, valor: c }), (err) => console.error("Error leyendo la cuenta del turno:", err));
    return () => unsub();
  }, [clubId, grupoId, puedeCuentas]);

  useEffect(() => {
    if (!clubId || !grupoId || !puedePedidos) return undefined;
    const unsub = escucharPedidosDeCuenta(clubId, grupoId, setPedidos, (err) => console.error("Error leyendo los pedidos del turno:", err));
    return () => unsub();
  }, [clubId, grupoId, puedePedidos]);

  useEffect(() => {
    if (!clubId || !grupoId || !puedeReservas) return undefined;
    let vivo = true;
    getContactoReserva(clubId, grupoId)
      .then((c) => vivo && setContacto(c))
      .catch((err) => console.error("Error leyendo el contacto:", err));
    return () => {
      vivo = false;
    };
  }, [clubId, grupoId, puedeReservas]);

  // Escape cierra; el foco entra al panel y vuelve al disparador
  useEffect(() => {
    const previo = document.activeElement;
    panel.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") onCerrar?.();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (previo && typeof previo.focus === "function" && document.contains(previo)) previo.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const laCuenta = cuenta.para === grupoId ? cuenta.valor : null;
  const saldos = useMemo(() => (laCuenta ? saldosDeCuenta(laCuenta) : null), [laCuenta]);
  const totales = laCuenta ? calcularTotalesCuenta(laCuenta) : null;
  const activos = pedidos.filter((p) => ESTADOS_ACTIVOS.includes(p.estado));
  const telefono = telefonoWhatsApp(contacto?.telefono);
  const seña = reserva ? estadoSeña(reserva) : null;
  const estado = reserva ? ESTADO_RESERVA[reserva.status] || { tone: "warning", label: reserva.status || "—" } : null;

  const hacer = async (fn, ok) => {
    setOcupado(true);
    try {
      const cambios = await fn();
      toast.success(ok);
      onCambio?.(cambios || {});
      if (cambios && !reservaProp) setReservaLeida((r) => (r ? { ...r, ...cambios } : r));
    } catch (err) {
      console.error(err);
      toast.error("No pudimos guardar el cambio. Intentá de nuevo.");
    } finally {
      setOcupado(false);
    }
  };
  const confirmarReserva = () =>
    hacer(async () => {
      await actualizarReservaGrupo(clubId, grupoId, { status: "confirmada" });
      if (reserva.jugadorUid) notificarReservaConfirmada(reserva.jugadorUid, club?.nombre || "", reserva.canchaName || "", reserva.fecha, rangoHoras(reserva.horaInicio, reserva.horaFin));
      return { status: "confirmada" };
    }, "Reserva confirmada");
  const cancelarReserva = async () => {
    const ok = await confirmar({ titulo: reserva.status === "confirmada" ? "Cancelar reserva" : "Rechazar reserva", mensaje: "Se le avisará al jugador.", confirmText: reserva.status === "confirmada" ? "Cancelar reserva" : "Rechazar", cancelText: "Volver", danger: true });
    if (!ok) return;
    hacer(async () => {
      await cancelarReservaGrupo(clubId, grupoId);
      if (reserva.jugadorUid) notificarReservaRechazada(reserva.jugadorUid, club?.nombre || "", reserva.canchaName || "", reserva.fecha, rangoHoras(reserva.horaInicio, reserva.horaFin));
      return { status: "cancelada" };
    }, reserva.status === "confirmada" ? "Reserva cancelada" : "Reserva rechazada");
  };
  const alternarSeña = () =>
    hacer(async () => {
      const pagada = !reserva.señaPagada;
      await marcarSeñaPagada(clubId, grupoId, pagada);
      return { señaPagada: pagada };
    }, reserva.señaPagada ? "Seña marcada como pendiente" : "Seña marcada como cobrada");
  const crearCuenta = () =>
    hacer(async () => {
      await abrirCuentaDelTurno(clubId, grupoId, { uid, nombre, reserva });
      return null;
    }, "Cuenta del turno creada");

  const cerrarPorFondo = (e) => {
    if (e.target === e.currentTarget) onCerrar?.();
  };

  return (
    <div className="pd-backdrop z-50 md:place-items-stretch md:justify-items-end md:p-0" onClick={cerrarPorFondo}>
      <section ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={tituloId} className="pd-dialog outline-none max-w-[480px]! w-full max-h-[calc(100dvh-32px)] overflow-y-auto md:max-h-none md:h-dvh md:rounded-none! md:border-y-0! md:border-r-0! flex flex-col gap-4">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="pd-eyebrow m-0">
              {reserva ? `${reserva.canchaName || reserva.canchaNombre || "Cancha"} · ${formatDiaCorto(reserva.fecha)} · ${rangoHoras(reserva.horaInicio, reserva.horaFin)}` : "Turno"}
            </p>
            <h2 className="pd-dialog-title mb-0!" id={tituloId}>
              {reserva ? reserva.nombreJugador || "Sin nombre" : "Cargando…"}
            </h2>
            {reserva && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {estado && (
                  <Badge tone={estado.tone} dot>
                    {estado.label}
                  </Badge>
                )}
                {seña && <Badge tone={seña.tone}>{seña.tone === "success" ? "Seña cobrada" : `Seña ${formatPrecio(seña.monto)} pendiente`}</Badge>}
                {reserva.precioTotal > 0 && <span className="body-sm text-ink-2 pd-tnum">{formatPrecio(reserva.precioTotal)}</span>}
                {telefono && (
                  <a href={`https://wa.me/${telefono}`} target="_blank" rel="noopener noreferrer" className="body-sm inline-flex items-center gap-1 underline">
                    <MessageCircle className="pd-icon" size={16} aria-hidden="true" /> {contacto.telefono}
                  </a>
                )}
              </div>
            )}
          </div>
          <Button variant="ghost" size="sm" iconOnly aria-label="Cerrar" icon={<X className="pd-icon" size={20} aria-hidden="true" />} onClick={onCerrar} />
        </header>

        {reservaProp === null && grupoIdProp && reservaLeida === null && <div className="pd-skeleton h-24 rounded-lg" aria-busy="true" aria-label="Cargando el turno" />}

        {/* Cuenta */}
        {puedeCuentas && reserva && (
          <Card>
            <Card.Row>
              <Card.Title as="h3">Cuenta</Card.Title>
              {laCuenta && <Badge tone={laCuenta.estado === "abierta" ? "success" : laCuenta.estado === "anulada" ? "danger" : "neutral"} dot={laCuenta.estado === "abierta"}>{laCuenta.estado === "abierta" ? "Abierta" : laCuenta.estado === "anulada" ? "Anulada" : "Cerrada"}</Badge>}
            </Card.Row>
            {!laCuenta ? (
              <>
                <Card.Meta className="mt-2!">{reserva.cuentaCerrada ? `Cuenta cerrada · ${formatPrecio(reserva.cuentaTotal)}` : "Todavía no hay cuenta para este turno."}</Card.Meta>
                {!reserva.cuentaCerrada && reserva.status === "confirmada" && (
                  <Button className="mt-3" size="sm" onClick={crearCuenta} cargando={ocupado ? "…" : ""} icon={<ReceiptText className="pd-icon" size={20} aria-hidden="true" />}>
                    Crear cuenta
                  </Button>
                )}
              </>
            ) : (
              <>
                <dl className="pd-dl mt-3">
                  <div>
                    <dt>Total</dt>
                    <dd className="pd-tnum font-semibold">{formatPrecio(totales.total)}</dd>
                  </div>
                  <div>
                    <dt>Cancha / Bar</dt>
                    <dd className="pd-tnum">
                      {formatPrecio(Math.max(0, totales.cancha - totales.seña))} / {formatPrecio(totales.consumos)}
                    </dd>
                  </div>
                  {saldos && !saldos.legacy && saldos.pagadoTotal > 0 && (
                    <div>
                      <dt>Pagado</dt>
                      <dd className="pd-tnum">
                        {formatPrecio(saldos.pagadoTotal)} · faltan {formatPrecio(saldos.pendiente)}
                      </dd>
                    </div>
                  )}
                </dl>
                {saldos && !saldos.legacy && saldos.participantes.length > 0 && (
                  <ul className="m-0 mt-3 p-0 list-none divide-y divide-line">
                    {saldos.participantes.map((p) => (
                      <li key={p.id} className="py-2 flex items-center gap-2">
                        <span className="pd-avatar pd-avatar-sm" aria-hidden="true">
                          {iniciales(p.nombre)}
                        </span>
                        <span className="min-w-0 flex-1 truncate body-sm">{p.nombre}</span>
                        {p.debe > 0 ? <Badge tone="warning" className="pd-tnum">{`Debe ${formatPrecio(p.debe)}`}</Badge> : <Badge tone="success">{p.pagado > 0 ? "Pagó" : "Al día"}</Badge>}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="pd-btn-group mt-3">
                  <Button as="link" to={`/admin/bar/cuentas/${laCuenta.id}`} size="sm" variant={laCuenta.estado === "abierta" ? "primary" : "secondary"} icon={<ReceiptText className="pd-icon" size={20} aria-hidden="true" />}>
                    {laCuenta.estado === "abierta" ? "Abrir cuenta" : "Ver cuenta"}
                  </Button>
                  {laCuenta.estado === "abierta" && (
                    <Button as="link" to={`/admin/bar/cuentas/${laCuenta.id}`} size="sm">
                      Cobrar
                    </Button>
                  )}
                </div>
              </>
            )}
          </Card>
        )}

        {/* Pedidos */}
        {puedePedidos && reserva && (
          <Card>
            <Card.Row>
              <Card.Title as="h3">Pedidos</Card.Title>
              <Link to="/admin/bar/barra" className="body-sm underline">
                Ver en Barra
              </Link>
            </Card.Row>
            {activos.length === 0 ? (
              <Card.Meta className="mt-2!">Sin pedidos en curso.</Card.Meta>
            ) : (
              <ul className="m-0 mt-3 p-0 list-none divide-y divide-line">
                {activos.map((p) => (
                  <li key={p.id} className="py-2 flex items-center justify-between gap-2">
                    <span className="min-w-0 body-sm">
                      <strong>{p.nombre || "—"}</strong> · <span className="text-ink-2">{resumenItems(p.items)}</span>
                    </span>
                    <Badge tone={tonoEstado(p.estado)} dot={p.estado === "pendiente"}>
                      {etiquetaEstado(p.estado)}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {/* Turno */}
        {reserva && (
          <Card>
            <Card.Title as="h3">Turno</Card.Title>
            {!puedeReservas ? (
              <Card.Meta className="mt-2!">Las acciones del turno piden el permiso de reservas.</Card.Meta>
            ) : reserva.status === "cancelada" ? (
              <Card.Meta className="mt-2!">Reserva cancelada.</Card.Meta>
            ) : reserva.tipo === "torneo" ? (
              <Card.Meta className="mt-2!">Lo bloquea un torneo: lo libera la organización.</Card.Meta>
            ) : (
              <div className="pd-btn-group mt-3">
                {reserva.status === "pendiente" && (
                  <Button size="sm" icon={<Check className="pd-icon" size={20} aria-hidden="true" />} onClick={confirmarReserva} disabled={ocupado}>
                    Confirmar
                  </Button>
                )}
                {seña && !reserva.cuentaCerrada && (
                  <Button size="sm" aria-pressed={!!reserva.señaPagada} onClick={alternarSeña} disabled={ocupado}>
                    {reserva.señaPagada ? "Seña cobrada" : "Marcar seña cobrada"}
                  </Button>
                )}
                {reserva.status !== "bloqueado" && (
                  <Button size="sm" variant="ghost" icon={<X className="pd-icon" size={20} aria-hidden="true" />} onClick={cancelarReserva} disabled={ocupado || laCuenta?.estado === "abierta"} title={laCuenta?.estado === "abierta" ? "Cerrá o anulá la cuenta antes de cancelar el turno" : undefined}>
                    {reserva.status === "confirmada" ? "Cancelar reserva" : "Rechazar"}
                  </Button>
                )}
                {laCuenta?.estado === "abierta" && (
                  <Button as="link" to={`/admin/bar/vender?cuenta=${laCuenta.id}`} size="sm" variant="ghost" icon={<ShoppingBag className="pd-icon" size={20} aria-hidden="true" />}>
                    Cargar consumos
                  </Button>
                )}
              </div>
            )}
          </Card>
        )}
        {reservaProp === null && grupoIdProp && reservaLeida === null && cuenta.para === grupoId && <Alert tone="warning">No encontramos la reserva de este turno.</Alert>}
      </section>
    </div>
  );
}
