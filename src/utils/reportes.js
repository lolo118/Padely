// Reportes del bar: helpers puros (sin Firebase ni React). Los reportes se arman sumando los rollups diarios
// (clubs/{c}/reportesDiarios/{fecha}) del período; acá viven el cálculo del período, la suma y las vistas.
import { fechaLocalDe } from "./cuentas.js";

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
export const redondear = (n) => Math.round(num(n) * 100) / 100;

export const PERIODOS = [
  { value: "hoy", label: "Hoy" },
  { value: "ayer", label: "Ayer" },
  { value: "semana", label: "Esta semana" },
  { value: "mes", label: "Este mes" },
  { value: "rango", label: "Rango" },
];

const sumarDias = (fecha, n) => {
  const [y, m, d] = String(fecha).split("-").map(Number);
  return fechaLocalDe(new Date(y, m - 1, d + n));
};

// { desde, hasta } (ambos inclusive, "YYYY-MM-DD") de un período respecto de `hoy`. La semana empieza el lunes.
export function rangoDePeriodo(periodo, hoy = fechaLocalDe(new Date()), { desde = null, hasta = null } = {}) {
  if (periodo === "hoy") return { desde: hoy, hasta: hoy };
  if (periodo === "ayer") {
    const a = sumarDias(hoy, -1);
    return { desde: a, hasta: a };
  }
  if (periodo === "semana") {
    const [y, m, d] = hoy.split("-").map(Number);
    const dow = new Date(y, m - 1, d).getDay(); // 0 = domingo
    const lunes = sumarDias(hoy, -((dow + 6) % 7));
    return { desde: lunes, hasta: hoy };
  }
  if (periodo === "mes") return { desde: `${hoy.slice(0, 7)}-01`, hasta: hoy };
  // rango: lo que vino, saneado y ordenado; sin datos, hoy
  const a = /^\d{4}-\d{2}-\d{2}$/.test(desde || "") ? desde : hoy;
  const b = /^\d{4}-\d{2}-\d{2}$/.test(hasta || "") ? hasta : a;
  return a <= b ? { desde: a, hasta: b } : { desde: b, hasta: a };
}

// Lista de fechas "YYYY-MM-DD" entre desde y hasta (inclusive), como mucho 366
export function diasEntre(desde, hasta) {
  const out = [];
  let f = desde;
  while (f <= hasta && out.length < 366) {
    out.push(f);
    f = sumarDias(f, 1);
  }
  return out;
}

// Campos de ventas.*: cantidad, total (neto de anulaciones), anuladas, totalAnulado, totalConCosto (subtotales de las
// líneas con costo conocido), lineasSinCosto, lineasCostoEstimado (recálculo con el costo actual del producto),
// descuentos (descuento general de los tickets), otros (cancha/seña cobradas sin cuenta del turno)
const CAMPOS_VENTAS = ["cantidad", "total", "anuladas", "totalAnulado", "totalConCosto", "lineasSinCosto", "lineasCostoEstimado", "descuentos", "otros"];
const vacio = () => ({ ventas: Object.fromEntries(CAMPOS_VENTAS.map((k) => [k, 0])), porMedio: { efectivo: 0, transferencia: 0, tarjeta: 0, qr: 0, mercadopago: 0 }, porCategoria: {}, porProducto: {}, porHora: {}, porCancha: {}, porDia: {}, cierres: [] });

