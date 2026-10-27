// src/utils/limites.js — límites de frecuencia (P3-12). users/{uid}/limites/{tipo} = { ventanaInicio, cuenta,
// actualizadoEn } se escribe en el MISMO batch/transacción que la reserva o la inscripción; las reglas exigen que
// esté (getAfter(...).actualizadoEn == request.time) y que no pase el máximo en la ventana. Puro, sin imports.
export const VENTANA_MS = 10 * 60 * 1000;
export const LIMITES = { reservas: 5, inscripciones: 5 };
// Margen para el reloj del celular: el cliente solo abre una ventana nueva si la vieja venció hace más de 1 minuto
// (las reglas la abren con request.time del servidor).
const MARGEN_MS = 60 * 1000;

// actual: el documento de límites ({ ventanaInicio (ms), cuenta }) o null. Devuelve lo que hay que escribir:
// { nuevaVentana, cuenta, excede }. Si excede, no se escribe nada y se avisa al usuario.
export function siguienteLimite(actual, ahora, tipo) {
  const max = LIMITES[tipo] ?? 5;
  const inicio = actual && Number.isFinite(actual.ventanaInicio) ? actual.ventanaInicio : null;
  if (inicio === null || ahora - inicio > VENTANA_MS + MARGEN_MS) return { nuevaVentana: true, cuenta: 1, excede: false };
  const cuenta = (Number(actual.cuenta) || 0) + 1;
  return { nuevaVentana: false, cuenta, excede: cuenta > max };
}

// Minutos que faltan para poder volver a intentar (para el mensaje)
export const minutosParaReintentar = (actual, ahora) =>
  actual && Number.isFinite(actual.ventanaInicio) ? Math.max(1, Math.ceil((actual.ventanaInicio + VENTANA_MS + MARGEN_MS - ahora) / 60000)) : 1;
