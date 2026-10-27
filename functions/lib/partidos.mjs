// GENERADO por functions/sync-utils.mjs desde src/utils/partidos.js — NO EDITAR ACÁ (editá el original y volvé a correr el sync).
// src/utils/partidos.js — partidos abiertos (P3-15): el titular de una reserva confirmada avisa "me faltan N
// jugadores" y otros se suman desde el Hub o la página del club. Puro, sin imports: functions/sync-utils.mjs lo
// copia a functions/lib/partidos.mjs (lo usan las callables y onReservaUpdated).
//
// reservas/{r}.partidoAbierto = { faltan (1 a 3), nivel (categoría o null), nota, jugadores: [{ uid, nombre }], creadoEn }
// partidosAbiertos/{reservaId} = índice público (sin nombres ni teléfonos) que escriben solo las Functions.

export const MAX_FALTAN = 3;
export const NIVELES_PARTIDO = ["8va", "7ma", "6ta", "5ta", "4ta", "3era", "2da", "1era", "Libre"];

// Datos que manda el titular → partido válido, o { error }
export function normalizarPartido({ faltan, nivel = null, nota = "" } = {}) {
  const n = Math.floor(Number(faltan));
  if (!Number.isFinite(n) || n < 1 || n > MAX_FALTAN) return { error: `Elegí cuántos jugadores te faltan (1 a ${MAX_FALTAN})` };
  const nv = nivel && NIVELES_PARTIDO.includes(nivel) ? nivel : null;
  return { faltan: n, nivel: nv, nota: String(nota || "").trim().slice(0, 120) };
}

export const jugadoresDe = (partido) => (partido && Array.isArray(partido.jugadores) ? partido.jugadores.filter((j) => j && j.uid) : []);
export const lugaresLibres = (partido) => (partido ? Math.max(0, (Number(partido.faltan) || 0) - jugadoresDe(partido).length) : 0);

// "2026-10-28" + "21:00" → ms del inicio en hora argentina (UTC−3)
export function inicioMs(fecha, hora) {
  const [y, m, d] = String(fecha || "").split("-").map(Number);
  const [hh, mm] = String(hora || "00:00").split(":").map(Number);
  if (!y || !m || !d) return null;
  return Date.UTC(y, m - 1, d, (hh || 0) + 3, mm || 0);
}

// ¿Sigue publicado? Reserva confirmada, partido abierto con lugares y el turno todavía no empezó
export function partidoVigente(reserva, ahora = Date.now()) {
  if (!reserva || reserva.status !== "confirmada" || !reserva.partidoAbierto) return false;
  const inicio = inicioMs(reserva.fecha, reserva.horaInicio || reserva.hora);
  return lugaresLibres(reserva.partidoAbierto) > 0 && inicio !== null && inicio > ahora;
}

// ¿Puede sumarse este uid? → { ok, motivo }
export function puedeSumarse(reserva, uid, ahora = Date.now()) {
  if (!uid) return { ok: false, motivo: "Entrá con tu cuenta para sumarte" };
  if (!reserva || !reserva.partidoAbierto) return { ok: false, motivo: "Este partido ya no busca jugadores" };
  if (reserva.jugadorUid === uid) return { ok: false, motivo: "Es tu propio turno" };
  if (jugadoresDe(reserva.partidoAbierto).some((j) => j.uid === uid)) return { ok: false, motivo: "Ya estás en este partido" };
  if (reserva.status !== "confirmada") return { ok: false, motivo: "El turno ya no está confirmado" };
  const inicio = inicioMs(reserva.fecha, reserva.horaInicio || reserva.hora);
  if (inicio === null || inicio <= ahora) return { ok: false, motivo: "El turno ya empezó" };
  if (lugaresLibres(reserva.partidoAbierto) <= 0) return { ok: false, motivo: "El partido ya está completo" };
  return { ok: true, motivo: null };
}

export const conJugador = (partido, jugador) => ({ ...partido, jugadores: [...jugadoresDe(partido), { uid: jugador.uid, nombre: String(jugador.nombre || "Jugador").slice(0, 40) }] });
export const sinJugador = (partido, uid) => ({ ...partido, jugadores: jugadoresDe(partido).filter((j) => j.uid !== uid) });

// Índice público: lo mínimo para listar (sin nombres de jugadores ni contacto)
export function indicePublico(reservaId, reserva, club = {}, clubId = null) {
  const p = reserva.partidoAbierto || {};
  return {
    reservaId,
    clubId: clubId || reserva.clubId || null,
    clubNombre: club.nombre || null,
    ciudad: club.ciudad || null,
    provincia: club.provincia || null,
    canchaNombre: reserva.canchaName || reserva.canchaNombre || null,
    fecha: reserva.fecha || null,
    horaInicio: reserva.horaInicio || reserva.hora || null,
    horaFin: reserva.horaFin || null,
    inicioMs: inicioMs(reserva.fecha, reserva.horaInicio || reserva.hora),
    faltan: Number(p.faltan) || 0,
    libres: lugaresLibres(p),
    nivel: p.nivel || null,
    nota: p.nota || "",
  };
}
