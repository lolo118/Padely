// Ticket "Cierre de caja" (HTML plano, sin React). Lo arma la pantalla de Caja al cerrar y desde el Historial.
import { escapar } from "./imprimir";
import { formatPrecio } from "../utils/format";
import { formatDiaHora, formatFechaHora, formatHora } from "../utils/formatDate";
import { ETIQUETA_MEDIO, ETIQUETA_TIPO, MEDIOS_CAJA, TOTALES_CERO, claveTotalDe, efectivoEsperado, signoDe } from "../utils/caja";

const firmado = (n) => {
  const v = Number(n) || 0;
  return `${v < 0 ? "-" : v > 0 ? "+" : ""}${formatPrecio(Math.abs(v))}`;
};
const fila = (label, valor, clase = "") => `<p class="ticket-row${clase ? ` ${clase}` : ""}"><span>${escapar(label)}</span><span>${escapar(valor)}</span></p>`;
const linea = (texto, clase = "") => `<p class="ticket-line${clase ? ` ${clase}` : ""}">${escapar(texto)}</p>`;
const sep = () => `<hr class="ticket-sep">`;

// Ingresos / retiros / gastos / ventas / anulaciones por medio, a partir de los movimientos aplicados
function desgloseDe(movimientos) {
  const base = () => ({ ingresos: 0, retiros: 0, gastos: 0, ventas: 0, anulaciones: 0, otros: 0 });
  const porMedio = Object.fromEntries(MEDIOS_CAJA.map((m) => [m, base()]));
  for (const m of movimientos) {
    if (m.aplicado === false || !porMedio[m.medio]) continue;
    const monto = Number(m.monto) || 0;
    const clave = claveTotalDe(m.tipo);
    if (clave) porMedio[m.medio][clave] += monto;
    else porMedio[m.medio].otros += signoDe(m.tipo) * monto;
  }
  return porMedio;
}

// { club: { nombre, direccion, ciudad }, caja, movimientos, ancho } → HTML del cuerpo del ticket
export function htmlCierreCaja({ club = {}, caja = {}, movimientos = [], ventasMp = [] }) {
  const t = { ...TOTALES_CERO, ...(caja.totales || {}) };
  const desglose = desgloseDe(movimientos);
  const esperado = caja.esperadoEfectivo ?? efectivoEsperado(caja);
  const contado = caja.arqueo?.efectivoContado;
  const diferencia = caja.diferencia ?? (contado === null || contado === undefined ? null : Number(contado) - esperado);
  const direccion = [club.direccion, club.ciudad].filter(Boolean).join(" · ");

  const partes = [];
  partes.push(`<h1 class="ticket-h1">${escapar(club.nombre || "Padely")}</h1>`);
  if (direccion) partes.push(linea(direccion, "ticket-center ticket-muted"));
  partes.push(sep());
  partes.push(`<h2 class="ticket-h2 ticket-center">Cierre de caja</h2>`);
  partes.push(fila("Dispositivo", caja.dispositivo || "—"));
  partes.push(fila("Abierta", formatDiaHora(caja.abiertaEn)));
  if (caja.abiertaPorNombre) partes.push(fila("Abrió", caja.abiertaPorNombre, "indent ticket-muted"));
  partes.push(fila("Cerrada", formatDiaHora(caja.cerradaEn)));
  if (caja.cerradaPorNombre) partes.push(fila("Cerró", caja.cerradaPorNombre, "indent ticket-muted"));
  partes.push(sep());

  partes.push(fila("Fondo inicial", formatPrecio(caja.fondoInicial)));
  for (const medio of MEDIOS_CAJA) {
    const d = desglose[medio];
    const neto = Number(t[medio]) || 0;
    const hayDetalle = d.ingresos || d.retiros || d.gastos || d.ventas || d.anulaciones || d.otros;
    partes.push(fila(ETIQUETA_MEDIO[medio], firmado(neto), medio === "efectivo" || hayDetalle ? "ticket-strong" : ""));
    if (d.ventas) partes.push(fila("Ventas", firmado(d.ventas), "indent"));
    if (d.anulaciones) partes.push(fila("Anulaciones", firmado(-d.anulaciones), "indent"));
    if (d.ingresos) partes.push(fila("Ingresos", firmado(d.ingresos), "indent"));
    if (d.retiros) partes.push(fila("Retiros", firmado(-d.retiros), "indent"));
    if (d.gastos) partes.push(fila("Gastos", firmado(-d.gastos), "indent"));
    if (d.otros) partes.push(fila("Otros", firmado(d.otros), "indent"));
  }
  // Pagos online (P3-8): van a la cuenta de Mercado Pago del club, nunca a esta caja; solo informativo
  if (ventasMp.length) partes.push(fila("Mercado Pago (no entra en caja)", formatPrecio(ventasMp.reduce((s, v) => s + (Number(v.total) || 0), 0)), "ticket-muted"));
  partes.push(sep());

  partes.push(fila("Efectivo esperado", formatPrecio(esperado), "ticket-strong"));
  partes.push(fila("Efectivo contado", contado === null || contado === undefined ? "—" : formatPrecio(contado), "ticket-strong"));
  partes.push(fila("Diferencia", diferencia === null ? "—" : firmado(diferencia), "ticket-big"));
  if (caja.observaciones) {
    partes.push(sep());
    partes.push(linea("Observaciones", "ticket-strong"));
    partes.push(linea(caja.observaciones));
  }

  const aplicados = movimientos.filter((m) => m.aplicado !== false);
  partes.push(sep());
  partes.push(fila("Movimientos", String(Number(t.movimientos) || aplicados.length)));
  if (aplicados.length) {
    const orden = [...aplicados].sort((a, b) => (a.creadoEn?.toMillis?.() || 0) - (b.creadoEn?.toMillis?.() || 0));
    for (const m of orden) {
      const etiqueta = `${formatHora(m.creadoEn)} ${ETIQUETA_TIPO[m.tipo] || m.tipo} · ${ETIQUETA_MEDIO[m.medio] || m.medio}`;
      partes.push(fila(etiqueta, firmado(signoDe(m.tipo) * (Number(m.monto) || 0)), "ticket-muted"));
      if (m.nota) partes.push(linea(m.nota, "indent ticket-muted"));
    }
  }
  partes.push(sep());
  partes.push(linea("Comprobante interno · no válido como factura", "ticket-center ticket-muted"));
  partes.push(linea(`Impreso ${formatFechaHora(new Date())}`, "ticket-center ticket-muted"));
  return partes.join("");
}
