// GENERADO por functions/sync-utils.mjs desde src/utils/membresias.js — NO EDITAR ACÁ (editá el original y volvé a correr el sync).
// src/utils/membresias.js — socios y membresías de cada club (P3-16). Puro, sin imports: functions/sync-utils.mjs lo
// copia a functions/lib/membresias.mjs (lo usan onSocioEscrito y el barrido de vencidas).
//
// clubs/{c}/planesSocio/{planId} = { nombre, descripcion, precio, periodo, visible, cupo, orden, beneficios }
//   beneficios = { descuentoCanchaPct, franja: { dias: [0..6], desde, hasta } | null, descuentoBarPct,
//                  diasExtraReserva, sinSeña, extras: [texto] }
//   Los cuatro primeros los aplica Padely (reserva, seña, Vender); `extras` es texto libre que el club cumple en
//   persona (estacionamiento, lugar en exhibiciones…): se muestra en el carnet y al escanear el QR.
// clubs/{c}/socios/{socioId} (socioId = uid del jugador, o un id propio si lo carga el club sin cuenta) =
//   { uid, nombre, planId, planNombre, beneficios (foto al activar), estado, desde, vence, numero, token, historial }
//   estado: pendiente (pidió) · activa · vencida · cancelada · rechazada

export const PERIODOS = [
  { id: "mensual", label: "Mensual", meses: 1 },
  { id: "trimestral", label: "Trimestral", meses: 3 },
  { id: "semestral", label: "Semestral", meses: 6 },
  { id: "anual", label: "Anual", meses: 12 },
];
export const ESTADOS_SOCIO = { pendiente: "Pendiente", activa: "Activa", vencida: "Vencida", cancelada: "Dada de baja", rechazada: "Rechazada" };
export const DIAS_SEMANA = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
export const MAX_EXTRAS = 8;
// Pase familiar: hasta 6 personas (el titular + 5 integrantes con cuenta en Padely), sin cargo extra por persona
export const MAX_INTEGRANTES = 6;

export const mesesDePeriodo = (periodo) => (PERIODOS.find((p) => p.id === periodo) || PERIODOS[0]).meses;
export const etiquetaPeriodo = (periodo) => (PERIODOS.find((p) => p.id === periodo) || PERIODOS[0]).label;

const entero = (v, min, max) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
};
const horaValida = (h) => typeof h === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(h);

// Lo que carga el club → beneficios normalizados (lo que no vino queda apagado)
export function normalizarBeneficios(b = {}) {
  const franjaIn = b.franja && typeof b.franja === "object" ? b.franja : null;
  const dias = franjaIn && Array.isArray(franjaIn.dias) ? [...new Set(franjaIn.dias.map(Number).filter((d) => d >= 0 && d <= 6))].sort() : [];
  const franja = franjaIn && dias.length && horaValida(franjaIn.desde) && horaValida(franjaIn.hasta) && franjaIn.desde < franjaIn.hasta ? { dias, desde: franjaIn.desde, hasta: franjaIn.hasta } : null;
  const extras = (Array.isArray(b.extras) ? b.extras : [])
    .map((t) => String(t || "").trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, MAX_EXTRAS);
  return {
    descuentoCanchaPct: entero(b.descuentoCanchaPct, 0, 100),
    franja,
    descuentoBarPct: entero(b.descuentoBarPct, 0, 100),
    diasExtraReserva: entero(b.diasExtraReserva, 0, 60),
    sinSeña: b.sinSeña === true,
    extras,
  };
}

// Formulario del plan → plan válido, o { error }
export function normalizarPlan({ nombre, descripcion = "", precio, periodo = "mensual", visible = true, cupo = null, orden = 0, integrantes = 1, beneficios = {} } = {}) {
  const n = String(nombre || "").trim().slice(0, 60);
  if (!n) return { error: "Poné un nombre al plan (ej.: Socio mensual)" };
  const p = Number(precio);
  if (!Number.isFinite(p) || p < 0) return { error: "El precio tiene que ser un número (0 si es gratis)" };
  if (!PERIODOS.some((x) => x.id === periodo)) return { error: "Elegí el período del plan" };
  const c = cupo === null || cupo === "" || cupo === undefined ? null : Math.round(Number(cupo));
  if (c !== null && (!Number.isFinite(c) || c < 1)) return { error: "El cupo tiene que ser 1 o más (o vacío para sin límite)" };
  const ben = normalizarBeneficios(beneficios);
  if (!tieneBeneficios(ben)) return { error: "Elegí al menos un beneficio" };
  return { nombre: n, descripcion: String(descripcion || "").trim().slice(0, 280), precio: Math.round(p), periodo, visible: visible !== false, cupo: c, orden: Number(orden) || 0, integrantes: entero(integrantes || 1, 1, MAX_INTEGRANTES), beneficios: ben };
}

