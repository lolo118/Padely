// functions/rollup.js — lo que una venta aporta al reporte diario (clubs/{c}/reportesDiarios/{fecha}). Puro: sin
// Firestore, para poder probarlo (rollup.test.js). Lo usan onVentaCreated / onVentaUpdated (incrementos, signo ±1)
// y reconstruirReporteDiario (recálculo desde cero, con costos estimados). El cliente (src/utils/reportes.js) suma
// estos documentos y los muestra: un campo nuevo acá se refleja allá.
//
// Cubos y la identidad que cierra el día (rollup.test.js la verifica):
//   Σ porProducto.total + Σ porCancha.total + ventas.otros − ventas.descuentos == ventas.total
// Cada línea va a UN solo cubo con su subtotal (neto del descuento de línea): consumo → porProducto y porCategoria;
// cancha y seña → porCancha si la venta cobró una cuenta con cancha, si no → ventas.otros. El descuento general del
// ticket (lo que las líneas suman por encima del total cobrado) va a ventas.descuentos en vez de prorratearse: el
// Top 10 muestra lo que cada producto se vendió, y el descuento se ve aparte.
//
// Margen (P3-6b): solo sobre líneas con costo conocido. `costo` suma los costos conocidos y `totalConCosto` los
// subtotales de esas mismas líneas; margen = totalConCosto − costo. Una línea sin costo cuenta en lineasSinCosto
// (y queda fuera del margen). Al recalcular un día, una línea sin costo toma el costo ACTUAL del producto
// (costosActuales) y cuenta en lineasCostoEstimado; si el producto tampoco tiene costo, sigue en lineasSinCosto.
const ZONA_HORARIA = "America/Argentina/Buenos_Aires";
const CLAVES_MEDIO = ["efectivo", "transferencia", "tarjeta", "qr"];
const redondear = (n) => Math.round((Number(n) || 0) * 100) / 100;

// "HH" local argentina de un Timestamp (o de ahora)
const horaDe = (ts) => {
  const date = ts && typeof ts.toDate === "function" ? ts.toDate() : new Date();
  const partes = new Intl.DateTimeFormat("en-GB", { timeZone: ZONA_HORARIA, hour: "2-digit", hour12: false }).formatToParts(date);
  const h = Number((partes.find((p) => p.type === "hour") || {}).value) || 0;
  return String(h % 24).padStart(2, "0");
};
// Clave segura para un mapa de Firestore
const limpiarClave = (s) => String(s || "sin").replace(/[.~*/[\]]/g, "_") || "sin";

// Tipo de una línea de venta: lo trae desde P3-6; las viejas se infieren
function tipoLineaDe(it) {
  if (it && it.tipoLinea) return it.tipoLinea;
  if (it && it.productoId) return "consumo";
  return Number(it && it.subtotal) < 0 ? "seña" : "cancha";
}

const costoNumerico = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

// Redondea a 2 decimales cada número de un objeto anidado (los nombres quedan como están)
function redondearHojas(obj) {
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "number") obj[k] = redondear(v);
    else if (v && typeof v === "object") redondearHojas(v);
  }
  return obj;
}

