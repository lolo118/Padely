// GENERADO por functions/sync-utils.mjs desde src/utils/membresias.js — NO EDITAR ACÁ (editá el original y volvé a correr el sync).
// src/utils/membresias.js — "Pase Club <club>" (P3-16): la membresía de cada club. Puro, sin imports:
// functions/sync-utils.mjs lo copia a functions/lib/membresias.mjs (lo usan las Functions del Pase).
//
// Un solo Pase por club: clubs/{c}/planesSocio/pase = { visible, precio, meses (1/3/6/12), umbrales: { plata, oro },
//   beneficios: { bronce, plata, oro } } — cada nivel con { descuentoCanchaPct, franja, descuentoBarPct,
//   descuentoTorneoPct, torneoGratis, diasExtraReserva, sinSeña, extras: [texto] }. Se paga solo por Mercado Pago con
//   débito automático (suscripción). El nivel sale de los puntos: 1 punto cada $ 1.000 gastados en el club (reservas
//   jugadas, bar con el Pase, torneos que organiza el club); solo suman los que tienen el Pase activo.
// clubs/{c}/socios/{uid} = { uid, nombre, estado, desde, vence, puntos, nivel, beneficios (los del nivel actual),
//   suscripcion: { preapprovalId, estado }, equipo, puntosResetEn, numero, token, historial }
//   estado: pendiente (falta autorizar el débito) · activa · vencida · cancelada
//   Al darse de baja, los beneficios se cortan en el acto; puntos y nivel se guardan 90 días y después vuelven a 0.
//   Los puntos cuentan los últimos 12 meses (el barrido diario los recalcula desde socios/{uid}/puntos).
// Sponsors del club: pase.sponsors = [{ nombre, detalle, pct: { bronce, plata, oro } }] → "15 % off en <sponsor>".

export const PASE_ID = "pase";
export const NIVELES = ["bronce", "plata", "oro"];
export const ETIQUETA_NIVEL = { bronce: "Bronce", plata: "Plata", oro: "Oro" };
// Tono del badge de cada nivel (pd-badge-*)
export const TONO_NIVEL = { bronce: "heat", plata: "neutral", oro: "lime" };
export const UMBRALES_DEFECTO = { plata: 150, oro: 400 };
export const PESOS_POR_PUNTO = 1000;
export const DIAS_CONSERVA_PUNTOS = 90;
export const MESES_PASE = [1, 3, 6, 12];
export const DIAS_PUNTOS = 365;
// Días de gracia después del vencimiento antes de cortar beneficios (Mercado Pago reintenta el cobro)
export const DIAS_GRACIA_PASE = 5;
export const MAX_SPONSORS = 10;
export const ESTADOS_SOCIO = { pendiente: "Pendiente", activa: "Activo", vencida: "Vencido", cancelada: "Dado de baja", rechazada: "Rechazado" };
export const DIAS_SEMANA = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
export const MAX_EXTRAS = 8;
export const SUGERENCIAS_EXTRAS = [
  "Prioridad de estacionamiento durante tu reserva",
  "Lugar reservado en exhibiciones y eventos",
  "Merchandising del club de regalo",
  "Descuento en el merchandising del club",
  "Descuento en las clases con los profes del club",
  "Prioridad en la lista de espera de turnos llenos",
  "Un invitado gratis por mes",
  "Regalo de cumpleaños",
  "Inscripción anticipada a los torneos del club",
];

// Compatibilidad: períodos con nombre (el historial y los textos)
export const PERIODOS = [
  { id: "mensual", label: "Mensual", meses: 1 },
  { id: "trimestral", label: "Trimestral", meses: 3 },
  { id: "semestral", label: "Semestral", meses: 6 },
  { id: "anual", label: "Anual", meses: 12 },
];
export const mesesDePeriodo = (periodo) => (PERIODOS.find((p) => p.id === periodo) || PERIODOS[0]).meses;
export const periodoDeMeses = (meses) => (PERIODOS.find((p) => p.meses === Number(meses)) || PERIODOS[0]).id;
export const etiquetaPeriodo = (periodo) => (PERIODOS.find((p) => p.id === periodo) || PERIODOS[0]).label;
export const textoCada = (meses) => (Number(meses) === 1 ? "por mes" : Number(meses) === 12 ? "por año" : `cada ${Number(meses)} meses`);

const entero = (v, min, max) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
};
const horaValida = (h) => typeof h === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(h);

