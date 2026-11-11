// Inicio del jugador: helpers puros (sin Firebase ni React). Los usan src/pages/Inicio.jsx, el servicio que arma la
// próxima reserva y los clubes habituales (canchaService.getInicioReservasJugador) y los tests (inicio.test.js).
// Las reservas llegan ya agrupadas (agruparReservas): una entrada por reserva, con fecha, horaInicio, horaFin, status.
import { lugarDeCuenta, participantePorUid, saldosDeCuenta } from "./cuentas.js";
import { proximoNivel, UMBRALES_DEFECTO } from "./membresias.js";
import { addDaysLocal, formatDiaCorto } from "./formatDate.js";

// Estados de una reserva que ya no se juega
const CERRADAS = ["cancelada", "rechazada", "expirada"];
const reservaCerrada = (r) => CERRADAS.includes(r?.status);
const ordenFechaHora = (a, b) => `${a.fecha || ""}${a.horaInicio || a.hora || ""}`.localeCompare(`${b.fecha || ""}${b.horaInicio || b.hora || ""}`);

export const saludoPorHora = (hora) => (hora < 12 ? "Buenos días" : hora < 19 ? "Buenas tardes" : "Buenas noches");

// "HH:MM" local de un Date
export const horaMinutos = (d = new Date()) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

// Las reservas que todavía no terminaron (hoy: la hora de fin es posterior a `hora`), la más cercana primero
export function reservasProximas(grupos, { hoy, hora = "00:00" } = {}) {
  return (grupos || [])
    .filter((r) => r && r.fecha && !reservaCerrada(r))
    .filter((r) => r.fecha > hoy || (r.fecha === hoy && String(r.horaFin || r.horaInicio || r.hora || "") > hora))
    .sort(ordenFechaHora);
}

// Los clubes donde más reservó (las canceladas no cuentan): el más frecuente primero y, a igualdad, el de la reserva
// más reciente. Los favoritos (users/{uid}.favoritos) completan la lista si queda lugar. → [{ clubId, veces, ultima }]
export function clubesHabituales(grupos, { max = 3, favoritos = [] } = {}) {
  const porClub = new Map();
  (grupos || []).forEach((r) => {
    if (!r?.clubId || r.status === "cancelada") return;
    const previo = porClub.get(r.clubId) || { clubId: r.clubId, veces: 0, ultima: "" };
    previo.veces += 1;
    if (String(r.fecha || "") > previo.ultima) previo.ultima = String(r.fecha || "");
    porClub.set(r.clubId, previo);
  });
  const lista = [...porClub.values()].sort((a, b) => b.veces - a.veces || b.ultima.localeCompare(a.ultima));
  (Array.isArray(favoritos) ? favoritos : []).forEach((id) => {
    if (id && !porClub.has(id) && !lista.some((c) => c.clubId === id)) lista.push({ clubId: id, veces: 0, ultima: "" });
  });
  return lista.slice(0, Math.max(0, max));
}

