// Precio en pesos con el formato es-AR del design system: 15000 -> "$ 15.000" (espacio después del signo,
// punto de miles, sin decimales)
export function formatPrecio(n) {
  return "$ " + Math.round(Number(n || 0)).toLocaleString("es-AR", { maximumFractionDigits: 0 });
}
