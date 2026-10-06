// Precio en pesos con separador de miles argentino: 15000 -> "$15.000"
export function formatPrecio(n) {
  return "$" + Number(n || 0).toLocaleString("es-AR");
}
