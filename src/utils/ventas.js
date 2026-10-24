// Ventas del bar: helpers puros (sin Firebase ni React). Los usan el POS, el ticket y los tests.
// Montos en pesos; se redondean a 2 decimales (los precios suelen ser enteros).

export const MEDIOS_VENTA = ["efectivo", "transferencia", "tarjeta", "qr"];
export const TAMANO_BLOQUE = 100; // números de ticket que reserva un dispositivo por vez
export const UMBRAL_RESERVA = 10; // con menos de estos números libres se pide otro bloque (si hay conexión)

export const redondear = (n) => Math.round((Number(n) || 0) * 100) / 100;
const positivo = (n) => (Number.isFinite(Number(n)) && Number(n) > 0 ? Number(n) : 0);

// Una línea del ticket: { productoId, nombre, precio, cantidad, descuento (monto ≥ 0), controlaStock }
// → la misma con bruto (precio × cantidad), descuento acotado al bruto y subtotal
export function calcularLinea(item) {
  const precio = positivo(item?.precio);
  const cantidad = positivo(item?.cantidad);
  const bruto = redondear(precio * cantidad);
  const descuento = Math.min(bruto, redondear(positivo(item?.descuento)));
  return { ...item, precio, cantidad, bruto, descuento, subtotal: redondear(bruto - descuento) };
}

// Descuento { tipo: "porcentaje" | "monto", valor } sobre una base → { tipo, valor, monto, excedido }.
// `excedido` avisa si supera el máximo permitido (maxPct del base); el monto nunca supera la base.
export function resolverDescuento(tipo, valor, base, maxPct = 100) {
  const b = positivo(base);
  const v = positivo(valor);
  if (!v || !b) return { tipo: tipo === "monto" ? "monto" : "porcentaje", valor: v, monto: 0, excedido: false };
  const crudo = tipo === "monto" ? v : (b * v) / 100;
  const monto = Math.min(b, redondear(crudo));
  const tope = redondear((b * positivo(maxPct)) / 100);
  return { tipo: tipo === "monto" ? "monto" : "porcentaje", valor: v, monto, excedido: monto > tope + 0.005 };
}

// Totales del ticket. descuento: { tipo, valor } | null (descuento general). maxPct: tope de descuento de quien vende.
// → { lineas, subtotal, descuentoLineas, descuento ({ tipo, valor, monto } | null), descuentoTotal, total, excedido }
// `excedido` = los descuentos (de línea + general) superan maxPct del subtotal bruto (lo mismo que miran las reglas).
export function calcularTotales(items = [], descuento = null, maxPct = 100) {
  const lineas = items.map(calcularLinea).filter((l) => l.cantidad > 0);
  const bruto = redondear(lineas.reduce((s, l) => s + l.bruto, 0));
  const descuentoLineas = redondear(lineas.reduce((s, l) => s + l.descuento, 0));
  const subtotal = redondear(bruto - descuentoLineas);
  const general = descuento && positivo(descuento.valor) ? resolverDescuento(descuento.tipo, descuento.valor, subtotal, 100) : null;
  const montoGeneral = general ? general.monto : 0;
  const descuentoTotal = redondear(descuentoLineas + montoGeneral);
  const total = Math.max(0, redondear(subtotal - montoGeneral));
  const tope = redondear((bruto * positivo(maxPct)) / 100);
  return {
    lineas,
    bruto,
    subtotal,
    descuentoLineas,
    descuento: general ? { tipo: general.tipo, valor: general.valor, monto: general.monto } : null,
    descuentoTotal,
    total,
    excedido: descuentoTotal > tope + 0.005,
  };
}

// Pagos cargados en el cobro: [{ medio, monto, ref }] (para efectivo, `monto` es lo ENTREGADO por el cliente)
// → { pagos (normalizados: efectivo neto con `entregado`), pagado, falta, vuelto, excedente, valido }
// El vuelto sale solo del efectivo; los medios que no son efectivo no pueden superar lo que falta cubrir.
export function calcularPagos(pagos = [], total = 0) {
  const t = Math.max(0, redondear(total));
  const filas = (pagos || []).filter((p) => p && MEDIOS_VENTA.includes(p.medio) && positivo(p.monto) > 0);
  const noEfectivo = filas.filter((p) => p.medio !== "efectivo").map((p) => ({ medio: p.medio, monto: redondear(p.monto), ref: String(p.ref || "").trim() || null }));
  const sumaNoEfectivo = redondear(noEfectivo.reduce((s, p) => s + p.monto, 0));
  const entregado = redondear(filas.filter((p) => p.medio === "efectivo").reduce((s, p) => s + Number(p.monto), 0));
  const excedente = Math.max(0, redondear(sumaNoEfectivo - t));
  const restante = Math.max(0, redondear(t - sumaNoEfectivo));
  const efectivoNeto = Math.min(entregado, restante);
  const vuelto = Math.max(0, redondear(entregado - restante));
  const pagado = redondear(sumaNoEfectivo + efectivoNeto);
  const falta = Math.max(0, redondear(t - pagado));
  const normalizados = [...noEfectivo];
  if (entregado > 0) normalizados.push({ medio: "efectivo", monto: efectivoNeto, entregado, ref: null });
  // Un ticket de $ 0 (todo descuento) se cobra sin pagos
  const valido = excedente === 0 && falta === 0 && (t === 0 || normalizados.length > 0);
  return { pagos: normalizados, pagado: t === 0 ? 0 : pagado, falta, vuelto, excedente, valido };
}