// Suma los rollups de varios días en una sola vista
export function sumarRollups(rollups = []) {
  const t = vacio();
  for (const r of rollups) {
    if (!r) continue;
    const v = r.ventas || {};
    for (const k of CAMPOS_VENTAS) t.ventas[k] += num(v[k]);
    for (const m of Object.keys(t.porMedio)) t.porMedio[m] += num(r.porMedio && r.porMedio[m]);
    for (const [k, c] of Object.entries(r.porCategoria || {})) {
      const d = (t.porCategoria[k] = t.porCategoria[k] || { cantidad: 0, total: 0, costo: 0, totalConCosto: 0 });
      d.cantidad += num(c.cantidad);
      d.total += num(c.total);
      d.costo += num(c.costo);
      d.totalConCosto += num(c.totalConCosto);
    }
    for (const [k, p] of Object.entries(r.porProducto || {})) {
      const d = (t.porProducto[k] = t.porProducto[k] || { nombre: p.nombre || k, cantidad: 0, total: 0, costo: 0, totalConCosto: 0 });
      d.nombre = p.nombre || d.nombre;
      d.cantidad += num(p.cantidad);
      d.total += num(p.total);
      d.costo += num(p.costo);
      d.totalConCosto += num(p.totalConCosto);
    }
    for (const [h, x] of Object.entries(r.porHora || {})) {
      const d = (t.porHora[h] = t.porHora[h] || { cantidad: 0, total: 0 });
      d.cantidad += num(x.cantidad);
      d.total += num(x.total);
    }
    for (const [k, c] of Object.entries(r.porCancha || {})) {
      const d = (t.porCancha[k] = t.porCancha[k] || { nombre: c.nombre || k, total: 0, consumos: 0, cobros: 0, cuentas: 0 });
      d.nombre = c.nombre || d.nombre;
      d.total += num(c.total);
      d.consumos += num(c.consumos);
      d.cobros += num(c.cobros);
      d.cuentas += num(c.cuentas);
    }
    if (r.fecha) t.porDia[r.fecha] = { cantidad: num(v.cantidad) - num(v.anuladas), total: num(v.total) };
    for (const c of (r.cajas && r.cajas.cierres) || []) t.cierres.push({ ...c, fecha: r.fecha });
  }
  for (const k of CAMPOS_VENTAS) t.ventas[k] = redondear(t.ventas[k]);
  for (const m of Object.keys(t.porMedio)) t.porMedio[m] = redondear(t.porMedio[m]);
  return t;
}

// Margen = totalConCosto − costo: solo las líneas con costo conocido. null cuando no hay ninguna (se muestra "—"),
// nunca el total completo como si el costo fuera 0.
export const margenDe = (x) => (num(x?.totalConCosto) > 0 ? redondear(num(x.totalConCosto) - num(x.costo)) : null);

// Indicadores de la cabecera
export function indicadores(t) {
  const netas = Math.max(0, num(t.ventas.cantidad) - num(t.ventas.anuladas));
  const costo = Object.values(t.porCategoria).reduce((s, c) => s + num(c.costo), 0);
  return {
    ventas: netas,
    total: redondear(t.ventas.total),
    ticketPromedio: netas ? redondear(t.ventas.total / netas) : 0,
    margen: margenDe({ totalConCosto: t.ventas.totalConCosto, costo }),
    margenParcial: num(t.ventas.lineasSinCosto) > 0,
    margenEstimado: num(t.ventas.lineasCostoEstimado) > 0,
    descuentos: redondear(t.ventas.descuentos),
    anuladas: num(t.ventas.anuladas),
    totalAnulado: redondear(t.ventas.totalAnulado),
  };
}

// Top N productos por total vendido, con margen (null si ninguna de sus líneas tiene costo)
export function topProductos(t, n = 10) {
  return Object.entries(t.porProducto)
    .map(([id, p]) => ({ id, nombre: p.nombre || id, cantidad: num(p.cantidad), total: redondear(p.total), margen: margenDe(p) }))
    .filter((p) => p.total > 0 || p.cantidad > 0)
    .sort((a, b) => b.total - a.total || b.cantidad - a.cantidad)
    .slice(0, n);
}

// Categorías con participación (%) sobre los consumos; `nombres`: { categoriaId: nombre }
export function porCategoriaConParticipacion(t, nombres = {}) {
  const filas = Object.entries(t.porCategoria).map(([id, c]) => ({ id, nombre: id === "sin" ? "Sin categoría" : nombres[id] || id, cantidad: num(c.cantidad), total: redondear(c.total), margen: margenDe(c) }));
  const total = filas.reduce((s, f) => s + f.total, 0);
  return filas.map((f) => ({ ...f, participacion: total > 0 ? Math.round((f.total / total) * 100) : 0 })).sort((a, b) => b.total - a.total);
}

export const porMedioLista = (t) =>
  [
    { medio: "efectivo", label: "Efectivo", total: redondear(t.porMedio.efectivo) },
    { medio: "transferencia", label: "Transferencia", total: redondear(t.porMedio.transferencia) },
    { medio: "tarjeta", label: "Tarjeta", total: redondear(t.porMedio.tarjeta) },
    { medio: "qr", label: "QR", total: redondear(t.porMedio.qr) },
    { medio: "mercadopago", label: "Mercado Pago", total: redondear(t.porMedio.mercadopago) },
  ].filter((m) => m.total !== 0);

