// Reservas de varias horas: un documento por turno (clubs/{c}/reservas/{slotId}) y un grupo por reserva.
// Campos del grupo en cada slot: grupoId (id del primer slot), horaInicio, horaFin, turnos, precioTotal, seña,
// señaPagada. Los documentos viejos no los tienen: cuentan como una reserva de una hora (grupoId = su id, seña 0).
import { sumarHoras } from "./tarifas";

export const grupoDeReserva = (r) => r?.grupoId || r?.id || null;

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
    const clave = `${r.clubId || ""}/${r.grupoId}`;
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
  return r.señaPagada ? { tone: "success", label: "Seña cobrada" } : { tone: "warning", monto, label: "pendiente" };
}
