// Reservas de varias horas: un documento por turno (clubs/{c}/reservas/{slotId}) y un grupo por reserva.
// Campos del grupo en cada slot: grupoId (id del primer slot), horaInicio, horaFin, turnos, precioTotal, seña,
// señaPagada. Los documentos viejos no los tienen: cuentan como una reserva de una hora (grupoId = su id, seña 0).
import { sumarHoras } from "./tarifas";

export const grupoDeReserva = (r) => r?.grupoId || r?.id || null;

// Milisegundos de createdAt (Timestamp de Firestore o Date); null si no hay. Los N slots de una reserva se crean
// en una sola transacción, así que comparten el mismo createdAt del servidor.
const creadoEnMs = (r) => {
  const c = r?.createdAt;
  if (!c) return null;
  if (typeof c.toMillis === "function") return c.toMillis();
  if (typeof c.seconds === "number") return c.seconds * 1000;
  if (c instanceof Date) return c.getTime();
  return null;
};

// Un slot cancelado de una reserva vieja conserva su grupoId; si otra persona reserva después la misma primera hora,
// el id de grupo se repite. Dos slots son de la misma reserva solo si además comparten vigencia (cancelada o no),
// jugador y, cuando los dos lo tienen, el instante de creación.
export function mismaReserva(a, b) {
  if (!a || !b) return false;
  if (grupoDeReserva(a) !== grupoDeReserva(b)) return false;
  if ((a.status === "cancelada") !== (b.status === "cancelada")) return false;
  if ((a.jugadorUid || null) !== (b.jugadorUid || null)) return false;
  const ca = creadoEnMs(a);
  const cb = creadoEnMs(b);
  if (ca !== null && cb !== null && ca !== cb) return false;
  return true;
}

// Clave de agrupación con el mismo criterio que mismaReserva
export const claveDeGrupo = (r) =>
  `${r?.clubId || ""}/${grupoDeReserva(r)}/${r?.status === "cancelada" ? "c" : "v"}/${r?.jugadorUid || ""}/${creadoEnMs(r) ?? ""}`;

// "20:00 – 22:00" (guion largo con espacios, como el design system)
export function rangoHoras(horaInicio, horaFin) {
  if (!horaInicio) return "";
  return horaFin && horaFin !== horaInicio ? `${horaInicio} – ${horaFin}` : horaInicio;
}

// Completa los campos de grupo de un slot viejo (una hora) sin tocar los que ya tiene
export function normalizarReserva(r) {
  if (!r) return r;
  const turnos = Math.max(1, Number(r.turnos) || 1);
  const horaInicio = r.horaInicio || r.hora || "";
  return {
    ...r,
    grupoId: r.grupoId || r.id,
    turnos,
    horaInicio,
    horaFin: r.horaFin || (horaInicio ? sumarHoras(horaInicio, turnos) : ""),
    precioTotal: r.precioTotal != null ? Number(r.precioTotal) || 0 : Number(r.precio) || 0,
    seña: Number(r.seña) || 0,
    señaPagada: !!r.señaPagada,
  };
}

// El primer slot del grupo es el que lleva el nombre y las acciones en la grilla
export const esPrimerSlot = (r) => !r?.grupoId || r.grupoId === r.id;

// Agrupa una lista de slots en reservas: una entrada por grupoId, con los datos del primer slot y `slots` (todos,
// por hora). El status del grupo es el del primer slot. Ordenadas por fecha y hora de inicio.
export function agruparReservas(lista) {
  const grupos = new Map();
  (lista || []).forEach((raw) => {
    const r = normalizarReserva(raw);
    const clave = claveDeGrupo(r);
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(r);
  });
  const resultado = [];
  grupos.forEach((slots) => {
    slots.sort((a, b) => String(a.hora || "").localeCompare(String(b.hora || "")));
    const primero = slots.find((s) => s.id === s.grupoId) || slots[0];
    const turnos = slots.length > 1 ? slots.length : primero.turnos;
    resultado.push({
      ...primero,
      id: primero.grupoId,
      claveGrupo: claveDeGrupo(primero),
      slotId: primero.id,
      slots,
      turnos,
      hora: primero.horaInicio,
      horaInicio: primero.horaInicio,
      horaFin: slots.length > 1 ? slots[slots.length - 1].horaFin || sumarHoras(slots[slots.length - 1].hora, 1) : primero.horaFin,
      precioTotal: slots.length > 1 ? slots.reduce((acc, s) => acc + (Number(s.precio) || 0), 0) : primero.precioTotal,
    });
  });
  resultado.sort((a, b) => `${a.fecha || ""}${a.horaInicio || ""}`.localeCompare(`${b.fecha || ""}${b.horaInicio || ""}`));
  return resultado;
}

// Etiqueta de la seña de una reserva para el Badge: null cuando el club no pide seña
export function estadoSeña(r) {
  const monto = Number(r?.seña) || 0;
  if (monto <= 0) return null;
  return r.señaPagada ? { tone: "success", label: r.señaMedio === "mercadopago" ? "Seña pagada por Mercado Pago" : r.señaMedio === "credito" ? "Seña pagada con crédito" : "Seña cobrada", medio: r.señaMedio || null } : { tone: "warning", monto, label: "pendiente" };
}
