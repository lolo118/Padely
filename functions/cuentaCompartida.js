// functions/cuentaCompartida.js — helpers puros de la cuenta compartida (P3-7) del lado del servidor: participantes,
// la cuenta que nace de una reserva, totales, lo pagado por persona, la ventana del turno, el token de invitación y
// el nombre normalizado para buscar jugadores. Copia servidor de lo que src/utils/cuentas.js hace en el cliente.
const ZONA_HORARIA = "America/Argentina/Buenos_Aires";
const PARTICIPANTES_MAX = 30;
const ID_TITULAR = "titular";
const ALFABETO = "abcdefghjkmnpqrstuvwxyz23456789";
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const redondear = (n) => Math.round(num(n) * 100) / 100;

function generarToken(largo = 16, aleatorios = null) {
  const bytes = aleatorios || require("node:crypto").randomBytes(largo);
  let s = "";
  for (let i = 0; i < largo; i++) s += ALFABETO[bytes[i] % ALFABETO.length];
  return s;
}
// id corto para participantes (sin uuid del navegador)
const nuevoId = () => `p${Date.now().toString(36)}${require("node:crypto").randomBytes(4).toString("hex")}`;

// "María José Pérez" → "maria jose perez" (minúsculas, sin acentos, espacios colapsados)
const nombreBusqueda = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function nuevoParticipante({ id = null, uid = null, nombre = "", tipo = "invitado", anonimo = false, origen = "staff", agregadoPor = null, ahora = new Date() } = {}) {
  return {
    id: id || nuevoId(),
    uid: uid || null,
    nombre: String(nombre || "").trim().slice(0, 40) || "Sin nombre",
    tipo: ["titular", "jugador", "invitado"].includes(tipo) ? tipo : "invitado",
    anonimo: !!anonimo,
    origen,
    agregadoPor: agregadoPor || null,
    agregadoEn: ahora,
    excluirCancha: false,
    canchaFija: null,
    estado: "activo",
  };
}
const titularDe = (cuenta, { agregadoPor = null, ahora = new Date() } = {}) =>
  nuevoParticipante({ id: ID_TITULAR, uid: (cuenta && cuenta.jugadorUid) || null, nombre: (cuenta && cuenta.nombreJugador) || "Titular", tipo: "titular", origen: "titular", agregadoPor, ahora });
// M2 (P3-8b): un invitado sin cuenta (uid null o anónimo) con el mismo nombre normalizado, que no sea el titular y
// que todavía no pagó nada (ningún pago congelado a su nombre ni hecho por él) puede ser reclamado por quien se suma
// con ese nombre desde otro navegador, en vez de duplicarlo.
function huespedReclamable(p, cuenta, nombre) {
  if (!p || p.estado === "quitado" || p.tipo === "titular") return false;
  if (p.uid && !p.anonimo) return false;
  if (!nombre || nombreBusqueda(p.nombre) !== nombreBusqueda(nombre)) return false;
  for (const pago of (cuenta && cuenta.pagos) || []) {
    if (Array.isArray(pago.participanteIds) && pago.participanteIds.includes(p.id)) return false;
    if ((pago.lineas || []).some((l) => l && l.participanteId === p.id)) return false;
  }
  return true;
}
const participantesDe = (cuenta, opts) => (Array.isArray(cuenta && cuenta.participantes) && cuenta.participantes.length ? cuenta.participantes : [titularDe(cuenta, opts)]);
const participantesActivos = (cuenta) => participantesDe(cuenta).filter((p) => p && p.estado !== "quitado");
const uidsDe = (participantes) => [...new Set((participantes || []).filter((p) => p && p.estado !== "quitado" && p.uid).map((p) => p.uid))];

