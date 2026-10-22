// Ticket "Cuenta del turno" (HTML plano, sin React): la cancha, la seña y los consumos de una reserva, agrupados por
// parte cuando la cuenta está dividida. Sirve como pre-cuenta mientras está abierta y como comprobante al cerrar.
import { escapar } from "./imprimir";
import { formatPrecio } from "../utils/format";
import { formatDiaCorto, formatFechaHora } from "../utils/formatDate";
import { calcularTotalesCuenta, lineasDeVentaParaParte } from "../utils/cuentas";
import { bloqueQrTicket } from "./ticketVenta";

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
  const partes = cuenta.division?.partes || [];
  const partes_ = [];

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
  if ((cuenta.ventas || []).length) partes_.push(fila("Tickets", cuenta.ventas.join(", "), "ticket-muted"));
  if (t.alias) {
    partes_.push(sep());
    partes_.push(linea(`Transferencias: ${t.alias}`, "ticket-center"));
  }
  partes_.push(sep());
  partes_.push(linea(t.pie || "Gracias por venir", "ticket-center ticket-strong"));
  partes_.push(linea("Comprobante no válido como factura", "ticket-center ticket-muted"));
  // El ticket digital de la cuenta es el de su primera venta (o la de "Cobrar todo")
  if (clubId && (cuenta.ventas || []).length) partes_.push(bloqueQrTicket(clubId, cuenta.ventas[0]));
  partes_.push(linea(`Impreso ${formatFechaHora(new Date())}`, "ticket-center ticket-muted"));
  return partes_.join("");
}
