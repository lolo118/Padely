// Mesas del bar (clubs/{c}/mesas/{mesaId}): helpers puros (sin Firebase ni React). Los usan la grilla de Mesas, la
// configuración, el detalle de la cuenta y los tests.
// Una mesa = { nombre, zona|null, capacidad|null, orden, activa, cuentaAbiertaId|null }. La ocupación NO se guarda:
// una mesa está ocupada si hay una cuenta ABIERTA con mesaId == mesa.id (se deriva de las cuentas abiertas).
// cuentaAbiertaId es solo un candado para que dos tablets no abran dos cuentas en la misma mesa a la vez (se lee en
// la transacción que abre o mueve una cuenta); si quedó apuntando a una cuenta cerrada, no significa nada.

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
export const PREFIJO_CUENTA_MESA = "mesa_";
export const MESA_NOMBRE_MAX = 30;
export const MESA_ZONA_MAX = 30;
export const MESA_CAPACIDAD_MAX = 99;
export const MESAS_EN_SERIE_MAX = 50;

const texto = (v, max) => String(v === null || v === undefined ? "" : v).trim().replace(/\s+/g, " ").slice(0, max);
const clave = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();

// ¿Esta cuenta es de una mesa sin reserva? (id "mesa_…", tipo "mesa")
export const esIdCuentaDeMesa = (id) => typeof id === "string" && id.startsWith(PREFIJO_CUENTA_MESA);

// Datos de una mesa desde el formulario: { datos, errores } (errores vacío = válida). Un número solo ("4") se
// guarda como "Mesa 4". `otras`: las mesas del club, para no repetir el nombre.
export function validarMesa({ nombre, zona = "", capacidad = "" } = {}, { otras = [], exceptoId = null } = {}) {
  const errores = {};
  let n = texto(nombre, MESA_NOMBRE_MAX);
  if (/^\d+$/.test(n)) n = `Mesa ${n}`;
  if (!n) errores.nombre = "Poné un nombre o un número.";
  else if (otras.some((m) => m && m.id !== exceptoId && clave(m.nombre) === clave(n))) errores.nombre = "Ya hay una mesa con ese nombre.";
  const z = texto(zona, MESA_ZONA_MAX) || null;
  let cap = null;
  if (capacidad !== null && capacidad !== undefined && String(capacidad).trim() !== "") {
    const c = Number(String(capacidad).trim());
    if (!Number.isInteger(c) || c < 1 || c > MESA_CAPACIDAD_MAX) errores.capacidad = `Entre 1 y ${MESA_CAPACIDAD_MAX} personas, o vacío.`;
    else cap = c;
  }
  return { datos: { nombre: n, zona: z, capacidad: cap }, errores };
}

// "Mesa 1" … "Mesa N" para crear varias de una vez (las que ya existen se saltean)
export function nombresEnSerie(desde, hasta, { prefijo = "Mesa", otras = [] } = {}) {
  const a = Math.trunc(num(desde));
  const b = Math.trunc(num(hasta));
  if (a < 1 || b < a || b - a + 1 > MESAS_EN_SERIE_MAX) return [];
  const usados = new Set(otras.map((m) => clave(m && m.nombre)));
  const p = texto(prefijo, MESA_NOMBRE_MAX - 4) || "Mesa";
  const lista = [];
  for (let i = a; i <= b; i++) {
    const n = `${p} ${i}`;
    if (!usados.has(clave(n))) lista.push(n);
  }
  return lista;
}

// Orden de la grilla: por `orden` y, a igualdad, por nombre con números naturales ("Mesa 2" antes que "Mesa 10")
export const ordenarMesas = (lista) =>
  [...(lista || [])].sort((a, b) => num(a.orden) - num(b.orden) || String(a.nombre || "").localeCompare(String(b.nombre || ""), "es", { numeric: true }));

// Zonas presentes (para filtrar la grilla), en orden alfabético; las mesas sin zona no agregan ninguna
export const zonasDe = (mesas) => [...new Set((mesas || []).map((m) => m && m.zona).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));

const msDe = (t) => {
  if (!t) return null;
  if (typeof t.toMillis === "function") return t.toMillis();
  if (t instanceof Date) return t.getTime();
  if (typeof t === "number") return t;
  if (typeof t.seconds === "number") return t.seconds * 1000;
  return null;
};

// ¿La cuenta ocupa esta mesa? (abierta y con ese mesaId)
export const cuentaOcupaMesa = (cuenta, mesaId) => !!cuenta && !!mesaId && cuenta.estado === "abierta" && cuenta.mesaId === mesaId;

// Ocupación derivada: Map(mesaId → cuentas abiertas en esa mesa, la más vieja primero). Normalmente una; dos solo
// si algo la reabrió (p. ej. anular un pago reabre una cuenta cerrada) mientras otra ya ocupaba la mesa.
export function ocupacionDeMesas(cuentasAbiertas) {
  const mapa = new Map();
  for (const c of cuentasAbiertas || []) {
    if (!c || c.estado !== "abierta" || !c.mesaId) continue;
    const lista = mapa.get(c.mesaId) || [];
    lista.push(c);
    mapa.set(c.mesaId, lista);
  }
  for (const lista of mapa.values()) lista.sort((a, b) => (msDe(a.abiertaEn) ?? Infinity) - (msDe(b.abiertaEn) ?? Infinity));
  return mapa;
}

// Estado de una mesa para la grilla: { libre, cuenta (la que se abre al tocar), otras (cuántas más hay) }
export function estadoMesa(mesa, ocupacion) {
  const lista = (ocupacion && mesa && ocupacion.get(mesa.id)) || [];
  return { libre: lista.length === 0, cuenta: lista[0] || null, otras: Math.max(0, lista.length - 1) };
}

// Candado de la transacción: ¿la cuenta que la mesa dice tener (ya leída) sigue ocupándola? Si es la misma cuenta
// que se está moviendo, no cuenta como ocupada.
export const mesaOcupadaPorOtra = (mesaId, cuentaDelCandado, cuentaId = null) => !!cuentaDelCandado && cuentaDelCandado.id !== cuentaId && cuentaOcupaMesa(cuentaDelCandado, mesaId);

// Minutos desde que se abrió la cuenta (0 si no se sabe todavía: el serverTimestamp llega un instante después)
export function minutosAbierta(cuenta, ahora = Date.now()) {
  const ms = msDe(cuenta && cuenta.abiertaEn);
  const t = ahora instanceof Date ? ahora.getTime() : num(ahora);
  if (ms === null) return 0;
  return Math.max(0, Math.floor((t - ms) / 60000));
}
// "12 min" · "1 h" · "2 h 05"
export function textoTiempo(min) {
  const m = Math.max(0, Math.trunc(num(min)));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return `${h} h${r ? ` ${String(r).padStart(2, "0")}` : ""}`;
}
// Resumen de la grilla: { total, libres, ocupadas }
export function resumenMesas(mesas, ocupacion) {
  const activas = (mesas || []).filter((m) => m && m.activa !== false);
  const ocupadas = activas.filter((m) => !estadoMesa(m, ocupacion).libre).length;
  return { total: activas.length, libres: activas.length - ocupadas, ocupadas };
}
