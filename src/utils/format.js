// Precio en pesos con el formato es-AR del design system: 15000 -> "$ 15.000" (espacio después del signo,
// punto de miles, sin decimales)
export function formatPrecio(n) {
  return "$ " + Math.round(Number(n || 0)).toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

// "Ciudad, Provincia", o una sola vez cuando son iguales ("Santiago del Estero"); "" sin datos
export function ubicacionCorta(lugar) {
  const ciudad = String(lugar?.ciudad || "").trim();
  const provincia = String(lugar?.provincia || "").trim();
  if (ciudad && provincia && ciudad.localeCompare(provincia, "es", { sensitivity: "base" }) === 0) return ciudad;
  return [ciudad, provincia].filter(Boolean).join(", ");
}
