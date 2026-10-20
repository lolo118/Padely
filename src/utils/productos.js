// Helpers de productos del bar (sin dependencias de Firebase: los usa también la importación)

// Nombre para comparar: minúsculas, sin acentos, espacios simples ("  Agua   Mineral " → "agua mineral")
export function normalizarNombre(nombre) {
  return String(nombre || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Margen sobre el precio (%): (precio − costo) / precio; null si falta algún dato
export function margenPorcentaje(precio, costo) {
  const p = Number(precio);
  const c = Number(costo);
  if (!Number.isFinite(p) || !Number.isFinite(c) || p <= 0 || costo === null || costo === undefined) return null;
  return Math.round(((p - c) / p) * 100);
}

// Tono del stock: danger en 0 o menos, warning en el mínimo o menos, null si está bien o no controla stock
export function tonoStock(p) {
  if (!p || p.controlaStock === false) return null;
  const s = Number(p.stock) || 0;
  if (s <= 0) return "danger";
  if (p.stockMinimo !== null && p.stockMinimo !== undefined && s <= Number(p.stockMinimo)) return "warning";
  return null;
}

export const stockBajo = (p) => p?.controlaStock !== false && p?.stockMinimo !== null && p?.stockMinimo !== undefined && (Number(p.stock) || 0) <= Number(p.stockMinimo);

// Precio a partir del costo con un multiplicador, redondeado a los $10 más cercanos
export function precioDesdeCosto(costo, multiplicador = 1.6) {
  const c = Number(costo);
  const m = Number(multiplicador);
  if (!Number.isFinite(c) || !Number.isFinite(m) || c <= 0) return null;
  return Math.round((c * m) / 10) * 10;
}

export const ETIQUETA_UNIDAD = { u: "u", kg: "kg", l: "l" };
