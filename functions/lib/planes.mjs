// GENERADO por functions/sync-utils.mjs desde src/utils/planes.js — NO EDITAR ACÁ (editá el original y volvé a correr el sync).
// src/utils/planes.js — planes de Padely para los clubes (P3-9). Puro y sin imports: functions/sync-utils.mjs lo copia a
// functions/lib/planes.mjs para que las Functions (barrido de vencidos, inicio de la prueba, comisión de MP) usen
// EXACTAMENTE la misma lógica que el panel.
//
// clubs/{c}.plan = { tipo: "prueba" | "free" | "pro", inicio, vence, historial: [...] } — lo escriben solo las Functions
// y el super-admin. Un club SIN plan es "legacy": PRO sin bloqueos (los clubes que ya estaban siguen igual).
// - prueba: 30 días que arrancan con la primera reserva confirmada (sin inicio = todavía no empezó, todo habilitado).
// - pro: hasta `vence` + 7 días de gracia; después pasa a free.
// - free: canchas, reservas, turnos fijos, seña online, página pública y torneos; Padely retiene 2,5 % de cada pago
//   online. El bar (vender, cuentas, caja, barra, QR, productos, reportes, importar) y las cuentas de staff son PRO.

export const DIAS_PRUEBA = 30;
export const DIAS_GRACIA_PRO = 7;
export const DIAS_AVISO_PRUEBA = 10; // el aviso "Tu prueba termina…" aparece desde el día 20
export const COMISION_FREE_PCT = 2.5;
const DIA_MS = 24 * 60 * 60 * 1000;

// PRO por escalones según las canchas activas del club. El anual cuesta 10 meses.
export const ESCALONES_PRO = [
  { id: "pro-1-4", desde: 1, hasta: 4, precio: 35000, nombre: "PRO 1 a 4 canchas" },
  { id: "pro-5-8", desde: 5, hasta: 8, precio: 50000, nombre: "PRO 5 a 8 canchas" },
  { id: "pro-9", desde: 9, hasta: null, precio: 65000, nombre: "PRO 9 o más canchas" },
];
export const MESES_PAGADOS_ANUAL = 10;

export const escalonDe = (canchasActivas) => {
  const n = Math.max(0, Math.floor(Number(canchasActivas) || 0));
  return ESCALONES_PRO.find((e) => n <= (e.hasta ?? Infinity)) || ESCALONES_PRO[0];
};
export const precioAnual = (escalon) => escalon.precio * MESES_PAGADOS_ANUAL;
export const canchasActivas = (canchas = []) => canchas.filter((c) => c && c.activa !== false).length;

// Timestamp de Firestore, Date, número (ms) o { seconds } → ms (o null)
export function aMs(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v instanceof Date) return v.getTime();
  if (typeof v.toMillis === "function") return v.toMillis();
  if (typeof v.seconds === "number") return v.seconds * 1000 + Math.floor((v.nanoseconds || 0) / 1e6);
  if (typeof v._seconds === "number") return v._seconds * 1000;
  const d = Date.parse(v);
  return Number.isFinite(d) ? d : null;
}

// Mismo día calendario + n meses (31/01 + 1 → 28/02 o 29/02)
export function sumarMeses(ms, meses) {
  const d = new Date(ms);
  const dia = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + meses);
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(dia, ultimo));
  return d.getTime();
}

// Estado efectivo del plan en un instante. `pro` = las funciones PRO están habilitadas.
// { tipo: "legacy"|"prueba"|"free"|"pro", pro, vence (ms|null), diasRestantes, sinEmpezar, enGracia, graciaHasta,
//   vencido (la Function todavía no lo pasó a free), avisoPrueba }
export function estadoPlan(club, ahora = Date.now()) {
  const plan = club && club.plan;
  if (!plan || !plan.tipo) return { tipo: "legacy", pro: true, vence: null, diasRestantes: null, sinEmpezar: false, enGracia: false, graciaHasta: null, vencido: false, avisoPrueba: false };
  const vence = aMs(plan.vence);
  const dias = vence === null ? null : Math.ceil((vence - ahora) / DIA_MS);
  const base = { tipo: plan.tipo, vence, diasRestantes: dias, sinEmpezar: false, enGracia: false, graciaHasta: null, vencido: false, avisoPrueba: false };
  if (plan.tipo === "prueba") {
    if (!aMs(plan.inicio) || vence === null) return { ...base, pro: true, sinEmpezar: true };
    if (ahora <= vence) return { ...base, pro: true, avisoPrueba: dias <= DIAS_AVISO_PRUEBA };
    return { ...base, pro: false, vencido: true };
  }
  if (plan.tipo === "pro") {
    if (vence === null || ahora <= vence) return { ...base, pro: true };
    const graciaHasta = vence + DIAS_GRACIA_PRO * DIA_MS;
    if (ahora <= graciaHasta) return { ...base, pro: true, enGracia: true, graciaHasta };
    return { ...base, pro: false, vencido: true, graciaHasta };
  }
  return { ...base, tipo: "free", pro: false };
}

export const tienePro = (club, ahora = Date.now()) => estadoPlan(club, ahora).pro;