export const tieneBeneficios = (b) => !!b && (b.descuentoCanchaPct > 0 || b.descuentoBarPct > 0 || b.diasExtraReserva > 0 || b.sinSeña === true || (b.extras || []).length > 0);

// "Martes y jueves de 08:00 a 17:00" · "Lun a vie de 08:00 a 17:00"
export function textoFranja(f) {
  if (!f) return "";
  const d = f.dias;
  const consecutivos = d.length > 2 && d.every((x, i) => i === 0 || x === d[i - 1] + 1);
  const dias = d.length === 7 ? "Todos los días" : consecutivos ? `${DIAS_SEMANA[d[0]]} a ${DIAS_SEMANA[d[d.length - 1]].toLowerCase()}` : d.map((x) => DIAS_SEMANA[x]).join(", ");
  return `${dias} de ${f.desde} a ${f.hasta}`;
}

// Beneficios → frases para el carnet, la página del club y el escaneo
export function textosBeneficios(b) {
  if (!b) return [];
  const out = [];
  if (b.descuentoCanchaPct > 0) out.push(`${b.descuentoCanchaPct} % off en la cancha${b.franja ? ` (${textoFranja(b.franja)})` : ""}`);
  if (b.sinSeña) out.push("Reservás sin seña");
  if (b.diasExtraReserva > 0) out.push(`Reservás ${b.diasExtraReserva} ${b.diasExtraReserva === 1 ? "día" : "días"} antes que el resto`);
  if (b.descuentoBarPct > 0) out.push(`${b.descuentoBarPct} % off en el bar`);
  (b.extras || []).forEach((t) => out.push(t));
  return out;
}

// "Pase familiar · hasta 4 personas" (null si es individual)
export const textoIntegrantes = (plan) => (plan && Number(plan.integrantes) > 1 ? `Pase familiar · hasta ${Number(plan.integrantes)} personas` : null);
// ¿Cuántos integrantes más puede sumar el titular? (el titular cuenta como uno)
export const lugaresFamilia = (titular, plan) => Math.max(0, (Number(plan?.integrantes) || 1) - 1 - (Array.isArray(titular?.familia) ? titular.familia.length : 0));

// Lo que un integrante copia del titular (estado, plan, beneficios, fechas): lo mantiene la Function onSocioEscrito
export function copiaParaIntegrante(titular) {
  return {
    estado: titular.estado,
    planId: titular.planId || null,
    planNombre: titular.planNombre || null,
    periodo: titular.periodo || null,
    beneficios: titular.beneficios ? normalizarBeneficios(titular.beneficios) : null,
    desde: titular.desde ?? null,
    vence: titular.vence ?? null,
    titularId: titular.uid || null,
    titularNombre: titular.nombre || null,
  };
}

// --- Fechas (ms; hora argentina UTC−3 para "hoy") ---------------------------------------------------------------
const aMs = (v) => (v == null ? null : typeof v === "number" ? v : typeof v.toMillis === "function" ? v.toMillis() : typeof v.seconds === "number" ? v.seconds * 1000 : new Date(v).getTime());
// +N meses en calendario argentino; si el día no existe (31 → 30/28) queda el último del mes. Vence al final de ese día.
export function sumarMesesAr(desdeMs, meses) {
  const ar = new Date(desdeMs - 3 * 3600 * 1000);
  const y = ar.getUTCFullYear();
  const m = ar.getUTCMonth() + meses;
  const ultimo = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const d = Math.min(ar.getUTCDate(), ultimo);
  return Date.UTC(y, m, d, 23, 59, 59) + 3 * 3600 * 1000;
}

// ¿Qué pasa hoy con este socio? → { activa, estado, vence, diasRestantes, porVencer }
export function estadoSocio(socio, ahora = Date.now()) {
  if (!socio) return { activa: false, estado: null, vence: null, diasRestantes: null, porVencer: false };
  const vence = aMs(socio.vence);
  let estado = socio.estado || "pendiente";
  if (estado === "activa" && vence !== null && vence < ahora) estado = "vencida";
  const diasRestantes = estado === "activa" && vence !== null ? Math.max(0, Math.ceil((vence - ahora) / 86400000)) : null;
  return { activa: estado === "activa", estado, vence, diasRestantes, porVencer: diasRestantes !== null && diasRestantes <= 5 };
}

