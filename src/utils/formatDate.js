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

const DIAS_CORTOS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// "YYYY-MM-DD" -> "sáb 18 oct" (formato corto del design system; en hora local, nunca con Date.parse)
export function formatDiaCorto(fechaStr) {
  if (!fechaStr || typeof fechaStr !== "string") return "";
  const [y, m, d] = fechaStr.split("-").map(Number);
  if (!y || !m || !d) return fechaStr;
  const date = new Date(y, m - 1, d);
  return `${DIAS_CORTOS[date.getDay()]} ${d} ${MESES_CORTOS[m - 1]}`;
}

// ----- Timestamps (Firestore Timestamp, Date o número) -----

// Timestamp de Firestore, Date, número o string → Date válida, o null
export function aDate(valor) {
  if (!valor) return null;
  const d = typeof valor.toDate === "function" ? valor.toDate() : valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

const dos = (x) => String(x).padStart(2, "0");

// → "HH:MM" ("—" sin fecha)
export function formatHora(valor) {
  const d = aDate(valor);
  return d ? `${dos(d.getHours())}:${dos(d.getMinutes())}` : "—";
}

// → "DD/MM/YY HH:MM" ("—" sin fecha)
export function formatFechaHora(valor) {
  const d = aDate(valor);
  if (!d) return "—";
  return `${dos(d.getDate())}/${dos(d.getMonth() + 1)}/${dos(d.getFullYear() % 100)} ${dos(d.getHours())}:${dos(d.getMinutes())}`;
}

// → "mié 21 oct 18:30" ("—" sin fecha)
export function formatDiaHora(valor) {
  const d = aDate(valor);
  if (!d) return "—";
  return `${DIAS_CORTOS[d.getDay()]} ${d.getDate()} ${MESES_CORTOS[d.getMonth()]} ${dos(d.getHours())}:${dos(d.getMinutes())}`;
}

// → "HH:MM" si es de hoy, si no "mié 21 oct HH:MM"
export function formatDesde(valor) {
  const d = aDate(valor);
  if (!d) return "—";
  const hoy = new Date();
  const mismoDia = d.getFullYear() === hoy.getFullYear() && d.getMonth() === hoy.getMonth() && d.getDate() === hoy.getDate();
  return mismoDia ? formatHora(d) : formatDiaHora(d);
}

// → "24/10/26 22:25" SIEMPRE en hora argentina, venga de donde venga el navegador (fechas que escribe el servidor)
export function formatFechaHoraArg(valor) {
  const d = aDate(valor);
  if (!d) return "—";
  return new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(d).replace(",", "");
}

// → "lunes 26 de octubre de 2026" en hora argentina ("—" sin fecha). P3-9: vencimientos de los planes.
export function formatFechaLarga(valor) {
  const d = aDate(valor);
  if (!d) return "—";
  return d.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "America/Argentina/Buenos_Aires" });
}
