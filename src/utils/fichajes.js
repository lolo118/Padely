// src/utils/fichajes.js — fichaje de empleados (entrada / salida) del bar y la caja. Puro, sin imports: lo copia
// functions/sync-utils.mjs a functions/lib/fichajes.mjs (las Functions deciden con este mismo código).
//
// Modelo:
//   clubs/{c}/empleados/{id} = { nombre, activo, staffUid|null, tienePin, ultimoFichaje, creadoEn, actualizadoEn }
//     (con o sin cuenta de Padely; staffUid = la cuenta del equipo que puede fichar con el QR desde su celular)
//   clubs/{c}/fichajes/{id} = un turno { empleadoId, nombre, entrada, salida|null, minutos|null, origen
//     ('pin'|'qr'|'manual'), sinSalida?, editadoPor?, editadoPorNombre?, nota?, creadoEn, actualizadoEn }
//   clubs/{c}/fichajesAuditoria/{id} = cada alta / cambio / baja manual { fichajeId, accion, antes, despues, nota, por, porNombre, en }
//   clubs/{c}/privado/fichaje = { salt, claveQr, pines: { [empleadoId]: hash } } (solo Functions)
//   clubs/{c}/fichajeIntentos/{uid} = { fallos: [ms] } PINs equivocados por dispositivo (solo Functions)
// Todas las horas son del servidor; el cliente nunca manda la hora de un fichaje (salvo la carga manual del admin).

export const PIN_LARGO = 4;
// Quién ficha en la PC (la sesión abierta en esa PC): cualquiera del bar o la caja. Manejar empleados, PINs y
// turnos: el dueño o quien tenga gestionarStaff.
export const PERMISOS_FICHAR = ["vender", "cobrarTurnos", "pedidos", "abrirCaja", "cerrarCaja", "cerrarCajaAjena", "verCajasCerradas"];
export const PERMISOS_ADMIN_FICHAJE = ["gestionarStaff"];
// Un turno abierto más largo que esto es un olvido: el barrido de las 04:00 lo cierra (sinSalida) y el próximo
// fichaje de esa persona abre una entrada nueva en vez de cerrar un turno de un día entero.
export const TURNO_MAX_HORAS = 14;
// Dos fichajes de la misma persona con menos de esto entre sí = doble toque (se rechaza el segundo)
export const REPETIDO_SEG = 60;
// PINs equivocados: hasta 5 por dispositivo (la sesión de la PC de caja) cada 5 minutos
export const INTENTOS_MAX = 5;
export const INTENTOS_VENTANA_MS = 5 * 60 * 1000;
// El QR de la caja: el token vale 60 s y la pantalla lo renueva cada 30 s
export const QR_TOKEN_SEG = 60;
export const QR_REFRESCO_SEG = 30;
// La carga manual del admin: un turno de hasta 24 h, con una nota de al menos 3 letras
export const TURNO_MANUAL_MAX_HORAS = 24;
export const NOTA_MIN = 3;

// Argentina es UTC−3 todo el año (sin horario de verano): los días y las horas se calculan con ese corrimiento fijo.
const OFFSET_MS = -3 * 60 * 60 * 1000;
const HORA_MS = 60 * 60 * 1000;
const DIA_MS = 24 * HORA_MS;
const dos = (n) => String(n).padStart(2, "0");

export const pinValido = (pin) => typeof pin === "string" && new RegExp(`^\\d{${PIN_LARGO}}$`).test(pin);

// ----- Fechas en hora argentina -----

// ms → "YYYY-MM-DD" del día en Argentina
export function diaArgentina(ms) {
  const d = new Date(Number(ms) + OFFSET_MS);
  return `${d.getUTCFullYear()}-${dos(d.getUTCMonth() + 1)}-${dos(d.getUTCDate())}`;
}
// ms → "HH:MM" en Argentina
export function horaArgentina(ms) {
  const d = new Date(Number(ms) + OFFSET_MS);
  return `${dos(d.getUTCHours())}:${dos(d.getUTCMinutes())}`;
}
// "YYYY-MM-DD" → ms de las 00:00 de ese día en Argentina
export const inicioDiaMs = (dia) => Date.parse(`${dia}T00:00:00-03:00`);
// "YYYY-MM-DD" + "HH:MM" (hora argentina) → ms, o null si no es válido
export function msDeDiaHora(dia, hora) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dia || "")) || !/^\d{2}:\d{2}$/.test(String(hora || ""))) return null;
  const ms = Date.parse(`${dia}T${hora}:00-03:00`);
  return Number.isFinite(ms) ? ms : null;
}
export function sumarDias(dia, n) {
  return diaArgentina(inicioDiaMs(dia) + Number(n || 0) * DIA_MS + 12 * HORA_MS);
}
// El lunes de la semana de un día ("YYYY-MM-DD")
export function lunesDe(dia) {
  const dow = new Date(inicioDiaMs(dia) + 12 * HORA_MS + OFFSET_MS).getUTCDay(); // 0 = domingo
  return sumarDias(dia, dow === 0 ? -6 : 1 - dow);
}
export const mesDe = (dia) => String(dia).slice(0, 7);