// Activar (aprobar un pedido o dar de alta) o renovar con un pago → cambios para el documento del socio.
// Renovar con la membresía todavía vigente suma desde el vencimiento; vencida o nueva, desde hoy.
export function registrarPagoSocio(socio, plan, { ahora = Date.now(), monto = null, medio = "efectivo", por = null, porNombre = null } = {}) {
  if (!plan) return { error: "Elegí un plan" };
  const meses = mesesDePeriodo(plan.periodo);
  const est = estadoSocio(socio, ahora);
  const base = est.activa && est.vence ? est.vence : ahora;
  const vence = sumarMesesAr(base, meses);
  const desde = est.activa && socio && aMs(socio.desde) ? aMs(socio.desde) : ahora;
  const entrada = { tipo: est.activa ? "renovacion" : "alta", planId: plan.id || socio?.planId || null, monto: monto === null ? Number(plan.precio) || 0 : Math.max(0, Number(monto) || 0), medio, meses, en: ahora, por, porNombre };
  return {
    estado: "activa",
    planId: plan.id || socio?.planId || null,
    planNombre: plan.nombre,
    periodo: plan.periodo,
    beneficios: normalizarBeneficios(plan.beneficios),
    integrantes: Math.min(MAX_INTEGRANTES, Math.max(1, Math.round(Number(plan.integrantes) || 1))),
    desde,
    vence,
    // Un pago propio lo vuelve titular (si antes era integrante de un Pase familiar, deja de serlo)
    titularId: null,
    titularNombre: null,
    historial: [...(Array.isArray(socio?.historial) ? socio.historial : []), entrada].slice(-50),
  };
}

// --- Beneficios en uso -------------------------------------------------------------------------------------------
// Beneficios vigentes de un socio (null si no es socio activo)
export const beneficiosVigentes = (socio, ahora = Date.now()) => (estadoSocio(socio, ahora).activa ? normalizarBeneficios(socio.beneficios) : null);

// "2026-10-31" → día de la semana (0 = domingo)
const diaSemana = (fecha) => {
  const [y, m, d] = String(fecha || "").split("-").map(Number);
  return y && m && d ? new Date(Date.UTC(y, m - 1, d)).getUTCDay() : null;
};

// % de descuento en la cancha para un turno (fecha "AAAA-MM-DD", hora "HH:MM"); 0 si no aplica
export function descuentoCanchaPara(beneficios, fecha, hora) {
  if (!beneficios || !(beneficios.descuentoCanchaPct > 0)) return 0;
  const f = beneficios.franja;
  if (!f) return beneficios.descuentoCanchaPct;
  const dia = diaSemana(fecha);
  if (dia === null || !f.dias.includes(dia)) return 0;
  return hora >= f.desde && hora < f.hasta ? beneficios.descuentoCanchaPct : 0;
}

// Precios por turno → con el descuento de socio de cada turno; { precios, descuento, pct } (pct = el mayor aplicado)
export function preciosConSocio(precios, beneficios, fecha, horas) {
  let descuento = 0;
  let pct = 0;
  const out = precios.map((p, i) => {
    const d = descuentoCanchaPara(beneficios, fecha, horas[i]);
    if (!d) return p;
    const nuevo = Math.round((Number(p) || 0) * (100 - d)) / 100;
    descuento += (Number(p) || 0) - nuevo;
    pct = Math.max(pct, d);
    return nuevo;
  });
  return { precios: out, descuento: Math.round(descuento * 100) / 100, pct };
}

// Días de anticipación para reservar: los del club + los extra del socio
export const diasAnticipacionCon = (club, beneficios) => (Number(club?.diasAnticipacion ?? 7) || 7) + (beneficios ? Number(beneficios.diasExtraReserva) || 0 : 0);

// Seña con beneficio de socio
export const señaConSocio = (seña, beneficios) => (beneficios && beneficios.sinSeña ? 0 : seña);

// ¿Hay cupo en el plan? (activos + pendientes cuentan)
export const hayCupo = (plan, ocupados) => !plan || plan.cupo == null || ocupados < plan.cupo;

// Nombre corto para la verificación pública: "Juan P."
export function nombreCorto(nombre) {
  const partes = String(nombre || "").trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "Socio";
  return partes.length === 1 ? partes[0] : `${partes[0]} ${partes[partes.length - 1][0].toUpperCase()}.`;
}

// Índice público del QR (sociosPublicos/{token}): lo mínimo para que el club verifique en la puerta
export function verificacionPublica(clubId, club, socio) {
  const est = estadoSocio(socio);
  return {
    clubId,
    clubNombre: (club && club.nombre) || null,
    nombre: nombreCorto(socio.nombre),
    numero: socio.numero || null,
    planNombre: socio.planNombre || null,
    estado: est.estado,
    vence: est.vence,
    titular: socio.titularId ? nombreCorto(socio.titularNombre) : null,
    beneficios: textosBeneficios(socio.beneficios ? normalizarBeneficios(socio.beneficios) : null),
  };
}
