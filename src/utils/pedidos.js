// Pedidos a la barra: helpers puros (sin Firebase ni React). Los usan la página Pedir, el tablero Barra y los tests.
import { fechaLocalDe } from "./cuentas.js";

export const ESTADOS_PEDIDO = ["pendiente", "aceptado", "listo", "entregado", "rechazado", "cancelado"];
export const ESTADOS_ACTIVOS = ["pendiente", "aceptado", "listo"];
export const MAX_PENDIENTES = 3; // pedidos en espera por cuenta
export const MAX_ITEMS = 20;

export const ETIQUETA_ESTADO_PEDIDO = {
  pendiente: "Pendiente",
  aceptado: "Aceptado",
  listo: "Listo",
  entregado: "Entregado",
  rechazado: "Rechazado",
  cancelado: "Cancelado",
};
export const TONO_ESTADO_PEDIDO = { pendiente: "warning", aceptado: "court", listo: "success", entregado: "neutral", rechazado: "danger", cancelado: "neutral" };
export const etiquetaEstado = (e) => ETIQUETA_ESTADO_PEDIDO[e] || String(e || "");
export const tonoEstado = (e) => TONO_ESTADO_PEDIDO[e] || "neutral";

// A dónde puede pasar un pedido: la barra lo acepta/rechaza, lo marca listo y entregado; el jugador cancela en espera
const TRANSICIONES = {
  pendiente: ["aceptado", "rechazado", "cancelado"],
  aceptado: ["listo", "cancelado"],
  listo: ["entregado", "cancelado"],
};
export const transicionValida = (de, a) => (TRANSICIONES[de] || []).includes(a);

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
export const subtotalPedido = (items = []) => Math.round(items.reduce((s, it) => s + num(it.precio) * num(it.cantidad), 0) * 100) / 100;

// "2 Agua, 1 Cerveza"
export const resumenItems = (items = []) => items.map((it) => `${num(it.cantidad).toLocaleString("es-AR", { maximumFractionDigits: 3 })} ${it.nombre}`).join(", ");

const minutosDe = (hora) => {
  const [h, m] = String(hora || "00:00").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};
const finDe = (r) => (r?.horaFin ? minutosDe(r.horaFin) : minutosDe(r?.horaInicio || r?.hora) + 60 * (Number(r?.turnos) || 1));

// ¿Se puede pedir en esta reserva ahora? Confirmada, de hoy, desde 15 min antes de empezar hasta que termina
export function puedePedir(reserva, ahora = new Date(), { antesMin = 15, despuesMin = 0 } = {}) {
  if (!reserva || reserva.status !== "confirmada" || !reserva.fecha || reserva.fecha !== fechaLocalDe(ahora)) return false;
  const inicio = minutosDe(reserva.horaInicio || reserva.hora);
  const fin = finDe(reserva);
  const t = ahora.getHours() * 60 + ahora.getMinutes();
  return t >= inicio - antesMin && t <= fin + despuesMin;
}

// La reserva en juego en una cancha ahora (ventana 15 min antes / 15 min después), o null
export function reservaEnJuego(reservas = [], canchaId, ahora = new Date(), { antesMin = 15, despuesMin = 15 } = {}) {
  const t = ahora.getHours() * 60 + ahora.getMinutes();
  const hoy = fechaLocalDe(ahora);
  const candidatas = reservas.filter((r) => r && r.canchaId === canchaId && r.status === "confirmada" && r.fecha === hoy);
  const enJuego = candidatas.filter((r) => t >= minutosDe(r.horaInicio || r.hora) - antesMin && t <= finDe(r) + despuesMin);
  if (!enJuego.length) return null;
  // Si dos se solapan en el margen (uno termina, otro empieza), gana el que ya empezó o empieza antes
  enJuego.sort((a, b) => minutosDe(a.horaInicio || a.hora) - minutosDe(b.horaInicio || b.hora));
  const empezadas = enJuego.filter((r) => t >= minutosDe(r.horaInicio || r.hora));
  return empezadas.length ? empezadas[empezadas.length - 1] : enJuego[0];
}

// "recién" / "hace 3 min" / "hace 1 h 05"
export function haceCuanto(ts, ahora = new Date()) {
  const d = ts && typeof ts.toDate === "function" ? ts.toDate() : ts instanceof Date ? ts : ts ? new Date(ts) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  const min = Math.max(0, Math.round((ahora.getTime() - d.getTime()) / 60000));
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `hace ${h} h${m ? ` ${String(m).padStart(2, "0")}` : ""}`;
}

// Datos del pedido a partir del carrito y la reserva (sin timestamps: los pone el servicio)
export function pedidoDesdeCarrito({ reserva, carrito = [], nota = "", uid, nombre, origen = "celular", anonimo = false, qrToken = null }) {
  const items = carrito
    .filter((l) => num(l.cantidad) > 0)
    .slice(0, MAX_ITEMS)
    .map((l) => ({ productoId: l.productoId, nombre: l.nombre, precio: num(l.precio), cantidad: num(l.cantidad), controlaStock: l.controlaStock !== false }));
  const grupoId = reserva.grupoId || reserva.id;
  const base = {
    cuentaId: grupoId,
    reservaGrupoId: grupoId,
    canchaId: reserva.canchaId || null,
    canchaNombre: reserva.canchaName || reserva.canchaNombre || "Cancha",
    fecha: reserva.fecha,
    horaInicio: reserva.horaInicio || reserva.hora || "",
    horaFin: reserva.horaFin || "",
    jugadorUid: uid,
    anonimo: !!anonimo,
    nombre: String(nombre || "").trim(),
    items,
    nota: String(nota || "").trim() || null,
    subtotal: subtotalPedido(items),
    estado: "pendiente",
    origen: origen === "qr" ? "qr" : "celular",
  };
  if (origen === "qr") base.qrToken = qrToken || null;
  return base;
}

// Alfabeto sin caracteres ambiguos para el token del QR
const ALFABETO = "abcdefghjkmnpqrstuvwxyz23456789";
export function generarToken(largo = 10, aleatorios = null) {
  const bytes = aleatorios || (typeof crypto !== "undefined" && crypto.getRandomValues ? crypto.getRandomValues(new Uint8Array(largo)) : Array.from({ length: largo }, () => Math.floor(Math.random() * 256)));
  let s = "";
  for (let i = 0; i < largo; i++) s += ALFABETO[bytes[i] % ALFABETO.length];
  return s;
}
