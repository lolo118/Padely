// Tarifas y seña: el precio de un turno (una hora de la grilla) según la cancha, el día y la hora; el de una
// reserva de varias horas seguidas; y la seña que pide el club. Todo precio que se muestra o se guarda sale de acá.
//
// Cancha: precioBase (número), horarios ({ "HH:MM": precio } de lunes a viernes), horariosFinde (mismo formato,
// sábado y domingo; un mapa vacío significa "igual que la semana"), horariosDisponibles (["HH:MM"]).
// Club: seña = { tipo: "ninguna" | "porcentaje" | "monto", valor }, maxTurnosPorReserva (1–3), duracionTurno (60).

export const DURACION_TURNO_MINUTOS = 60;
export const MAX_TURNOS_POR_RESERVA = 3;

const numero = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

// "YYYY-MM-DD" -> true los sábados y domingos (en hora local, sin Date.parse)
export function esFinDeSemana(fecha) {
  if (typeof fecha !== "string") return false;
  const [y, m, d] = fecha.split("-").map(Number);
  if (!y || !m || !d) return false;
  const dia = new Date(y, m - 1, d).getDay();
  return dia === 0 || dia === 6;
}

// Precio de UN turno: sáb/dom horariosFinde[hora] ?? horarios[hora] ?? precioBase; el resto horarios[hora] ?? precioBase
export function precioDeSlot(cancha, fecha, hora) {
  const base = numero(cancha?.precioBase) ?? 0;
  const semana = numero(cancha?.horarios?.[hora]);
  if (esFinDeSemana(fecha)) {
    const finde = numero(cancha?.horariosFinde?.[hora]);
    return finde ?? semana ?? base;
  }
  return semana ?? base;
}

// "20:00" + 2 -> "22:00" (no da la vuelta a medianoche: "23:00" + 1 -> "24:00", el cierre del día)
export function sumarHoras(hora, n) {
  const [h, m] = String(hora || "00:00").split(":").map(Number);
  const total = (h || 0) + Number(n || 0);
  return `${String(total).padStart(2, "0")}:${String(m || 0).padStart(2, "0")}`;
}

// Las N horas de una reserva que empieza a `hora`: ["20:00", "21:00"]
export function horasDeReserva(hora, turnos = 1) {
  const n = Math.max(1, Number(turnos) || 1);
  return Array.from({ length: n }, (_, i) => sumarHoras(hora, i));
}

// Precio de cada turno de la reserva, en orden
export function preciosDeReserva(cancha, fecha, hora, turnos = 1) {
  return horasDeReserva(hora, turnos).map((h) => precioDeSlot(cancha, fecha, h));
}

// Precio total de una reserva de `turnos` horas seguidas desde `hora`
export function precioDeReserva(cancha, fecha, hora, turnos = 1) {
  return preciosDeReserva(cancha, fecha, hora, turnos).reduce((a, b) => a + b, 0);
}

// El precio más bajo de la cancha entre la base, la semana y el fin de semana ("desde $ X")
export function precioMinimo(cancha) {
  const valores = [numero(cancha?.precioBase)];
  for (const mapa of [cancha?.horarios, cancha?.horariosFinde]) {
    if (mapa && typeof mapa === "object") Object.values(mapa).forEach((v) => valores.push(numero(v)));
  }
  const validos = valores.filter((v) => v !== null && v > 0);
  if (validos.length === 0) return numero(cancha?.precioBase) ?? 0;
  return Math.min(...validos);
}

// Seña que pide el club para una reserva: 0 si no pide; porcentaje del total; o un monto fijo (nunca más que el total)
export function calcularSeña(club, precioTotal) {
  const config = club?.seña;
  const total = numero(precioTotal) ?? 0;
  if (!config || typeof config !== "object" || config.tipo === "ninguna" || !config.tipo) return 0;
  const valor = numero(config.valor) ?? 0;
  if (config.tipo === "porcentaje") return Math.round((total * Math.min(valor, 100)) / 100);
  if (config.tipo === "monto") return Math.min(Math.round(valor), total);
  return 0;
}

// Turnos seguidos que permite el club por reserva (1–3; 3 si no configuró nada)
export function maxTurnosDelClub(club) {
  const n = Math.round(Number(club?.maxTurnosPorReserva));
  if (!Number.isFinite(n)) return MAX_TURNOS_POR_RESERVA;
  return Math.min(MAX_TURNOS_POR_RESERVA, Math.max(1, n));
}

// "Seña 30 %", "Seña $ 5.000" o "" para mostrar la regla del club (el importe concreto lo da calcularSeña)
export function describirSeña(club) {
  const config = club?.seña;
  if (!config || config.tipo === "ninguna" || !config.tipo) return "";
  const valor = numero(config.valor) ?? 0;
  if (config.tipo === "porcentaje") return `Seña ${valor} %`;
  if (config.tipo === "monto") return `Seña $ ${Math.round(valor).toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
  return "";
}