// Beneficios de un nivel, normalizados (lo que no vino queda apagado)
export function normalizarBeneficios(b = {}) {
  const franjaIn = b && b.franja && typeof b.franja === "object" ? b.franja : null;
  const dias = franjaIn && Array.isArray(franjaIn.dias) ? [...new Set(franjaIn.dias.map(Number).filter((d) => d >= 0 && d <= 6))].sort() : [];
  const franja = franjaIn && dias.length && horaValida(franjaIn.desde) && horaValida(franjaIn.hasta) && franjaIn.desde < franjaIn.hasta ? { dias, desde: franjaIn.desde, hasta: franjaIn.hasta } : null;
  const extras = (Array.isArray(b && b.extras) ? b.extras : [])
    .map((t) => String(t || "").trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, MAX_EXTRAS);
  return {
    descuentoCanchaPct: entero(b && b.descuentoCanchaPct, 0, 100),
    franja,
    descuentoBarPct: entero(b && b.descuentoBarPct, 0, 100),
    descuentoTorneoPct: entero(b && b.descuentoTorneoPct, 0, 100),
    torneoGratis: !!(b && b.torneoGratis === true),
    diasExtraReserva: entero(b && b.diasExtraReserva, 0, 60),
    sinSeña: !!(b && b.sinSeña === true),
    extras,
    sponsors: (Array.isArray(b && b.sponsors) ? b.sponsors : [])
      .map((x) => ({ nombre: String((x && x.nombre) || "").trim().slice(0, 40), detalle: String((x && x.detalle) || "").trim().slice(0, 80), pct: entero(x && x.pct, 0, 100) }))
      .filter((x) => x.nombre && x.pct > 0)
      .slice(0, MAX_SPONSORS),
  };
}

// Sponsors del club (lista con el % de cada nivel) → normalizados
export function normalizarSponsors(lista = []) {
  return (Array.isArray(lista) ? lista : [])
    .map((x) => ({
      nombre: String((x && x.nombre) || "").trim().slice(0, 40),
      detalle: String((x && x.detalle) || "").trim().slice(0, 80),
      pct: Object.fromEntries(["bronce", "plata", "oro"].map((n) => [n, entero(x && x.pct && x.pct[n], 0, 100)])),
    }))
    .filter((x) => x.nombre)
    .slice(0, MAX_SPONSORS);
}
export const tieneBeneficios = (b) => !!b && (b.descuentoCanchaPct > 0 || b.descuentoBarPct > 0 || b.descuentoTorneoPct > 0 || b.torneoGratis || b.diasExtraReserva > 0 || b.sinSeña === true || (b.extras || []).length > 0 || (b.sponsors || []).length > 0);

// Configuración del Pase del club → válida, o { error }
export function normalizarPase({ precio, meses = 1, visible = true, umbrales = {}, beneficios = {}, sponsors = [] } = {}) {
  const p = Number(precio);
  if (!Number.isFinite(p) || p < 100) return { error: "Poné el precio del Pase (mínimo $ 100)" };
  const m = Number(meses);
  if (!MESES_PASE.includes(m)) return { error: "Elegí cada cuánto se cobra (1, 3, 6 o 12 meses)" };
  const plata = entero(umbrales.plata ?? UMBRALES_DEFECTO.plata, 1, 100000);
  const oro = entero(umbrales.oro ?? UMBRALES_DEFECTO.oro, 2, 100000);
  if (oro <= plata) return { error: "Los puntos de Oro tienen que ser más que los de Plata" };
  const ben = Object.fromEntries(NIVELES.map((n) => [n, normalizarBeneficios({ ...(beneficios[n] || {}), sponsors: [] })]));
  const sp = normalizarSponsors(sponsors);
  if (!NIVELES.some((n) => tieneBeneficios(ben[n])) && !sp.some((x) => NIVELES.some((n) => x.pct[n] > 0))) return { error: "Elegí al menos un beneficio" };
  return { precio: Math.round(p), meses: m, visible: visible !== false, umbrales: { plata, oro }, beneficios: ben, sponsors: sp };
}

// Puntos → nivel
export function nivelPorPuntos(puntos, umbrales = UMBRALES_DEFECTO) {
  const p = Number(puntos) || 0;
  const u = { ...UMBRALES_DEFECTO, ...(umbrales || {}) };
  return p >= u.oro ? "oro" : p >= u.plata ? "plata" : "bronce";
}
// ¿Cuánto falta para el próximo nivel? → { siguiente, faltan } | null (ya es Oro)
export function proximoNivel(puntos, umbrales = UMBRALES_DEFECTO) {
  const u = { ...UMBRALES_DEFECTO, ...(umbrales || {}) };
  const p = Number(puntos) || 0;
  if (p < u.plata) return { siguiente: "plata", faltan: u.plata - p };
  if (p < u.oro) return { siguiente: "oro", faltan: u.oro - p };
  return null;
}
export const puntosPorGasto = (monto) => Math.max(0, Math.floor((Number(monto) || 0) / PESOS_POR_PUNTO));
// Beneficios del nivel, con los sponsors que dan descuento en ese nivel (lo que se guarda en el socio)
export const beneficiosDeNivel = (pase, nivel) =>
  normalizarBeneficios({
    ...((pase && pase.beneficios && pase.beneficios[nivel]) || {}),
    sponsors: normalizarSponsors(pase && pase.sponsors).map((x) => ({ nombre: x.nombre, detalle: x.detalle, pct: x.pct[nivel] })),
  });