// "HH:MM" + n horas
const sumarHoras = (hora, n) => {
  const [h, m] = String(hora || "00:00").split(":").map(Number);
  return `${String(((h || 0) + n) % 24).padStart(2, "0")}:${String(m || 0).padStart(2, "0")}`;
};
// Datos de la cuenta nueva desde el documento cabeza de la reserva (reservas/{grupoId}); misma forma que el cliente
function cuentaDesdeReserva(grupoId, r, { agregadoPor = null, ahora = new Date() } = {}) {
  const turnos = Math.max(1, Number(r.turnos) || 1);
  const horaInicio = r.horaInicio || r.hora || "";
  const base = {
    reservaGrupoId: grupoId,
    canchaId: r.canchaId || null,
    canchaNombre: r.canchaName || r.canchaNombre || "Cancha",
    fecha: r.fecha,
    horaInicio,
    horaFin: r.horaFin || (horaInicio ? sumarHoras(horaInicio, turnos) : ""),
    turnos,
    jugadorUid: r.jugadorUid || null,
    nombreJugador: r.nombreJugador || "",
    estado: "abierta",
    cancha: { precioTotal: r.precioTotal != null ? num(r.precioTotal) : num(r.precio), seña: num(r.seña), señaPagada: !!r.señaPagada, cobrar: true },
    items: [],
    division: null,
    ventas: [],
    pagos: [],
    invitacion: null,
  };
  const participantes = [titularDe(base, { agregadoPor, ahora })];
  return { ...base, participantes, participantesUids: uidsDe(participantes), totales: calcularTotalesCuenta(base) };
}
function calcularTotalesCuenta(cuenta) {
  const cobra = !cuenta || !cuenta.cancha || cuenta.cancha.cobrar !== false;
  const consumos = redondear(((cuenta && cuenta.items) || []).reduce((s, it) => s + num(it.subtotal), 0));
  const cancha = cobra ? redondear(num(cuenta && cuenta.cancha && cuenta.cancha.precioTotal)) : 0;
  const seña = cobra && cuenta && cuenta.cancha && cuenta.cancha.señaPagada ? redondear(num(cuenta.cancha.seña)) : 0;
  return { consumos, cancha, seña, total: Math.max(0, redondear(consumos + cancha - seña)) };
}
// Lo que cada participante PAGÓ (quien puso la plata: pagos[].participanteIds) y lo que le cubrieron (pagos[].lineas)
function pagadoPorParticipante(cuenta) {
  const pagaron = new Map();
  const cubierto = new Map();
  for (const pago of (cuenta && cuenta.pagos) || []) {
    const ids = Array.isArray(pago.participanteIds) ? pago.participanteIds : [];
    const cuota = ids.length ? redondear(num(pago.total) / ids.length) : 0;
    ids.forEach((id) => pagaron.set(id, redondear((pagaron.get(id) || 0) + cuota)));
    for (const l of pago.lineas || []) if (l.participanteId) cubierto.set(l.participanteId, redondear((cubierto.get(l.participanteId) || 0) + num(l.monto)));
  }
  return { pagaron, cubierto };
}
// ¿Alguien ya pagó una pieza de cancha (o seña)? Entonces la seña de la reserva ya no se copia a la cuenta
const canchaPagadaEnParte = (cuenta) => ((cuenta && cuenta.pagos) || []).some((pg) => (pg.lineas || []).some((l) => (l.tipo === "cancha" || l.tipo === "seña") && num(l.monto) !== 0));
const ALERTA_SEÑA_POSTERIOR = "seña-posterior";
// B-P3-7b-1 del lado del servidor: misma regla que src/utils/cuentas.js sincronizarSeña
function sincronizarSeña(cuenta, reserva) {
  if (!cuenta || cuenta.estado !== "abierta" || !reserva) return { cambios: null, alerta: null };
  const c = cuenta.cancha || {};
  const seña = redondear(num(reserva.seña));
  const pagada = !!reserva.señaPagada;
  if (redondear(num(c.seña)) === seña && !!c.señaPagada === pagada) return { cambios: null, alerta: null };
  if (canchaPagadaEnParte(cuenta)) return { cambios: null, alerta: ALERTA_SEÑA_POSTERIOR };
  const cancha = { ...c, seña, señaPagada: pagada };
  return { cambios: { cancha, totales: calcularTotalesCuenta({ ...cuenta, cancha }) }, alerta: null };
}
// Una línea con pagos congelados no se reasigna ni se quita
const lineaPagada = (cuenta, lineaId) => ((cuenta && cuenta.pagos) || []).some((pg) => (pg.lineas || []).some((l) => l.tipo === "consumo" && l.lineaId === lineaId && num(l.monto) !== 0));
const algoPagadoDe = (cuenta, participanteId) => ((cuenta && cuenta.pagos) || []).some((pg) => (pg.participanteIds || []).includes(participanteId) || (pg.lineas || []).some((l) => l.participanteId === participanteId && num(l.monto) !== 0));

// Instantes del turno en Argentina (UTC−3 fijo)
const msDe = (fecha, hora) => new Date(`${fecha}T${String(hora || "00:00").padStart(5, "0")}:00-03:00`).getTime();
const finDelTurno = (t) => {
  const inicio = t.horaInicio || t.hora || "00:00";
  const fin = t.horaFin || sumarHoras(inicio, Math.max(1, Number(t.turnos) || 1));
  // "00:00" como fin es la medianoche siguiente
  return fin <= inicio ? msDe(t.fecha, inicio) + 60 * 60000 * Math.max(1, Number(t.turnos) || 1) : msDe(t.fecha, fin);
};
const inicioDelTurno = (t) => msDe(t.fecha, t.horaInicio || t.hora || "00:00");
// ¿Se puede sumar alguien ahora? Desde 2 h antes de empezar hasta 2 h después de terminar
const ventanaUnirse = (t, ahoraMs = Date.now(), margenMs = 2 * 60 * 60000) => !!(t && t.fecha) && ahoraMs >= inicioDelTurno(t) - margenMs && ahoraMs <= finDelTurno(t) + margenMs;
// ¿Terminó hace más de `margenMs`? (pedidos colgados, invitación vencida)
const terminoHace = (t, ahoraMs = Date.now(), margenMs = 2 * 60 * 60000) => !!(t && t.fecha) && ahoraMs > finDelTurno(t) + margenMs;

module.exports = {
  ALERTA_SEÑA_POSTERIOR,
  canchaPagadaEnParte,
  sincronizarSeña,
  ID_TITULAR,
  PARTICIPANTES_MAX,
  ZONA_HORARIA,
  calcularTotalesCuenta,
  cuentaDesdeReserva,
  finDelTurno,
  generarToken,
  inicioDelTurno,
  lineaPagada,
  algoPagadoDe,
  huespedReclamable,
  nombreBusqueda,
  nuevoParticipante,
  pagadoPorParticipante,
  participantesActivos,
  participantesDe,
  sumarHoras,
  terminoHace,
  titularDe,
  uidsDe,
  ventanaUnirse,
};
