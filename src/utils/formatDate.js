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

// "YYYY-MM-DD" de la fecha LOCAL (nunca toISOString, que devuelve UTC y corre el día de noche)
export function getTodayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Suma n días a una fecha "YYYY-MM-DD" (en hora local) y devuelve "YYYY-MM-DD"
export function addDaysLocal(fechaStr, n) {
  const [y, m, d] = String(fechaStr).split("-").map(Number);
  const date = new Date(y, m - 1, d + Number(n || 0));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// Hora actual local en formato "HH:00" (la hora en curso)
export function horaActualStr() {
  return `${String(new Date().getHours()).padStart(2, "0")}:00`;
}
