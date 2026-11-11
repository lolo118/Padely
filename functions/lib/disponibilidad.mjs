// GENERADO por functions/sync-utils.mjs desde src/utils/disponibilidad.js — NO EDITAR ACÁ (editá el original y volvé a correr el sync).
// src/utils/disponibilidad.js — qué turnos están libres en la grilla de un club, con el MISMO criterio que la grilla
// pública (ClubPublico.jsx: estadoDeCelda y horasVisibles). Puro y sin imports: functions/sync-utils.mjs lo copia a
// functions/lib/disponibilidad.mjs para el bot de WhatsApp (que ofrece turnos de la grilla real).
//
// Una celda (cancha, hora) está "libre" si no tiene una reserva viva (cualquier status que no sea "cancelada", sea de un
// jugador, del club, de un torneo o de una clase), no es un turno fijo activo de ese día de la semana y la cancha abre a
// esa hora (cancha.horariosDisponibles). Hoy, la hora en curso y las anteriores no se ofrecen.

export const DIAS_SEMANA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
export const ANTICIPACION_DEFECTO = 7;

// "YYYY-MM-DD" → 0 (domingo) … 6 (sábado), sin Date.parse ni zona horaria
export function diaDeSemana(fecha) {
  const [y, m, d] = String(fecha || "").split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// "YYYY-MM-DD" + n días → "YYYY-MM-DD"
export function sumarDias(fecha, n) {
  const [y, m, d] = String(fecha || "").split("-").map(Number);
  const f = new Date(Date.UTC(y, m - 1, d + Number(n || 0)));
  return `${f.getUTCFullYear()}-${String(f.getUTCMonth() + 1).padStart(2, "0")}-${String(f.getUTCDate()).padStart(2, "0")}`;
}

// La reserva viva de una celda (en una reserva de varias horas, cada hora tiene su slot)
export const reservaEnCelda = (reservas, canchaId, hora) =>
  (reservas || []).find((r) => r && r.canchaId === canchaId && r.hora === hora && r.status !== "cancelada") || null;

export function esTurnoFijo(turnosFijos, canchaId, fecha, hora) {
  const dia = DIAS_SEMANA[diaDeSemana(fecha)];
  return (turnosFijos || []).some((t) => t && t.canchaId === canchaId && t.dia === dia && (t.horas || [t.hora]).includes(hora) && t.status === "activo");
}

// "libre" | "pendiente" | "reservada" | "fijo" | "bloqueada" (mismo orden que la grilla)
export function estadoDeCelda({ cancha, hora, fecha, reservas, turnosFijos }) {
  const reserva = reservaEnCelda(reservas, cancha.id, hora);
  if (reserva) return reserva.status === "pendiente" ? "pendiente" : "reservada";
  if (esTurnoFijo(turnosFijos, cancha.id, fecha, hora)) return "fijo";
  if (!(cancha.horariosDisponibles || []).includes(hora)) return "bloqueada";
  return "libre";
}

// Cuántas horas seguidas desde `hora` están libres en la cancha (sin pasar de medianoche), hasta `max`
export function horasSeguidasLibres({ cancha, hora, fecha, reservas, turnosFijos, max = 3 }) {
  let n = 0;
  const [h0] = String(hora).split(":").map(Number);
  while (n < max) {
    const h = h0 + n;
    if (h >= 24) break;
    const hh = `${String(h).padStart(2, "0")}:00`;
    if (estadoDeCelda({ cancha, hora: hh, fecha, reservas, turnosFijos }) !== "libre") break;
    n += 1;
  }
  return n;
}

// Turnos libres del día, por hora: [{ hora, canchas: [cancha, …] }] ordenados. `horaAhora` ("HH:00", solo si la fecha es
// hoy) saca la hora en curso y las anteriores, como la grilla.
export function turnosLibres({ canchas, reservas, turnosFijos, fecha, horaAhora = null }) {
  const porHora = new Map();
  (canchas || [])
    .filter(Boolean)
    .forEach((cancha) => {
      (cancha.horariosDisponibles || []).forEach((hora) => {
        if (horaAhora && hora <= horaAhora) return;
        if (estadoDeCelda({ cancha, hora, fecha, reservas, turnosFijos }) !== "libre") return;
        if (!porHora.has(hora)) porHora.set(hora, []);
        porHora.get(hora).push(cancha);
      });
    });
  return [...porHora.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([hora, lista]) => ({ hora, canchas: lista.sort((a, b) => String(a.nombre || "").localeCompare(String(b.nombre || ""), "es", { numeric: true })) }));
}

// Id determinístico por turno (el mismo de services/canchaService.slotId): una cancha + fecha + hora = un documento
export const slotIdDe = (canchaId, fecha, hora) => `${canchaId}_${fecha}_${String(hora).replace(":", "")}`;

// Los documentos de una reserva de `turnos` horas seguidas (como services/canchaService.crearReserva): un slot por hora
// con su precio, y los campos del grupo. → { grupoId, horaInicio, horaFin, turnos, precioTotal, slots: [{ id, hora, precio }] }
export function slotsDeReserva({ canchaId, fecha, hora, turnos = 1, precios = [] }) {
  const n = Math.min(3, Math.max(1, Number(turnos) || 1));
  const [h0] = String(hora).split(":").map(Number);
  const hh = (h) => `${String(h).padStart(2, "0")}:00`;
  const slots = Array.from({ length: n }, (_, i) => ({ id: slotIdDe(canchaId, fecha, hh(h0 + i)), hora: hh(h0 + i), precio: Number(precios[i]) || 0 }));
  return { grupoId: slots[0].id, horaInicio: slots[0].hora, horaFin: hh(h0 + n), turnos: n, precioTotal: slots.reduce((a, s) => a + s.precio, 0), slots };
}

// Días reservables: de hoy a hoy + diasAnticipacion del club (7 si no configuró nada), inclusive
export function diasReservables(club, hoy) {
  const n = Number.isFinite(Number(club && club.diasAnticipacion)) && club.diasAnticipacion !== null ? Math.max(0, Math.round(Number(club.diasAnticipacion))) : ANTICIPACION_DEFECTO;
  return Array.from({ length: n + 1 }, (_, i) => sumarDias(hoy, i));
}