// Rango de un período alrededor de un día: { desde, hasta } inclusive ("YYYY-MM-DD") y { desdeMs, hastaMs } (hasta exclusivo)
export function rangoPeriodo(periodo, dia) {
  let desde = dia;
  let hasta = dia;
  if (periodo === "semana") {
    desde = lunesDe(dia);
    hasta = sumarDias(desde, 6);
  } else if (periodo === "mes") {
    desde = `${mesDe(dia)}-01`;
    const [y, m] = mesDe(dia).split("-").map(Number);
    hasta = `${mesDe(dia)}-${dos(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
  }
  return { desde, hasta, desdeMs: inicioDiaMs(desde), hastaMs: inicioDiaMs(sumarDias(hasta, 1)) };
}
// El período anterior / siguiente: el día de referencia corrido
export function moverPeriodo(periodo, dia, paso) {
  if (periodo === "semana") return sumarDias(dia, 7 * paso);
  if (periodo === "mes") {
    const [y, m] = mesDe(dia).split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + paso, 1));
    return `${d.getUTCFullYear()}-${dos(d.getUTCMonth() + 1)}-01`;
  }
  return sumarDias(dia, paso);
}

// ----- Decisiones -----

export const minutosEntre = (entradaMs, salidaMs) => Math.max(0, Math.round((Number(salidaMs) - Number(entradaMs)) / 60000));

// Un turno abierto que hay que dar por olvidado (barrido de las 04:00 y próximo fichaje)
export const esOlvidado = (entradaMs, ahora) => Number.isFinite(Number(entradaMs)) && ahora - Number(entradaMs) >= TURNO_MAX_HORAS * HORA_MS;

// Qué hace un fichaje. abiertoEntradaMs: la entrada del turno abierto de la persona (o null); ultimoMs: su último
// fichaje (o null). → { tipo: 'entrada'|'salida', cerrarOlvidado } o { error: 'repetido' }
export function decidirFichaje({ abiertoEntradaMs = null, ultimoMs = null, ahora }) {
  if (Number.isFinite(ultimoMs) && ultimoMs !== null && ahora - ultimoMs < REPETIDO_SEG * 1000 && ahora >= ultimoMs) return { error: "repetido" };
  if (abiertoEntradaMs === null || abiertoEntradaMs === undefined) return { tipo: "entrada", cerrarOlvidado: false };
  if (esOlvidado(abiertoEntradaMs, ahora)) return { tipo: "entrada", cerrarOlvidado: true };
  return { tipo: "salida", cerrarOlvidado: false };
}

// PINs equivocados de un dispositivo: deja los de la ventana y dice si está bloqueado (y por cuántos minutos)
export function evaluarIntentos(fallos, ahora) {
  const vigentes = (Array.isArray(fallos) ? fallos : []).map(Number).filter((t) => Number.isFinite(t) && t > ahora - INTENTOS_VENTANA_MS && t <= ahora + 60000).sort((a, b) => a - b);
  const bloqueado = vigentes.length >= INTENTOS_MAX;
  const esperaMin = bloqueado ? Math.max(1, Math.ceil((vigentes[vigentes.length - INTENTOS_MAX] + INTENTOS_VENTANA_MS - ahora) / 60000)) : 0;
  return { fallos: vigentes, bloqueado, esperaMin, restantes: Math.max(0, INTENTOS_MAX - vigentes.length) };
}

// Validación de un turno cargado o corregido a mano por el admin. → mensaje de error o null
export function validarTurnoManual({ entradaMs, salidaMs, nota, ahora, salidaOpcional = false }) {
  if (!Number.isFinite(entradaMs)) return "Poné la fecha y la hora de entrada";
  if (salidaMs === null || salidaMs === undefined) {
    if (!salidaOpcional) return "Poné la hora de salida";
  } else {
    if (!Number.isFinite(salidaMs)) return "La hora de salida no es válida";
    if (salidaMs <= entradaMs) return "La salida tiene que ser después de la entrada";
    if (salidaMs - entradaMs > TURNO_MANUAL_MAX_HORAS * HORA_MS) return `Un turno no puede durar más de ${TURNO_MANUAL_MAX_HORAS} horas`;
    if (salidaMs > ahora + 5 * 60000) return "La salida no puede ser en el futuro";
  }
  if (entradaMs > ahora + 5 * 60000) return "La entrada no puede ser en el futuro";
  if (String(nota || "").trim().length < NOTA_MIN) return "Escribí una nota con el motivo del cambio";
  return null;
}

// ----- Horas trabajadas -----

const msDe = (v) => (v === null || v === undefined ? null : typeof v === "number" ? v : typeof v.toMillis === "function" ? v.toMillis() : v instanceof Date ? v.getTime() : Number(v));

// Minutos de un turno: cerrado → los guardados (un olvido sin corregir cuenta 0); abierto → hasta ahora (en curso)
export function minutosDeTurno(t, ahora) {
  const entrada = msDe(t?.entrada);
  const salida = msDe(t?.salida);
  if (t?.sinSalida) return 0;
  if (salida === null) return entrada === null ? 0 : minutosEntre(entrada, ahora);
  return Number.isFinite(Number(t.minutos)) && t.minutos !== null ? Number(t.minutos) : minutosEntre(entrada, salida);
}

// La clave de agrupación de un turno: el día / la semana (su lunes) / el mes de la ENTRADA en Argentina (un turno
// que pasa la medianoche cuenta entero en el día en que empezó)
export function claveDe(por, entradaMs) {
  const dia = diaArgentina(entradaMs);
  return por === "semana" ? lunesDe(dia) : por === "mes" ? mesDe(dia) : dia;
}

// Turnos → horas por empleado por día / semana / mes: [{ empleadoId, nombre, clave, minutos, turnos, sinSalida, abiertos }]
export function agruparHoras(turnos, { por = "dia", ahora }) {
  const mapa = new Map();
  for (const t of turnos || []) {
    const entrada = msDe(t.entrada);
    if (entrada === null) continue;
    const clave = claveDe(por, entrada);
    const k = `${t.empleadoId}|${clave}`;
    const fila = mapa.get(k) || { empleadoId: t.empleadoId, nombre: t.nombre || "", clave, minutos: 0, turnos: 0, sinSalida: 0, abiertos: 0 };
    fila.minutos += minutosDeTurno(t, ahora);
    fila.turnos += 1;
    if (t.sinSalida) fila.sinSalida += 1;
    if (msDe(t.salida) === null && !t.sinSalida) fila.abiertos += 1;
    mapa.set(k, fila);
  }
  return [...mapa.values()].sort((a, b) => (a.clave === b.clave ? a.nombre.localeCompare(b.nombre, "es") : a.clave < b.clave ? -1 : 1));
}

// Total del período por empleado: [{ empleadoId, nombre, minutos, turnos, sinSalida, abiertos }], más horas primero
export function totalesPorEmpleado(turnos, ahora) {
  const mapa = new Map();
  for (const f of agruparHoras(turnos, { por: "dia", ahora })) {
    const t = mapa.get(f.empleadoId) || { empleadoId: f.empleadoId, nombre: f.nombre, minutos: 0, turnos: 0, sinSalida: 0, abiertos: 0 };
    t.minutos += f.minutos;
    t.turnos += f.turnos;
    t.sinSalida += f.sinSalida;
    t.abiertos += f.abiertos;
    mapa.set(f.empleadoId, t);
  }
  return [...mapa.values()].sort((a, b) => b.minutos - a.minutos || a.nombre.localeCompare(b.nombre, "es"));
}

// 425 → "7 h 05 min"; 45 → "45 min"; 0 → "0 min"
export function formatMinutos(m) {
  const n = Math.max(0, Math.round(Number(m) || 0));
  const h = Math.floor(n / 60);
  return h ? `${h} h ${dos(n % 60)} min` : `${n} min`;
}
// 425 → 7.08 (horas con dos decimales, para la planilla)
export const horasDecimales = (m) => Math.round(((Number(m) || 0) / 60) * 100) / 100;

export const ETIQUETA_ORIGEN = { pin: "PIN", qr: "QR", manual: "Manual" };

// Filas para el CSV (después aCsv de utils/reportes): una por turno, en orden de entrada
export function filasCsvFichajes(turnos, ahora) {
  const filas = [["Empleado", "Fecha", "Entrada", "Salida", "Minutos", "Horas", "Origen", "Sin salida", "Nota"]];
  const orden = [...(turnos || [])].filter((t) => msDe(t.entrada) !== null).sort((a, b) => msDe(a.entrada) - msDe(b.entrada));
  for (const t of orden) {
    const entrada = msDe(t.entrada);
    const salida = msDe(t.salida);
    const minutos = minutosDeTurno(t, ahora);
    filas.push([
      t.nombre || "",
      diaArgentina(entrada),
      horaArgentina(entrada),
      salida === null ? "" : diaArgentina(salida) === diaArgentina(entrada) ? horaArgentina(salida) : `${diaArgentina(salida)} ${horaArgentina(salida)}`,
      minutos,
      horasDecimales(minutos),
      ETIQUETA_ORIGEN[t.origen] || t.origen || "",
      t.sinSalida ? "Sí" : salida === null ? "En curso" : "",
      t.nota || "",
    ]);
  }
  return filas;
}

export const nombreArchivoFichajes = (club, desde, hasta) =>
  `padely-fichajes-${String(club || "club").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "club"}-${desde}-${hasta}.csv`;