// Puntos de los últimos 12 meses a partir de los movimientos ({ cantidad, en })
export function puntosVigentes(movimientos = [], ahora = Date.now()) {
  const desde = ahora - DIAS_PUNTOS * 86400000;
  return movimientos.reduce((acc, m) => acc + ((aMs(m && m.en) ?? 0) >= desde ? Number(m.cantidad) || 0 : 0), 0);
}
export const nombrePase = (club) => `Pase Club ${(club && club.nombre) || ""}`.trim();

// "Martes y jueves de 08:00 a 17:00" · "Lun a vie de 08:00 a 17:00"
export function textoFranja(f) {
  if (!f) return "";
  const d = f.dias;
  const consecutivos = d.length > 2 && d.every((x, i) => i === 0 || x === d[i - 1] + 1);
  const dias = d.length === 7 ? "Todos los días" : consecutivos ? `${DIAS_SEMANA[d[0]]} a ${DIAS_SEMANA[d[d.length - 1]].toLowerCase()}` : d.map((x) => DIAS_SEMANA[x]).join(", ");
  return `${dias} de ${f.desde} a ${f.hasta}`;
}

// Beneficios → frases (pantalla del Pase, página del club, escaneo del QR)
export function textosBeneficios(b) {
  if (!b) return [];
  const out = [];
  if (b.descuentoCanchaPct > 0) out.push(`${b.descuentoCanchaPct} % off en la cancha${b.franja ? ` (${textoFranja(b.franja)})` : ""}`);
  if (b.sinSeña) out.push("Reservás sin seña");
  if (b.diasExtraReserva > 0) out.push(`Reservás ${b.diasExtraReserva} ${b.diasExtraReserva === 1 ? "día" : "días"} antes que el resto`);
  if (b.descuentoBarPct > 0) out.push(`${b.descuentoBarPct} % off en el bar`);
  if (b.torneoGratis) out.push("Inscripción gratis a los torneos del club");
  else if (b.descuentoTorneoPct > 0) out.push(`${b.descuentoTorneoPct} % off en la inscripción a los torneos del club`);
  (b.sponsors || []).forEach((x) => out.push(`${x.pct} % off en ${x.nombre}${x.detalle ? ` (${x.detalle})` : ""}`));
  (b.extras || []).forEach((t) => out.push(t));
  return out;
}