// Lo que una venta aporta al reporte de su día, como objeto anidado de números (signo +1 venta, −1 anulación).
// categorias: { productoId: categoriaId } ya leído; cuenta: doc de la cuenta (para porCancha) o null;
// costosActuales: { productoId: costo } para estimar las líneas sin costo (solo en el recálculo).
function aporteDeVenta(venta, { categorias = {}, cuenta = null, signo = 1, costosActuales = null } = {}) {
  const items = Array.isArray(venta.items) ? venta.items : [];
  const pagos = Array.isArray(venta.pagos) ? venta.pagos : [];
  const total = redondear(venta.total);
  const a = { ventas: {}, porMedio: {}, porCategoria: {}, porProducto: {}, porHora: {}, porCancha: {} };
  if (signo > 0) {
    a.ventas.cantidad = 1;
    a.ventas.total = total;
  } else {
    a.ventas.anuladas = 1;
    a.ventas.totalAnulado = total;
    a.ventas.total = -total;
  }
  for (const p of pagos) if (CLAVES_MEDIO.includes(p && p.medio)) a.porMedio[p.medio] = (a.porMedio[p.medio] || 0) + signo * (Number(p.monto) || 0);
  const hora = horaDe(venta.creadoEn);
  a.porHora[hora] = { cantidad: signo, total: signo * total };
  let sinCosto = 0;
  let estimadas = 0;
  let conCosto = 0;
  let consumos = 0;
  let cancha = 0;
  let lineas = 0;
  for (const it of items) {
    const tipo = tipoLineaDe(it);
    const subtotal = redondear(it.subtotal);
    lineas += subtotal;
    if (tipo !== "consumo") {
      cancha += subtotal;
      continue;
    }
    consumos += subtotal;
    const cantidad = Number(it.cantidad) || 0;
    let unitario = costoNumerico(it.costo);
    if (unitario === null && costosActuales && it.productoId && costoNumerico(costosActuales[it.productoId]) !== null) {
      unitario = costoNumerico(costosActuales[it.productoId]);
      estimadas += 1;
    }
    const costo = unitario === null ? null : redondear(unitario * cantidad);
    if (costo === null) sinCosto += 1;
    else conCosto += subtotal;
    const pid = it.productoId ? limpiarClave(it.productoId) : null;
    const cat = limpiarClave((it.categoriaId !== undefined && it.categoriaId !== null ? it.categoriaId : pid ? categorias[it.productoId] : null) || "sin");
    const c = (a.porCategoria[cat] = a.porCategoria[cat] || { cantidad: 0, total: 0, costo: 0, totalConCosto: 0 });
    c.cantidad += signo * cantidad;
    c.total += signo * subtotal;
    c.costo += signo * (costo || 0);
    if (costo !== null) c.totalConCosto += signo * subtotal;
    if (pid) {
      const p = (a.porProducto[pid] = a.porProducto[pid] || { cantidad: 0, total: 0, costo: 0, totalConCosto: 0 });
      p.cantidad += signo * cantidad;
      p.total += signo * subtotal;
      p.costo += signo * (costo || 0);
      if (costo !== null) p.totalConCosto += signo * subtotal;
      p.nombre = it.nombre || null;
    }
  }
  if (sinCosto) a.ventas.lineasSinCosto = signo * sinCosto;
  if (estimadas) a.ventas.lineasCostoEstimado = signo * estimadas;
  if (conCosto) a.ventas.totalConCosto = signo * conCosto;
  // Descuento general del ticket: lo que las líneas suman por encima de lo cobrado (0 en las ventas de cuentas)
  const descuentos = redondear(lineas - total);
  if (descuentos) a.ventas.descuentos = signo * descuentos;
  if (venta.cuentaId && cuenta && cuenta.canchaId) {
    const k = limpiarClave(cuenta.canchaId);
    a.porCancha[k] = { nombre: cuenta.canchaNombre || null, total: signo * cancha, consumos: signo * consumos, cobros: signo };
  } else if (cancha) {
    // Cancha o seña cobrada sin cuenta del turno (o con una cuenta sin cancha): va a "otros" para que el día cierre
    a.ventas.otros = signo * cancha;
  }
  return redondearHojas(a);
}

// Suma un aporte (o un reporte) sobre otro, hoja por hoja (los textos se copian)
function sumarAporte(destino, aporte) {
  for (const [k, v] of Object.entries(aporte || {})) {
    if (typeof v === "number") destino[k] = redondear((destino[k] || 0) + v);
    else if (typeof v === "string") destino[k] = v;
    else if (v && typeof v === "object") sumarAporte((destino[k] = destino[k] || {}), v);
  }
  return destino;
}

// ¿Cierra el día? { cubos, total, diferencia }: cubos = Σ porProducto.total + Σ porCancha.total + otros − descuentos
function reconciliar(reporte) {
  const num = (v) => Number(v) || 0;
  const productos = Object.values(reporte.porProducto || {}).reduce((s, p) => s + num(p.total), 0);
  const canchas = Object.values(reporte.porCancha || {}).reduce((s, c) => s + num(c.total), 0);
  const v = reporte.ventas || {};
  const cubos = redondear(productos + canchas + num(v.otros) - num(v.descuentos));
  const total = redondear(v.total);
  return { cubos, total, diferencia: redondear(cubos - total) };
}

module.exports = { ZONA_HORARIA, CLAVES_MEDIO, aporteDeVenta, costoNumerico, horaDe, limpiarClave, reconciliar, redondear, sumarAporte, tipoLineaDe };