// Serie por hora (08…23) para hoy/ayer, o por día para períodos largos
export function seriePorHora(t) {
  const out = [];
  for (let h = 8; h <= 23; h++) {
    const k = String(h).padStart(2, "0");
    const x = t.porHora[k] || { cantidad: 0, total: 0 };
    out.push({ name: `${k} h`, total: redondear(x.total), cantidad: num(x.cantidad) });
  }
  // Horas fuera de 8–23 con ventas (madrugada) se agregan al final
  for (const [k, x] of Object.entries(t.porHora)) if (Number(k) < 8) out.push({ name: `${k} h`, total: redondear(x.total), cantidad: num(x.cantidad) });
  return out;
}
export function seriePorDia(t, desde, hasta) {
  return diasEntre(desde, hasta).map((f) => {
    const d = t.porDia[f] || { cantidad: 0, total: 0 };
    return { fecha: f, name: f.slice(8, 10) + "/" + f.slice(5, 7), total: redondear(d.total), cantidad: num(d.cantidad) };
  });
}

export const porCanchaLista = (t) =>
  Object.entries(t.porCancha)
    .map(([id, c]) => ({ id, nombre: c.nombre || id, cuentas: num(c.cuentas), consumos: redondear(c.consumos), cancha: redondear(c.total), cobros: num(c.cobros) }))
    .sort((a, b) => b.cancha + b.consumos - (a.cancha + a.consumos));

// ----- Exportación "para el contador" -----
export const tipoLineaDe = (it) => (it?.tipoLinea ? it.tipoLinea : it?.productoId ? "consumo" : num(it?.subtotal) < 0 ? "seña" : "cancha");
const fechaHoraDe = (ts) => {
  const d = ts && typeof ts.toDate === "function" ? ts.toDate() : ts instanceof Date ? ts : null;
  if (!d) return { fecha: "", hora: "" };
  const dos = (x) => String(x).padStart(2, "0");
  return { fecha: `${dos(d.getDate())}/${dos(d.getMonth() + 1)}/${d.getFullYear()}`, hora: `${dos(d.getHours())}:${dos(d.getMinutes())}` };
};

// Tres tablas (arrays de filas, con encabezados) a partir de las ventas del período. categorias: { id: nombre }
export function filasExportacion(ventas = [], categorias = {}) {
  const ventasFilas = [["Número", "Fecha", "Hora", "Dispositivo", "Cajero", "Cliente", "Subtotal", "Descuento", "Total", "Estado", "Motivo anulación", "Cuenta / turno"]];
  const itemsFilas = [["Número", "Producto", "Categoría", "Cantidad", "Precio", "Subtotal", "Costo", "Tipo"]];
  const mediosFilas = [["Número", "Medio", "Monto", "Referencia"]];
  for (const v of ventas) {
    const { fecha, hora } = fechaHoraDe(v.creadoEn);
    ventasFilas.push([
      v.numero || v.id || "",
      fecha,
      hora,
      v.dispositivo || "",
      v.creadoPorNombre || "",
      v.cliente?.nombre || "",
      num(v.subtotal),
      num(v.descuentoTotal),
      num(v.total),
      v.estado === "anulada" ? "Anulada" : "Ok",
      v.anulacion?.motivo || "",
      v.cuentaId ? v.cliente?.nombre || v.cuentaId : "",
    ]);
    for (const it of v.items || []) {
      const tipo = tipoLineaDe(it);
      itemsFilas.push([
        v.numero || v.id || "",
        it.nombre || "",
        tipo === "consumo" ? (it.categoriaId ? categorias[it.categoriaId] || it.categoriaId : "") : tipo === "cancha" ? "Cancha" : "Seña",
        num(it.cantidad),
        num(it.precio),
        num(it.subtotal),
        it.costo === null || it.costo === undefined ? "" : num(it.costo) * num(it.cantidad),
        tipo,
      ]);
    }
    for (const p of v.pagos || []) mediosFilas.push([v.numero || v.id || "", p.medio || "", num(p.monto), p.ref || ""]);
  }
  return { ventas: ventasFilas, items: itemsFilas, medios: mediosFilas };
}

// CSV es-AR: separador ";", decimales con coma, comillas cuando hace falta, BOM para Excel
export function aCsv(filas) {
  const celda = (v) => {
    if (typeof v === "number") return String(v).replace(".", ",");
    const s = String(v ?? "");
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + filas.map((f) => f.map(celda).join(";")).join("\r\n");
}

export const nombreArchivo = (club, desde, hasta, ext) => `padely-ventas-${String(club || "club").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "club"}-${desde}-${hasta}.${ext}`;
