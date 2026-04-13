// Format a date string from YYYY-MM-DD to DD/MM/YY
export function formatFecha(fechaStr) {
  if (!fechaStr) return "";
  const partes = fechaStr.split("-");
  if (partes.length !== 3) return fechaStr;
  const yy = partes[0].slice(-2);
  const mm = partes[1];
  const dd = partes[2];
  return `${dd}/${mm}/${yy}`;
}