// --- Fechas (ms; hora argentina UTC−3) -------------------------------------------------------------------------------
const aMs = (v) => (v == null ? null : typeof v === "number" ? v : typeof v.toMillis === "function" ? v.toMillis() : typeof v.seconds === "number" ? v.seconds * 1000 : new Date(v).getTime());
// +N meses en calendario argentino; si el día no existe (31 → 30/28) queda el último del mes. Vence al final de ese día.
// diaAncla: el día del mes en que arrancó (31 → feb 28 → mar 31, sin correrse a fin de mes)
export function sumarMesesAr(desdeMs, meses, diaAncla = null) {
  const ar = new Date(desdeMs - 3 * 3600 * 1000);
  const y = ar.getUTCFullYear();
  const m = ar.getUTCMonth() + meses;
  const ultimo = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const d = Math.min(diaAncla || ar.getUTCDate(), ultimo);
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

// Un cobro aprobado de la suscripción → cambios del socio. Vigente: suma desde el vencimiento; si no, desde hoy.
// Los beneficios son los del nivel que dan sus puntos (si pasaron los 90 días de la baja, vuelve a Bronce con 0).
export function registrarCobroPase(socio, pase, { ahora = Date.now(), monto = null, paymentId = null } = {}) {
  // La frecuencia es la de SU suscripción (la que autorizó en MP), no la configuración actual del club
  const meses = Number(socio && socio.suscripcion && socio.suscripcion.meses) || Number(pase && pase.meses) || 1;
  const est = estadoSocio(socio, ahora);
  // Vigente, o vencido hace menos que la gracia (cobro reintentado): suma desde el vencimiento; si no, desde hoy
  const venceAntes = aMs(socio && socio.vence);
  const enGracia = !!(socio && socio.estado !== "cancelada" && venceAntes && venceAntes + DIAS_GRACIA_PASE * 86400000 >= ahora);
  const base = (est.activa || enGracia) && venceAntes ? venceAntes : ahora;
  const sigue = est.activa || enGracia;
  const diaAncla = sigue && socio && socio.diaAncla ? socio.diaAncla : new Date(ahora - 3 * 3600 * 1000).getUTCDate();
  const resetear = !!(socio && socio.puntosResetEn && aMs(socio.puntosResetEn) <= ahora);
  const puntos = resetear ? 0 : Number(socio && socio.puntos) || 0;
  const nivel = nivelPorPuntos(puntos, pase && pase.umbrales);
  const entrada = { tipo: est.activa || enGracia ? "renovacion" : "alta", monto: monto === null ? Number(pase && pase.precio) || 0 : Math.max(0, Number(monto) || 0), medio: "mercadopago", meses, en: ahora, paymentId };
  return {
    estado: "activa",
    desde: sigue && socio && aMs(socio.desde) ? aMs(socio.desde) : ahora,
    vence: sumarMesesAr(base, meses, diaAncla),
    diaAncla,
    periodo: periodoDeMeses(meses),
    puntos,
    nivel,
    beneficios: beneficiosDeNivel(pase, nivel),
    planNombre: ETIQUETA_NIVEL[nivel],
    puntosResetEn: null,
    // Si se resetearon, los movimientos viejos ya no cuentan (el recálculo de 12 meses arranca acá)
    ...(resetear ? { puntosDesde: ahora } : {}),
    historial: [...(Array.isArray(socio && socio.historial) ? socio.historial : []), entrada].slice(-50),
  };
}

// Sumar puntos a un socio activo → { puntos, nivel, subio } (los beneficios los recalcula quien llama)
export function sumarPuntos(socio, pase, cantidad) {
  const antes = nivelPorPuntos(socio && socio.puntos, pase && pase.umbrales);
  const puntos = (Number(socio && socio.puntos) || 0) + Math.max(0, Math.floor(Number(cantidad) || 0));
  const nivel = nivelPorPuntos(puntos, pase && pase.umbrales);
  return { puntos, nivel, subio: NIVELES.indexOf(nivel) > NIVELES.indexOf(antes) };
}

// Baja o débito cancelado: beneficios afuera ya; puntos guardados DIAS_CONSERVA_PUNTOS días
export const cambiosBaja = (ahora = Date.now()) => ({ estado: "cancelada", beneficios: null, puntosResetEn: ahora + DIAS_CONSERVA_PUNTOS * 86400000 });

// --- Beneficios en uso -------------------------------------------------------------------------------------------
export const beneficiosVigentes = (socio, ahora = Date.now()) => (estadoSocio(socio, ahora).activa && socio.beneficios ? normalizarBeneficios(socio.beneficios) : null);

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
// Precios por turno → con el descuento del Pase de cada turno; { precios, descuento, pct }
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
export const diasAnticipacionCon = (club, beneficios) => (Number(club?.diasAnticipacion ?? 7) || 7) + (beneficios ? Number(beneficios.diasExtraReserva) || 0 : 0);
export const señaConSocio = (seña, beneficios) => (beneficios && beneficios.sinSeña ? 0 : seña);
// Inscripción a un torneo del club con el Pase → monto a pagar
export const inscripcionConPase = (monto, beneficios) => (!beneficios ? monto : beneficios.torneoGratis ? 0 : Math.round((Number(monto) || 0) * (100 - (beneficios.descuentoTorneoPct || 0)) / 100));

export function nombreCorto(nombre) {
  const partes = String(nombre || "").trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "Socio";
  return partes.length === 1 ? partes[0] : `${partes[0]} ${partes[partes.length - 1][0].toUpperCase()}.`;
}

// Índice público del QR (sociosPublicos/{token}): lo mínimo para verificar en la puerta
export function verificacionPublica(clubId, club, socio) {
  const est = estadoSocio(socio);
  return {
    clubId,
    clubNombre: (club && club.nombre) || null,
    nombre: nombreCorto(socio.nombre),
    numero: socio.numero || null,
    nivel: socio.nivel || null,
    planNombre: socio.nivel ? `${nombrePase(club)} · ${ETIQUETA_NIVEL[socio.nivel]}` : nombrePase(club),
    estado: est.estado,
    vence: est.vence,
    beneficios: est.activa && socio.beneficios ? textosBeneficios(normalizarBeneficios(socio.beneficios)) : [],
  };
}