// "D1" + 123 → "D1-000123"
export function formatearNumero(codigo, n) {
  return `${codigo}-${String(Math.max(0, Math.trunc(Number(n) || 0))).padStart(6, "0")}`;
}

// Bloque de números de un dispositivo: { codigo, desde, hasta, proximo }
export const bloqueAgotado = (bloque) => !bloque || !bloque.codigo || !Number.isFinite(bloque.proximo) || bloque.proximo > bloque.hasta;
export const numerosLibres = (bloque) => (bloqueAgotado(bloque) ? 0 : bloque.hasta - bloque.proximo + 1);
export const bloqueNecesitaReserva = (bloque) => !bloque || !bloque.codigo || numerosLibres(bloque) < UMBRAL_RESERVA;

// El siguiente número del bloque → { numero: "D1-000123", n, bloque (avanzado) } o null si no quedan
export function siguienteNumero(bloque) {
  if (bloqueAgotado(bloque)) return null;
  const n = bloque.proximo;
  return { numero: formatearNumero(bloque.codigo, n), n, bloque: { ...bloque, proximo: n + 1 } };
}

// Un bloque nuevo contiguo al actual se suma al actual (sin saltos en la numeración); si no, lo reemplaza
export function unirBloques(actual, nuevo) {
  if (!nuevo) return actual || null;
  if (actual && !bloqueAgotado(actual) && actual.codigo === nuevo.codigo && nuevo.desde === actual.hasta + 1) {
    return { ...actual, hasta: nuevo.hasta };
  }
  return { codigo: nuevo.codigo, desde: nuevo.desde, hasta: nuevo.hasta, proximo: nuevo.desde };
}

// ----- Texto -----

const pesos = (n) => "$ " + Math.round(Number(n || 0)).toLocaleString("es-AR", { maximumFractionDigits: 0 });
const cant = (n) => (Number(n) || 0).toLocaleString("es-AR", { maximumFractionDigits: 3 });
export const ETIQUETA_MEDIO_VENTA = { efectivo: "Efectivo", transferencia: "Transferencia", tarjeta: "Tarjeta", qr: "QR", mercadopago: "Mercado Pago" };

// Ticket como texto plano para WhatsApp (wa.me)
export function textoTicketWhatsApp(venta, club = {}) {
  const l = [];
  l.push(club?.ticket?.encabezado || club?.nombre || "Padely");
  l.push(`Ticket ${venta.numero}${venta.estado === "anulada" ? " (ANULADA)" : ""}`);
  l.push("");
  for (const it of venta.items || []) {
    l.push(`${cant(it.cantidad)} x ${it.nombre} — ${pesos(it.subtotal)}${it.descuento ? ` (desc. ${pesos(it.descuento)})` : ""}`);
  }
  l.push("");
  if (venta.descuento?.monto) {
    l.push(`Subtotal: ${pesos(venta.subtotal)}`);
    l.push(`Descuento: -${pesos(venta.descuento.monto)}`);
  }
  l.push(`TOTAL: ${pesos(venta.total)}`);
  for (const p of venta.pagos || []) {
    const medio = ETIQUETA_MEDIO_VENTA[p.medio] || p.medio;
    l.push(p.medio === "efectivo" && p.entregado ? `${medio}: ${pesos(p.entregado)} (vuelto ${pesos(venta.vuelto)})` : `${medio}: ${pesos(p.monto)}${p.ref ? ` · ${p.ref}` : ""}`);
  }
  if (club?.ticket?.alias) l.push(`Transferencias: ${club.ticket.alias}`);
  l.push("");
  l.push(club?.ticket?.pie || "Gracias por venir");
  l.push("Comprobante no válido como factura");
  return l.join("\n");
}

// Teléfono argentino como lo quiere wa.me: solo dígitos, con 549 adelante si vino sin país
export function telefonoWhatsApp(telefono) {
  let d = String(telefono || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("549")) return d;
  if (d.startsWith("54")) return "549" + d.slice(2);
  if (d.startsWith("0")) d = d.slice(1);
  if (d.startsWith("15")) d = d.slice(2);
  return "549" + d;
}
