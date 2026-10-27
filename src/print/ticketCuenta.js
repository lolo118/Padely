// Ticket "Cuenta del turno" (HTML plano, sin React): la cancha, la seña y los consumos de una reserva, agrupados por
// parte cuando la cuenta está dividida. Sirve como pre-cuenta mientras está abierta y como comprobante al cerrar.
import { escapar } from "./imprimir";
import { formatPrecio } from "../utils/format";
import { formatDiaCorto, formatFechaHora } from "../utils/formatDate";
import { calcularTotalesCuenta, esLegacyDividida, lineasDeVentaParaParte, participantesDe, saldosDeCuenta } from "../utils/cuentas";
import { bloqueQrTicket } from "./ticketVenta";
import { flag } from "../services/flagsService";

const cant = (n) => (Number(n) || 0).toLocaleString("es-AR", { maximumFractionDigits: 3 });
const fila = (label, valor, clase = "") => `<p class="ticket-row${clase ? ` ${clase}` : ""}"><span>${escapar(label)}</span><span>${escapar(valor)}</span></p>`;
const linea = (texto, clase = "") => `<p class="ticket-line${clase ? ` ${clase}` : ""}">${escapar(texto)}</p>`;
const sep = () => `<hr class="ticket-sep">`;
const ESTADO = { abierta: "PRE-CUENTA (abierta)", cerrada: "CUENTA CERRADA", anulada: "CUENTA ANULADA" };

export function htmlTicketCuenta({ club = {}, cuenta = {}, clubId = "" }) {
  const t = club.ticket || {};
  const direccion = [club.direccion, club.ciudad].filter(Boolean).join(" · ");
  const totales = calcularTotalesCuenta(cuenta);
  const items = cuenta.items || [];
  const partes = esLegacyDividida(cuenta) ? cuenta.division?.partes || [] : [];
  const partes_ = [];
  const participantes = participantesDe(cuenta);
  const nombreDe = (id) => (participantes.find((p) => p.id === id) || {}).nombre || "—";
  const saldos = partes.length ? null : saldosDeCuenta(cuenta);

  partes_.push(`<h1 class="ticket-h1">${escapar(t.encabezado || club.nombre || "Padely")}</h1>`);
  if (direccion) partes_.push(linea(direccion, "ticket-center ticket-muted"));
  partes_.push(sep());
  partes_.push(`<h2 class="ticket-h2 ticket-center">Cuenta del turno</h2>`);
  partes_.push(linea(ESTADO[cuenta.estado] || "", "ticket-center ticket-muted"));
  partes_.push(fila("Cancha", `${cuenta.canchaNombre || "—"}`));
  partes_.push(fila("Fecha", `${formatDiaCorto(cuenta.fecha)} ${cuenta.horaInicio || ""}${cuenta.horaFin ? `–${cuenta.horaFin}` : ""}`.trim()));
  if (cuenta.nombreJugador) partes_.push(fila("A nombre de", cuenta.nombreJugador));
  partes_.push(sep());

  if (partes.length) {
    partes.forEach((p, i) => {
      partes_.push(linea(`${p.nombre || `Parte ${i + 1}`}`, "ticket-strong"));
      for (const l of lineasDeVentaParaParte(cuenta, p)) partes_.push(fila(l.cantidad !== 1 ? `${cant(l.cantidad)} x ${l.nombre}` : l.nombre, formatPrecio(l.subtotal), "indent"));
      partes_.push(fila("Subtotal", formatPrecio(p.total), "indent ticket-strong"));
      partes_.push(fila(p.ventaNumero ? "Pagado" : "Pendiente", p.ventaNumero || "", "indent ticket-muted"));
      if (i < partes.length - 1) partes_.push(linea(""));
    });
  } else {
    if (items.length === 0) partes_.push(linea("Sin consumos", "ticket-muted"));
    for (const it of items) {
      partes_.push(fila(`${cant(it.cantidad)} x ${it.nombre}`, formatPrecio(it.subtotal)));
      if (Number(it.descuento) > 0) partes_.push(fila("desc.", `-${formatPrecio(it.descuento)}`, "indent ticket-muted"));
    }
    partes_.push(fila("Consumos", formatPrecio(totales.consumos), "ticket-strong"));
    if (totales.cancha > 0) partes_.push(fila("Cancha", formatPrecio(totales.cancha)));
    if (totales.seña > 0) partes_.push(fila("Seña pagada", `-${formatPrecio(totales.seña)}`));
  }
  partes_.push(sep());
  partes_.push(fila("TOTAL", formatPrecio(totales.total), "ticket-big"));
  // Pagos por persona (cuenta compartida) y lo que falta
  if (saldos && (cuenta.pagos || []).length) {
    partes_.push(sep());
    partes_.push(linea("Pagos", "ticket-strong"));
    for (const pg of cuenta.pagos) {
      const quien = (pg.participanteIds || []).map(nombreDe).join(", ") || "—";
      const medios = (pg.medios || []).map((m) => m.medio).join(" + ") || "—";
      partes_.push(fila(`${quien} · ${medios}`, formatPrecio(pg.total)));
      const cubre = (pg.cubreA || []).filter((id) => !(pg.participanteIds || []).includes(id)).map(nombreDe);
      if (cubre.length) partes_.push(linea(`  por ${cubre.join(", ")}`, "ticket-muted"));
    }
    partes_.push(fila("Pagado", formatPrecio(saldos.pagadoTotal), "ticket-strong"));
    if (saldos.pendiente > 0) {
      partes_.push(fila("Falta", formatPrecio(saldos.pendiente), "ticket-strong"));
      for (const p of saldos.participantes.filter((x) => x.debe > 0)) partes_.push(fila(`  ${p.nombre}`, formatPrecio(p.debe), "ticket-muted"));
    }
  } else if (saldos && saldos.participantes.length > 1 && cuenta.estado === "abierta") {
    partes_.push(sep());
    partes_.push(linea(`Entre ${saldos.participantes.length}`, "ticket-strong"));
    for (const p of saldos.participantes) partes_.push(fila(`  ${p.nombre}`, formatPrecio(p.debe), "ticket-muted"));
  }
  if ((cuenta.ventas || []).length) partes_.push(fila("Tickets", cuenta.ventas.join(", "), "ticket-muted"));
  if (t.alias) {
    partes_.push(sep());
    partes_.push(linea(`Transferencias: ${t.alias}`, "ticket-center"));
  }
  partes_.push(sep());
  partes_.push(linea(t.pie || "Gracias por venir", "ticket-center ticket-strong"));
  partes_.push(linea("Comprobante no válido como factura", "ticket-center ticket-muted"));
  // El ticket digital de la cuenta es el de su primera venta (o la de "Cobrar todo")
  // P3-14: con los ids públicos activos la cuenta no conoce el id de su venta: sin QR (el ticket de cada venta lo lleva)
  if (clubId && (cuenta.ventas || []).length && !flag("ticketsPublicId")) partes_.push(bloqueQrTicket(clubId, cuenta.ventas[0]));
  partes_.push(linea(`Impreso ${formatFechaHora(new Date())}`, "ticket-center ticket-muted"));
  return partes_.join("");
}