// Link de Google Maps al club: por coordenadas si las tiene; si no, por la dirección (sin dirección no hay link)
export function linkComoLlegar(club) {
  if (!club) return null;
  const lat = club.lat ?? club.ubicacion?.lat ?? club.ubicacion?.latitude;
  const lng = club.lng ?? club.ubicacion?.lng ?? club.ubicacion?.longitude;
  if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  const direccion = String(club.direccion || "").trim();
  if (!direccion) return null;
  const texto = [club.nombre, direccion, club.ciudad, club.provincia].map((s) => String(s || "").trim()).filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(texto)}`;
}

// Texto para compartir el turno por WhatsApp (sin link de la cuenta: ese lo arma "Invitar" en Mis reservas)
export function mensajeTurno({ fechaTexto, rango, clubNombre, canchaNombre, mapa = null }) {
  const donde = `${clubNombre || "el club"}${canchaNombre ? ` (${canchaNombre})` : ""}`;
  return `¡Tenemos cancha! ${fechaTexto}${rango ? `, ${rango}` : ""}, en ${donde}.${mapa ? ` Cómo llegar: ${mapa}` : ""}`;
}

// Inscripción a torneo → lo que le falta, en palabras
export function etiquetaInscripcion(status) {
  if (status === "esperando_companero") return "Esperando a tu pareja";
  if (status === "pendiente_aprobacion") return "Esperando al organizador";
  if (String(status || "").startsWith("pendiente")) return "Pendiente";
  const texto = String(status || "pendiente").replace(/_/g, " ");
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
export const inscripcionPendiente = (i) => !!i && i.status !== "confirmada" && i.status !== "rechazada";

// Lo que el jugador tiene que resolver, lo más urgente primero:
//   pagar (debe algo en una cuenta abierta) · seña (reserva que viene con seña sin pagar) · sumado (lo sumaron a un
//   turno y no debe nada) · inscripcion (inscripción a torneo sin confirmar). A igualdad, por fecha y hora.
//   excluir: "clubId/grupoId" de la reserva que ya se muestra arriba (su seña y su cuenta están en esa tarjeta)
const PRIORIDAD = { pagar: 0, seña: 1, sumado: 2, inscripcion: 3 };
export function pendientesDeInicio({ uid = null, proximas = [], cuentas = [], inscripciones = [], excluir = null } = {}) {
  const items = [];
  const vistas = new Set();
  (cuentas || []).forEach((c) => {
    if (!c?.clubId || !c.id) return;
    const clave = `${c.clubId}/${c.id}`;
    if (vistas.has(clave) || c.estado !== "abierta") return;
    vistas.add(clave);
    const esTitular = !!uid && c.jugadorUid === uid;
    const base = { clave: `cuenta/${clave}`, clubId: c.clubId, id: c.id, fecha: c.fecha || "", hora: c.horaInicio || "", canchaNombre: c.canchaNombre || "", titular: c.nombreJugador || "", esTitular, mesa: c.tipo === "mesa", lugar: lugarDeCuenta(c) };
    let debe = 0;
    const saldos = saldosDeCuenta(c);
    if (saldos.legacy) debe = esTitular ? saldos.pendiente : 0;
    else {
      const yo = participantePorUid(c, uid);
      const mio = yo ? saldos.participantes.find((p) => p.id === yo.id) : null;
      debe = mio ? Number(mio.debe) || 0 : 0;
    }
    if (clave === excluir) return;
    if (debe > 0) items.push({ ...base, tipo: "pagar", monto: debe });
    else if (!esTitular) items.push({ ...base, tipo: "sumado" });
  });
  (proximas || []).forEach((r) => {
    const clave = `${r.clubId}/${r.grupoId || r.id}`;
    if (clave === excluir || reservaCerrada(r)) return;
    const seña = Number(r.seña) || 0;
    if (seña > 0 && !r.señaPagada) items.push({ tipo: "seña", clave: `seña/${clave}`, clubId: r.clubId, id: r.grupoId || r.id, fecha: r.fecha || "", hora: r.horaInicio || "", monto: seña, clubNombre: r.clubNombre || "", canchaNombre: r.canchaName || "" });
  });
  (inscripciones || []).filter(inscripcionPendiente).forEach((i) => {
    items.push({ tipo: "inscripcion", clave: `insc/${i.torneoId}/${i.id}`, torneoId: i.torneoId, id: i.id, fecha: i.torneoFechaInicio || "", hora: "", torneoNombre: i.torneoNombre || "Torneo", status: i.status });
  });
  return items.sort((a, b) => PRIORIDAD[a.tipo] - PRIORIDAD[b.tipo] || ordenFechaHora({ fecha: a.fecha, horaInicio: a.hora }, { fecha: b.fecha, horaInicio: b.hora }));
}

// Torneos con inscripción abierta donde no está anotado, los que empiezan antes primero (sin fecha, al final)
export function torneosParaInscribirse(abiertos, inscripciones = [], { hoy = "", max = 3 } = {}) {
  const anotado = new Set((inscripciones || []).filter((i) => i.status !== "rechazada").map((i) => i.torneoId));
  return (abiertos || [])
    .filter((t) => t?.id && !anotado.has(t.id))
    .filter((t) => !t.fechaInicio || !hoy || String(t.fechaInicio) >= hoy)
    .sort((a, b) => (a.fechaInicio ? 0 : 1) - (b.fechaInicio ? 0 : 1) || String(a.fechaInicio || "").localeCompare(String(b.fechaInicio || "")))
    .slice(0, Math.max(0, max));
}

// Progreso del Pase al nivel siguiente: { siguiente, faltan, pct (0..100) }, o null si ya está en Oro
export function progresoPase(puntos, umbrales = UMBRALES_DEFECTO) {
  const u = { ...UMBRALES_DEFECTO, ...(umbrales || {}) };
  const p = Math.max(0, Number(puntos) || 0);
  const prox = proximoNivel(p, u);
  if (!prox) return null;
  const desde = prox.siguiente === "plata" ? 0 : u.plata;
  const hasta = prox.siguiente === "plata" ? u.plata : u.oro;
  const pct = hasta > desde ? Math.round(((p - desde) / (hasta - desde)) * 100) : 0;
  return { ...prox, pct: Math.min(100, Math.max(0, pct)) };
}

// Un jugador recién llegado: sin reservas (ni turnos a los que lo sumaron), sin Pase y sin torneos
export const esJugadorNuevo = ({ reservas = 0, cuentas = 0, pases = 0, inscripciones = 0 } = {}) => !reservas && !cuentas && !pases && !inscripciones;

// "Hoy" / "Mañana" / "sáb 18 oct"
export function diaRelativo(fecha, hoy) {
  if (!fecha) return "";
  if (fecha === hoy) return "Hoy";
  if (hoy && fecha === addDaysLocal(hoy, 1)) return "Mañana";
  return formatDiaCorto(fecha);
}
