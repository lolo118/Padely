// Ticket de venta (HTML plano, sin React): lo arma Vender al cobrar y al reimprimir desde "Ventas".
// Comprobante de consumo, no fiscal. La página pública del ticket digital (/t/v/…) y su QR llegan en P3-6:
// por ahora la ruta va impresa como texto.
import { escapar } from "./imprimir";
import { formatPrecio } from "../utils/format";
import { formatFechaHora } from "../utils/formatDate";
import { ETIQUETA_MEDIO } from "../utils/caja";

const cant = (n) => (Number(n) || 0).toLocaleString("es-AR", { maximumFractionDigits: 3 });
const fila = (label, valor, clase = "") => `<p class="ticket-row${clase ? ` ${clase}` : ""}"><span>${escapar(label)}</span><span>${escapar(valor)}</span></p>`;
const linea = (texto, clase = "") => `<p class="ticket-line${clase ? ` ${clase}` : ""}">${escapar(texto)}</p>`;
const sep = () => `<hr class="ticket-sep">`;

// { club: { nombre, direccion, ciudad, ticket? { encabezado, alias, pie } }, venta, clubId } → HTML del cuerpo
export function htmlTicketVenta({ club = {}, venta = {}, clubId = "" }) {
  const t = club.ticket || {};
  const direccion = [club.direccion, club.ciudad].filter(Boolean).join(" · ");
  const anulada = venta.estado === "anulada";
  const partes = [];

  partes.push(`<h1 class="ticket-h1">${escapar(t.encabezado || club.nombre || "Padely")}</h1>`);
  if (direccion) partes.push(linea(direccion, "ticket-center ticket-muted"));
  partes.push(sep());
  partes.push(`<h2 class="ticket-h2 ticket-center">Ticket Nº ${escapar(venta.numero || "—")}</h2>`);
  if (anulada) {
    partes.push(linea("*** ANULADA ***", "ticket-center ticket-big"));
    if (venta.anulacion?.motivo) partes.push(linea(`Motivo: ${venta.anulacion.motivo}`, "ticket-center ticket-muted"));
  }
  partes.push(fila("Fecha", formatFechaHora(venta.creadoEn || new Date())));
  if (venta.creadoPorNombre) partes.push(fila("Atendió", venta.creadoPorNombre));
  if (venta.cliente?.nombre) partes.push(fila("Cliente", venta.cliente.nombre));
  partes.push(sep());

  for (const it of venta.items || []) {
    partes.push(fila(`${cant(it.cantidad)} x ${it.nombre}`, formatPrecio(it.subtotal + (Number(it.descuento) || 0))));
    if (Number(it.cantidad) !== 1) partes.push(linea(`${formatPrecio(it.precio)} c/u`, "indent ticket-muted"));
    if (Number(it.descuento) > 0) partes.push(fila("desc.", `-${formatPrecio(it.descuento)}`, "indent ticket-muted"));
  }
  partes.push(sep());

  const hayDescuento = Number(venta.descuento?.monto) > 0 || (venta.items || []).some((it) => Number(it.descuento) > 0);
  if (hayDescuento) {
    partes.push(fila("Subtotal", formatPrecio(venta.subtotal)));
    const lineas = (venta.items || []).reduce((s, it) => s + (Number(it.descuento) || 0), 0);
    if (lineas > 0) partes.push(fila("Desc. en líneas", `-${formatPrecio(lineas)}`, "ticket-muted"));
    if (Number(venta.descuento?.monto) > 0) {
      const d = venta.descuento;
      partes.push(fila(d.tipo === "porcentaje" ? `Descuento ${cant(d.valor)} %` : "Descuento", `-${formatPrecio(d.monto)}`));
    }
  }
  partes.push(fila("TOTAL", formatPrecio(venta.total), "ticket-big"));
  partes.push(sep());

  for (const p of venta.pagos || []) {
    const medio = ETIQUETA_MEDIO[p.medio] || p.medio;
    if (p.medio === "efectivo") {
      partes.push(fila("Efectivo", formatPrecio(p.entregado ?? p.monto)));
      if (Number(venta.vuelto) > 0) partes.push(fila("Vuelto", formatPrecio(venta.vuelto), "indent"));
    } else {
      partes.push(fila(medio, formatPrecio(p.monto)));
      if (p.ref) partes.push(linea(p.ref, "indent ticket-muted"));
    }
  }
  if (t.alias) {
    partes.push(sep());
    partes.push(linea(`Transferencias: ${t.alias}`, "ticket-center"));
  }
  partes.push(sep());
  partes.push(linea(t.pie || "Gracias por venir", "ticket-center ticket-strong"));
  partes.push(linea("Comprobante no válido como factura", "ticket-center ticket-muted"));
  if (venta.numero) partes.push(linea(`Ticket digital: /t/v/${clubId}/${venta.numero}`, "ticket-center ticket-muted"));
  return partes.join("");
}