// Qué se bloquea en FREE (ids de funciones del panel)
export const FUNCIONES_PRO = ["bar", "staff"];
export const puedeUsar = (club, funcion, ahora = Date.now()) => !FUNCIONES_PRO.includes(funcion) || tienePro(club, ahora);

// Comisión de Padely sobre cada pago online: un override explícito del super-admin gana; si no, FREE 2,5 % y el resto 0
export function comisionPct(club, ahora = Date.now()) {
  const override = club && club.mercadoPago ? club.mercadoPago.comisionOverridePct : undefined;
  if (override !== undefined && override !== null && Number.isFinite(Number(override))) return Number(override);
  return estadoPlan(club, ahora).pro ? 0 : COMISION_FREE_PCT;
}

const entrada = (tipo, desde, hasta, extra = {}) => ({ tipo, desde, hasta: hasta ?? null, por: extra.por || "sistema", nota: extra.nota || null, ...(extra.monto !== undefined ? { monto: extra.monto, meses: extra.meses } : {}) });

// Plan inicial de un club nuevo
export const planInicial = () => ({ tipo: "prueba", inicio: null, vence: null, historial: [] });

// Primera reserva confirmada: la prueba empieza ahora y vence en 30 días. null si no corresponde.
export function iniciarPrueba(plan, ahora = Date.now()) {
  if (!plan || plan.tipo !== "prueba" || aMs(plan.inicio)) return null;
  return { ...plan, inicio: ahora, vence: ahora + DIAS_PRUEBA * DIA_MS };
}

// Barrido diario: prueba vencida → free; pro vencido hace más de 7 días → free. null si no cambia.
export function transicionVencida(plan, ahora = Date.now()) {
  if (!plan || !plan.tipo) return null;
  const vence = aMs(plan.vence);
  if (vence === null) return null;
  const historial = Array.isArray(plan.historial) ? plan.historial : [];
  if (plan.tipo === "prueba" && aMs(plan.inicio) && ahora > vence) {
    return { ...plan, tipo: "free", inicio: ahora, vence: null, historial: [...historial, entrada("prueba", aMs(plan.inicio), vence, { nota: "Terminó la prueba" })] };
  }
  if (plan.tipo === "pro" && ahora > vence + DIAS_GRACIA_PRO * DIA_MS) {
    return { ...plan, tipo: "free", inicio: ahora, vence: null, historial: [...historial, entrada("pro", aMs(plan.inicio), vence, { nota: "Venció sin pago" })] };
  }
  return null;
}

// Pago recibido (lo marca el super-admin): PRO por `meses` desde el vencimiento vigente (si todavía no pasó) o desde hoy.
// anual = 12 meses al precio de 10.
export function registrarPago(plan, { escalon, anual = false, ahora = Date.now(), por = null, nota = null } = {}) {
  const e = escalon || ESCALONES_PRO[0];
  const meses = anual ? 12 : 1;
  const monto = anual ? precioAnual(e) : e.precio;
  const actual = plan || {};
  const venceActual = actual.tipo === "pro" ? aMs(actual.vence) : null;
  const desde = venceActual && venceActual > ahora ? venceActual : ahora;
  const historial = Array.isArray(actual.historial) ? actual.historial : [];
  const cerrar = actual.tipo && actual.tipo !== "pro" ? [entrada(actual.tipo, aMs(actual.inicio), ahora, { nota: "Pasó a PRO" })] : [];
  return {
    ...actual,
    tipo: "pro",
    inicio: actual.tipo === "pro" && aMs(actual.inicio) ? aMs(actual.inicio) : ahora,
    vence: sumarMeses(desde, meses),
    escalon: e.id,
    historial: [...historial, ...cerrar, entrada("pago", ahora, null, { por, nota: nota || `${anual ? "Anual" : "Mensual"} · ${e.nombre}`, monto, meses })],
  };
}

// Cambio manual del super-admin (pasar a free, extender la prueba, etc.)
export function cambiarPlan(plan, { tipo, vence = null, ahora = Date.now(), por = null, nota = null } = {}) {
  const actual = plan || {};
  const historial = Array.isArray(actual.historial) ? actual.historial : [];
  const cierre = actual.tipo ? [entrada(actual.tipo, aMs(actual.inicio), ahora, { por, nota: nota || `Cambio a ${tipo}` })] : [];
  return { ...actual, tipo, inicio: tipo === "prueba" && !vence ? null : ahora, vence: vence ?? null, historial: [...historial, ...cierre] };
}

// Lo que suma PRO sobre FREE (pantalla "Disponible en PRO" y Mi plan)
export const INCLUYE_PRO = [
  "Vender en el bar con tickets y descuentos",
  "Cuentas del turno: consumos por persona y cobro por partes",
  "Caja con apertura, arqueo y cierre",
  "Pedidos a la barra desde la cancha (QR)",
  "Productos, stock, proveedores e importación",
  "Reportes de ventas y cierres",
  "Cuentas para tu equipo (encargado, cajero, barra)",
  "Sin comisión en los pagos online",
];

export const ETIQUETA_PLAN = { legacy: "PRO (sin vencimiento)", prueba: "Prueba", free: "FREE", pro: "PRO" };
