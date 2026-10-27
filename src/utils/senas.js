// src/utils/senas.js — qué pasa con la seña pagada de una reserva cancelada (P3-14 B). Puro, sin imports:
// functions/sync-utils.mjs lo copia a functions/lib/senas.mjs (lo aplica onReservaUpdated).
//
// Política del club (clubs/{c}.politicaSeña): { reembolso: "siempre" | "hasta_horas" | "nunca", horas }.
// - Cancela el club → siempre se devuelve.
// - Cancela el jugador → según la política ("hasta_horas": si faltan al menos `horas` para el turno).
// Si corresponde devolver: pagada con Mercado Pago → devolución por MP (con el respaldo manual de siempre);
// pagada de otra forma (efectivo, transferencia) → crédito para la próxima seña en ese club. Si no corresponde, la
// seña queda para el club.

export const POLITICA_SEÑA_DEFECTO = { reembolso: "hasta_horas", horas: 24 };
export const OPCIONES_REEMBOLSO = ["siempre", "hasta_horas", "nunca"];

export function politicaDe(club) {
  const p = (club && club.politicaSeña) || {};
  const reembolso = OPCIONES_REEMBOLSO.includes(p.reembolso) ? p.reembolso : POLITICA_SEÑA_DEFECTO.reembolso;
  const horas = Number.isFinite(Number(p.horas)) && Number(p.horas) >= 0 ? Number(p.horas) : POLITICA_SEÑA_DEFECTO.horas;
  return { reembolso, horas };
}

// { canceladaPor: "club" | "jugador", politica, inicioTurnoMs, ahoraMs, señaPagada, monto, medio }
// → { accion: "nada" | "reembolso_mp" | "credito" | "queda_club", motivo }
export function resolverSeñaCancelada({ canceladaPor = "jugador", politica = POLITICA_SEÑA_DEFECTO, inicioTurnoMs = null, ahoraMs = Date.now(), señaPagada = false, monto = 0, medio = null } = {}) {
  if (!señaPagada || !(Number(monto) > 0)) return { accion: "nada", motivo: "sin seña pagada" };
  let corresponde;
  let motivo;
  if (canceladaPor === "club") {
    corresponde = true;
    motivo = "canceló el club";
  } else if (politica.reembolso === "siempre") {
    corresponde = true;
    motivo = "la política del club devuelve siempre";
  } else if (politica.reembolso === "nunca") {
    corresponde = false;
    motivo = "la política del club no devuelve la seña";
  } else {
    const faltanMs = inicioTurnoMs === null ? Infinity : inicioTurnoMs - ahoraMs;
    corresponde = faltanMs >= politica.horas * 60 * 60 * 1000;
    motivo = corresponde ? `canceló con ${politica.horas} h o más de anticipación` : `canceló con menos de ${politica.horas} h de anticipación`;
  }
  if (!corresponde) return { accion: "queda_club", motivo };
  return { accion: medio === "mercadopago" ? "reembolso_mp" : "credito", motivo };
}

// Crédito disponible de un jugador en un club: suma de los créditos "disponible" (lista de { clubId, monto, estado })
export const creditoDisponible = (creditos = [], clubId) =>
  creditos.filter((c) => c && c.clubId === clubId && c.estado === "disponible").reduce((s, c) => s + (Number(c.monto) || 0), 0);

// "2026-10-27" + "21:00" → ms del inicio del turno en hora argentina (UTC−3)
export function inicioDelTurnoMs(fecha, hora) {
  const [y, m, d] = String(fecha || "").split("-").map(Number);
  const [hh, mm] = String(hora || "00:00").split(":").map(Number);
  if (!y || !m || !d) return null;
  return Date.UTC(y, m - 1, d, (hh || 0) + 3, mm || 0);
}
