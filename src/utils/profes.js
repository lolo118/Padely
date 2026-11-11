// src/utils/profes.js — Profes (clases de pádel). Puro, sin imports: functions/sync-utils.mjs lo copia a
// functions/lib/profes.mjs (lo usan reservarClase, cancelarClase, elogiarClase y el pago online de clases).
//
// Modelo (flags.profes):
//   profes/{uid} (lectura pública): { uid, nombre, foto, bio, experienciaAnios, niveles, edades, especialidades,
//     ciudad, provincia, clases: [{ tipo, activa, precio, duracion, capacidad }], mostrarWhatsapp, whatsapp, activo,
//     clubIds (Functions), clubes { [clubId]: { nombre, ciudad, estado } } (Functions), elogios { total, tags } (Functions) }
//   profes/{uid}/disponibilidad/{clubId}: { semanal: { "0".."6": [{ desde, hasta }] }, excepciones: [{ fecha, tipo, desde, hasta }] }
//   profes/{uid}/elogios/{claseId_uid} (Functions): { tags, comentario, nombre, claseId, fecha, creadoEn }
//   clubs/{c}/profes/{uid}: { uid, nombre, estado: pendiente | invitado | activo | baja, cobra: club | profe,
//     bloqueaCancha, canchas: [ids] (vacío = cualquiera), tarifas: { [tipo]: precio } }
//   clases/{profeUid_fecha_HHMM} (Functions): la clase con sus inscriptos (uno por quien reservó, con sus acompañantes)
//   profesOcupacion/{profeUid_fecha_HHMM} (Functions, lectura pública): una por hora ocupada del profe (sin nombres)
//   reservas tipo "clase" en clubs/{c}/reservas (Functions): la cancha que bloquea una clase con bloqueaCancha

export const TIPOS_CLASE = [
  { id: "individual", label: "Individual", capacidadMin: 1, capacidadMax: 1, capacidadDefecto: 1 },
  { id: "pareja", label: "De a 2", capacidadMin: 2, capacidadMax: 2, capacidadDefecto: 2 },
  { id: "grupal", label: "Grupal", capacidadMin: 3, capacidadMax: 8, capacidadDefecto: 4 },
  { id: "clinica", label: "Clínica", capacidadMin: 4, capacidadMax: 24, capacidadDefecto: 12 },
];
export const DURACIONES_CLASE = [60, 90, 120];
export const ESTADOS_VINCULO = ["pendiente", "invitado", "activo", "baja"];
export const COBRA = ["club", "profe"];
export const NIVELES_PROFE = ["Iniciación", "8va", "7ma", "6ta", "5ta", "4ta", "3era", "2da", "1era"];
export const EDADES_PROFE = ["Chicos", "Adolescentes", "Adultos", "Mayores"];
export const ESPECIALIDADES_PROFE = ["Técnica", "Táctica", "Preparación física", "Competencia", "Bandeja y víbora", "Volea", "Saque y resto", "Defensa y paredes"];

// Elogios: solo positivos. Hasta 3 por clase y un comentario corto opcional (público).
export const ELOGIOS = [
  { id: "buenoConChicos", label: "Bueno con chicos" },
  { id: "respetuoso", label: "Respetuoso" },
  { id: "divertido", label: "Divertido" },
  { id: "paciente", label: "Paciente" },
  { id: "puntual", label: "Puntual" },
  { id: "explicaClaro", label: "Explica claro" },
  { id: "motivador", label: "Motivador" },
  { id: "muyTecnico", label: "Muy técnico" },
  { id: "principiantes", label: "Ideal para principiantes" },
  { id: "exigente", label: "Exigente" },
];
export const MAX_ELOGIOS_POR_CLASE = 3;
export const MAX_COMENTARIO_ELOGIO = 200;
export const MAX_SEMANAS_REPETIR = 12;
export const DIAS_ANTICIPACION_CLASE = 30;
export const COMISION_CLASES_DEFECTO = 5;
export const DIAS_SEMANA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export const tipoClase = (id) => TIPOS_CLASE.find((t) => t.id === id) || null;
export const labelTipoClase = (id) => (tipoClase(id) || {}).label || String(id || "Clase");
export const labelElogio = (id) => (ELOGIOS.find((e) => e.id === id) || {}).label || String(id || "");

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const ES_HORA_EN_PUNTO = /^([01]\d|2[0-3]):00$/;
const texto = (v, max) => String(v === undefined || v === null ? "" : v).trim().slice(0, max);
const entero = (v) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : NaN;
};

// ----- Horas -----
export const horaANum = (hora) => Number(String(hora || "").split(":")[0]);
export const numAHora = (n) => `${String(n).padStart(2, "0")}:00`;
// Horas de cancha (enteras) que ocupa una clase: 60 → 1, 90 → 2, 120 → 2
export const horasDeDuracion = (duracion) => Math.max(1, Math.ceil((Number(duracion) || 60) / 60));
// Las horas en punto que ocupa una clase que empieza a `hora`
export const horasDeClase = (hora, duracion) => Array.from({ length: horasDeDuracion(duracion) }, (_, i) => numAHora(horaANum(hora) + i));
// "18:00" + 90 → "19:30"
export function horaFinClase(hora, duracion) {
  const min = horaANum(hora) * 60 + (Number(duracion) || 60);
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

// Día de la semana (0 = domingo) de "YYYY-MM-DD", sin depender de la zona horaria
export function diaDeSemana(fecha) {
  const [y, m, d] = String(fecha || "").split("-").map(Number);
  if (!y || !m || !d) return -1;
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
export function sumarDias(fecha, n) {
  const [y, m, d] = String(fecha).split("-").map(Number);
  const f = new Date(Date.UTC(y, m - 1, d + Number(n || 0)));
  return `${f.getUTCFullYear()}-${String(f.getUTCMonth() + 1).padStart(2, "0")}-${String(f.getUTCDate()).padStart(2, "0")}`;
}
// "2026-10-28" + "21:00" → ms del inicio en hora argentina (UTC−3)
export function inicioClaseMs(fecha, hora) {
  const [y, m, d] = String(fecha || "").split("-").map(Number);
  const [hh, mm] = String(hora || "00:00").split(":").map(Number);
  if (!y || !m || !d) return null;
  return Date.UTC(y, m - 1, d, (hh || 0) + 3, mm || 0);
}

// Ids deterministas: un profe no puede tener dos clases (ni dos ocupaciones) en la misma hora
export const idClase = (profeUid, fecha, hora) => `${profeUid}_${fecha}_${String(hora).replace(":", "")}`;
export const idOcupacion = idClase;

// ----- Perfil -----
// Datos del formulario → perfil válido (sin los campos de las Functions), o { error }
export function normalizarPerfil(datos = {}) {
  const nombre = texto(datos.nombre, 80);
  if (nombre.length < 2) return { error: "Poné tu nombre" };
  const experienciaAnios = datos.experienciaAnios === "" || datos.experienciaAnios === undefined || datos.experienciaAnios === null ? 0 : entero(datos.experienciaAnios);
  if (!(experienciaAnios >= 0 && experienciaAnios <= 60)) return { error: "Los años de experiencia van de 0 a 60" };
  const lista = (v, permitidos) => [...new Set((Array.isArray(v) ? v : []).filter((x) => permitidos.includes(x)))];
  const clases = [];
  for (const t of TIPOS_CLASE) {
    const c = (Array.isArray(datos.clases) ? datos.clases : []).find((x) => x && x.tipo === t.id);
    if (!c || !c.activa) {
      clases.push({ tipo: t.id, activa: false, precio: c && Number(c.precio) > 0 ? entero(c.precio) : 0, duracion: c && DURACIONES_CLASE.includes(Number(c.duracion)) ? Number(c.duracion) : 60, capacidad: t.capacidadDefecto });
      continue;
    }
    const precio = entero(c.precio);
    if (!(precio > 0 && precio <= 10000000)) return { error: `Poné el precio de la clase ${t.label.toLowerCase()}` };
    const duracion = Number(c.duracion);
    if (!DURACIONES_CLASE.includes(duracion)) return { error: "La duración es de 60, 90 o 120 minutos" };
    const capacidad = t.capacidadMin === t.capacidadMax ? t.capacidadMin : entero(c.capacidad);
    if (!(capacidad >= t.capacidadMin && capacidad <= t.capacidadMax)) return { error: `La clase ${t.label.toLowerCase()} es de ${t.capacidadMin} a ${t.capacidadMax} alumnos` };
    clases.push({ tipo: t.id, activa: true, precio, duracion, capacidad });
  }
  const mostrarWhatsapp = datos.mostrarWhatsapp === true;
  const whatsapp = mostrarWhatsapp ? String(datos.whatsapp || "").replace(/[^0-9]/g, "").slice(0, 20) : "";
  if (mostrarWhatsapp && whatsapp.length < 8) return { error: "Poné tu WhatsApp con característica (o no lo muestres)" };
  return {
    nombre,
    foto: typeof datos.foto === "string" && datos.foto.startsWith("https://") ? datos.foto.slice(0, 500) : null,
    bio: texto(datos.bio, 600),
    experienciaAnios,
    niveles: lista(datos.niveles, NIVELES_PROFE),
    edades: lista(datos.edades, EDADES_PROFE),
    especialidades: lista(datos.especialidades, ESPECIALIDADES_PROFE),
    ciudad: texto(datos.ciudad, 60),
    provincia: texto(datos.provincia, 60),
    clases,
    mostrarWhatsapp,
    whatsapp,
    activo: datos.activo !== false,
  };
}

export const clasesActivas = (perfil) => (Array.isArray(perfil && perfil.clases) ? perfil.clases.filter((c) => c && c.activa) : []);
export const claseDelPerfil = (perfil, tipo) => clasesActivas(perfil).find((c) => c.tipo === tipo) || null;
// Precio por alumno en un club: la tarifa del club para ese tipo (si la cargó) o la del profe
export function precioEnClub(perfil, vinculo, tipo) {
  const override = vinculo && vinculo.tarifas ? Number(vinculo.tarifas[tipo]) : NaN;
  if (Number.isFinite(override) && override > 0) return Math.round(override);
  const c = claseDelPerfil(perfil, tipo);
  return c ? c.precio : 0;
}
// "Desde $ X": el precio más bajo de las clases activas
export function precioDesde(perfil) {
  const precios = clasesActivas(perfil).map((c) => Number(c.precio) || 0).filter((p) => p > 0);
  return precios.length ? Math.min(...precios) : 0;
}

// ----- Vínculo con un club -----
export function normalizarVinculo(datos = {}, canchasDelClub = null) {
  const cobra = COBRA.includes(datos.cobra) ? datos.cobra : "profe";
  let canchas = [...new Set((Array.isArray(datos.canchas) ? datos.canchas : []).map(String))];
  if (Array.isArray(canchasDelClub)) canchas = canchas.filter((id) => canchasDelClub.includes(id));
  const tarifas = {};
  Object.entries(datos.tarifas || {}).forEach(([tipo, v]) => {
    const n = entero(v);
    if (tipoClase(tipo) && n > 0) tarifas[tipo] = n;
  });
  return { cobra, bloqueaCancha: datos.bloqueaCancha !== false, canchas, tarifas };
}
export const vinculoActivo = (v) => !!v && v.estado === "activo";
// Se puede pagar online solo si cobra el club y el club tiene Mercado Pago conectado
export const pagoOnlineDisponible = (vinculo, club) => !!vinculo && vinculo.cobra === "club" && !!club && !!club.mercadoPago && club.mercadoPago.conectado === true;

// ----- Disponibilidad -----
function rango(r) {
  if (!r || !ES_HORA_EN_PUNTO.test(r.desde || "")) return null;
  const hasta = r.hasta === "24:00" ? 24 : ES_HORA_EN_PUNTO.test(r.hasta || "") ? horaANum(r.hasta) : NaN;
  const desde = horaANum(r.desde);
  if (!(hasta > desde)) return null;
  return { desde: numAHora(desde), hasta: hasta === 24 ? "24:00" : numAHora(hasta) };
}
// { semanal, excepciones } → válido (rangos en punto, desde < hasta, sin repetidos), o { error }
export function normalizarDisponibilidad(datos = {}) {
  const semanal = {};
  for (let d = 0; d < 7; d++) {
    const lista = (datos.semanal && Array.isArray(datos.semanal[d]) ? datos.semanal[d] : []).map(rango);
    if (lista.some((r) => r === null)) return { error: `Revisá los horarios del ${DIAS_SEMANA[d].toLowerCase()}: "desde" tiene que ser antes que "hasta"` };
    if (lista.length > 6) return { error: "Hasta 6 franjas por día" };
    semanal[d] = lista.sort((a, b) => a.desde.localeCompare(b.desde));
  }
  const excepciones = [];
  for (const e of Array.isArray(datos.excepciones) ? datos.excepciones : []) {
    if (!e || !ES_FECHA.test(e.fecha || "") || !["libre", "extra"].includes(e.tipo)) return { error: "Revisá las excepciones: fecha y tipo" };
    if (e.tipo === "libre" && !e.desde && !e.hasta) {
      excepciones.push({ fecha: e.fecha, tipo: "libre", desde: null, hasta: null });
      continue;
    }
    const r = rango(e);
    if (!r) return { error: `Revisá la excepción del ${e.fecha}: "desde" tiene que ser antes que "hasta"` };
    excepciones.push({ fecha: e.fecha, tipo: e.tipo, ...r });
  }
  if (excepciones.length > 60) return { error: "Hasta 60 excepciones" };
  excepciones.sort((a, b) => `${a.fecha}${a.desde || ""}`.localeCompare(`${b.fecha}${b.desde || ""}`));
  return { semanal, excepciones };
}

const horasDeRango = (r) => {
  const out = [];
  const hasta = r.hasta === "24:00" ? 24 : horaANum(r.hasta);
  for (let h = horaANum(r.desde); h < hasta; h++) out.push(numAHora(h));
  return out;
};
// Horas en punto (inicio) en las que el profe está disponible ese día en ese club: el horario semanal, menos los
// días/franjas libres y más las horas extra de ese día
export function horasDisponiblesProfe(disponibilidad, fecha) {
  if (!disponibilidad || !ES_FECHA.test(fecha || "")) return [];
  const dia = diaDeSemana(fecha);
  const base = (disponibilidad.semanal && Array.isArray(disponibilidad.semanal[dia]) ? disponibilidad.semanal[dia] : []).map(rango).filter(Boolean);
  const horas = new Set(base.flatMap(horasDeRango));
  const delDia = (Array.isArray(disponibilidad.excepciones) ? disponibilidad.excepciones : []).filter((e) => e && e.fecha === fecha);
  delDia.filter((e) => e.tipo === "extra").forEach((e) => {
    const r = rango(e);
    if (r) horasDeRango(r).forEach((h) => horas.add(h));
  });
  delDia.filter((e) => e.tipo === "libre").forEach((e) => {
    if (!e.desde && !e.hasta) return horas.clear();
    const r = rango(e);
    if (r) horasDeRango(r).forEach((h) => horas.delete(h));
  });
  return [...horas].sort();
}

// ----- Canchas -----
// ¿La cancha está libre a esa hora? Abre a esa hora, ninguna reserva viva (de jugador, torneo o clase) y sin turno fijo
export function canchaLibre({ cancha, fecha, hora, reservas = [], turnosFijos = [] }) {
  if (!cancha || !(cancha.horariosDisponibles || []).includes(hora)) return false;
  if (reservas.some((r) => r && r.canchaId === cancha.id && r.fecha === fecha && r.hora === hora && r.status !== "cancelada")) return false;
  const dia = DIAS_SEMANA[diaDeSemana(fecha)];
  if (turnosFijos.some((t) => t && t.canchaId === cancha.id && t.status === "activo" && t.dia === dia && (t.horas || [t.hora]).includes(hora))) return false;
  return true;
}
// Canchas (en el orden del club) libres en TODAS las horas; `permitidas` vacío = cualquiera
export function canchasLibresPara({ canchas = [], permitidas = [], fecha, horas = [], reservas = [], turnosFijos = [] }) {
  return canchas
    .filter((c) => c && (!permitidas || permitidas.length === 0 || permitidas.includes(c.id)))
    .filter((c) => horas.every((hora) => canchaLibre({ cancha: c, fecha, hora, reservas, turnosFijos })));
}

// ----- Slots de clase -----
// ocupacion: [{ fecha, hora, claseId, horaInicio, tipoClase, capacidad, ocupados, clubId }] del profe (todas sus
// clases, en todos los clubes). Devuelve [{ hora, horaFin, horas, canchaId, unirse, lugares }]: una clase nueva
// (unirse false) o un lugar en una clase grupal ya armada del mismo tipo en este club (unirse true).
export function slotsDeClase({ disponibilidad, fecha, tipo, duracion = 60, capacidad = 1, lugares = 1, clubId = null, bloqueaCancha = true, canchas = [], permitidas = [], reservas = [], turnosFijos = [], ocupacion = [], ahoraMs = Date.now() }) {
  const disp = new Set(horasDisponiblesProfe(disponibilidad, fecha));
  const ocupadas = new Map(ocupacion.filter((o) => o && o.fecha === fecha).map((o) => [o.hora, o]));
  const out = [];
  const vistas = new Set();
  for (const hora of [...disp].sort()) {
    const horas = horasDeClase(hora, duracion);
    const inicio = inicioClaseMs(fecha, hora);
    if (inicio === null || inicio <= ahoraMs) continue;
    const ocupada = horas.map((h) => ocupadas.get(h)).find(Boolean);
    if (ocupada) {
      // Un lugar en una clase grupal que arranca justo a esta hora, del mismo tipo y club, con lugar
      if (ocupada.horaInicio === hora && ocupada.tipoClase === tipo && (!clubId || ocupada.clubId === clubId) && !vistas.has(ocupada.claseId)) {
        const libres = (Number(ocupada.capacidad) || 0) - (Number(ocupada.ocupados) || 0);
        vistas.add(ocupada.claseId);
        if (libres >= lugares && (Number(ocupada.capacidad) || 0) > 1) out.push({ hora, horaFin: horaFinClase(hora, duracion), horas, canchaId: ocupada.canchaId || null, unirse: true, claseId: ocupada.claseId, lugares: libres });
      }
      continue;
    }
    if (!horas.every((h) => disp.has(h))) continue;
    if (lugares > capacidad) continue;
    let canchaId = null;
    if (bloqueaCancha) {
      const libres = canchasLibresPara({ canchas, permitidas, fecha, horas, reservas, turnosFijos });
      if (!libres.length) continue;
      canchaId = libres[0].id;
    }
    out.push({ hora, horaFin: horaFinClase(hora, duracion), horas, canchaId, unirse: false, claseId: null, lugares: capacidad });
  }
  return out;
}

// ¿Choca con otra clase del profe? horas de la nueva vs las ocupaciones existentes (otra clase = conflicto)
export function conflictoProfe(ocupacion = [], fecha, horas = [], claseId = null) {
  return ocupacion.find((o) => o && o.fecha === fecha && horas.includes(o.hora) && o.claseId !== claseId) || null;
}

// "Repetir semanal": las N fechas siguientes, cada 7 días (máximo MAX_SEMANAS_REPETIR)
export function fechasSemanales(fecha, semanas) {
  const n = Math.min(MAX_SEMANAS_REPETIR, Math.max(0, Math.floor(Number(semanas) || 0)));
  if (!ES_FECHA.test(fecha || "")) return [];
  return Array.from({ length: n }, (_, i) => sumarDias(fecha, 7 * (i + 1)));
}

// ----- Inscriptos de una clase -----
// clase.inscriptos = { [uidQueReservó]: { uid, nombre, participantes: [{ nombre, uid }], lugares, monto, pago, asistencia, creadoEnMs } }
export const inscriptosDe = (clase) => Object.values((clase && clase.inscriptos) || {}).filter(Boolean);
export const ocupadosDe = (clase) => inscriptosDe(clase).reduce((s, i) => s + (Number(i.lugares) || 0), 0);
export const lugaresLibresClase = (clase) => Math.max(0, (Number(clase && clase.capacidad) || 0) - ocupadosDe(clase));
export function alumnosUidsDe(inscriptos) {
  const uids = new Set();
  Object.values(inscriptos || {}).forEach((i) => {
    if (!i) return;
    if (i.uid) uids.add(i.uid);
    (i.participantes || []).forEach((p) => p && p.uid && uids.add(p.uid));
  });
  return [...uids];
}
// Acompañantes que carga quien reserva (de a 2 / grupal): nombre (y uid si es un jugador de Padely), sin repetidos
export function normalizarParticipantes(lista = [], { reservaUid = null, max = 23 } = {}) {
  const out = [];
  const uids = new Set(reservaUid ? [reservaUid] : []);
  for (const p of Array.isArray(lista) ? lista : []) {
    const nombre = texto(p && p.nombre, 60);
    if (!nombre) continue;
    const uid = p && typeof p.uid === "string" && p.uid ? p.uid.slice(0, 128) : null;
    if (uid && uids.has(uid)) continue;
    if (uid) uids.add(uid);
    out.push({ nombre, uid });
    if (out.length >= max) break;
  }
  return out;
}

// ¿Puede reservar? Un lugar de 1 + acompañantes que entra en la clase (nueva o existente)
export function validarReservaClase({ clase = null, tipo, capacidad, lugares, uid, profeUid }) {
  if (uid && uid === profeUid) return { ok: false, motivo: "No podés reservar una clase con vos mismo" };
  if (!(lugares >= 1)) return { ok: false, motivo: "Elegí cuántos van a la clase" };
  if (clase && clase.estado !== "cancelada") {
    if (clase.tipoClase !== tipo) return { ok: false, motivo: "El profe ya tiene otra clase en ese horario" };
    if (clase.inscriptos && clase.inscriptos[uid]) return { ok: false, motivo: "Ya estás anotado en esta clase" };
    if (lugaresLibresClase(clase) < lugares) return { ok: false, motivo: "No quedan lugares en esta clase" };
    return { ok: true, unirse: true };
  }
  if (lugares > capacidad) return { ok: false, motivo: `Esta clase es de hasta ${capacidad}` };
  if (tipo === "pareja" && lugares !== 2) return { ok: false, motivo: "La clase de a 2 es para dos: sumá a tu compañero" };
  return { ok: true, unirse: false };
}

// ----- Plata -----
// Lo que paga quien reserva: el precio por alumno por cada lugar (individual: el precio de la clase)
export const montoReserva = (precio, lugares) => Math.max(0, Math.round((Number(precio) || 0) * Math.max(1, Number(lugares) || 1)));
// Comisión de Padely sobre las clases pagadas online: configuracionPadely/facturacion.comisionClasesPct (5 % si no hay)
export function comisionClasesPct(facturacion) {
  const v = facturacion ? facturacion.comisionClasesPct : undefined;
  if (v === undefined || v === null || v === "" || !Number.isFinite(Number(v))) return COMISION_CLASES_DEFECTO;
  return Math.min(30, Math.max(0, Number(v)));
}
export const comisionDe = (monto, pct) => Math.round((Number(monto) || 0) * (Number(pct) || 0)) / 100;

// ¿Se puede cancelar? Antes de que empiece. Alumno: su lugar; profe o club: la clase entera
export function puedeCancelarClase(clase, { uid, esProfe = false, esClub = false, ahoraMs = Date.now() } = {}) {
  if (!clase || clase.estado === "cancelada") return { ok: false, motivo: "La clase ya está cancelada" };
  if (clase.estado === "dada") return { ok: false, motivo: "La clase ya se dio" };
  const inicio = inicioClaseMs(clase.fecha, clase.horaInicio);
  if (inicio !== null && inicio <= ahoraMs) return { ok: false, motivo: "La clase ya empezó" };
  if (esProfe || esClub) return { ok: true, todo: true };
  if (uid && clase.inscriptos && clase.inscriptos[uid]) return { ok: true, todo: false };
  return { ok: false, motivo: "No estás en esta clase" };
}

// ----- Elogios -----
// { tags, comentario } → válido (1 a 3 tags de la lista, sin repetir; comentario ≤ 200), o { error }
export function validarElogio({ tags = [], comentario = "" } = {}) {
  const lista = Array.isArray(tags) ? tags : [];
  if (lista.some((t) => !ELOGIOS.some((e) => e.id === t))) return { error: "Elegí elogios de la lista" };
  const unicos = [...new Set(lista)];
  if (unicos.length < 1) return { error: "Elegí al menos un elogio" };
  if (unicos.length > MAX_ELOGIOS_POR_CLASE) return { error: `Hasta ${MAX_ELOGIOS_POR_CLASE} elogios por clase` };
  const c = String(comentario || "").replace(/\s+/g, " ").trim();
  if (c.length > MAX_COMENTARIO_ELOGIO) return { error: `El comentario es de hasta ${MAX_COMENTARIO_ELOGIO} letras` };
  return { tags: unicos, comentario: c };
}
// ¿Este alumno puede elogiar esta clase? Clase dada, estaba anotado (no ausente) y no la elogió todavía
export function puedeElogiar(clase, uid) {
  if (!clase || !uid) return { ok: false, motivo: "Falta la clase" };
  if (clase.estado !== "dada") return { ok: false, motivo: "Podés dejar un elogio cuando el profe marca la clase como dada" };
  if (!(clase.alumnosUids || []).includes(uid)) return { ok: false, motivo: "No estuviste en esta clase" };
  const propia = clase.inscriptos && clase.inscriptos[uid];
  if (propia && propia.asistencia === "ausente") return { ok: false, motivo: "Figurás ausente en esta clase" };
  if ((clase.elogiadoPor || []).includes(uid)) return { ok: false, motivo: "Ya dejaste tu elogio para esta clase" };
  return { ok: true };
}
// Resumen que se guarda en profes/{uid}.elogios = { total, tags: { id: n } }; suma un elogio
export function sumarElogio(resumen, tags) {
  const r = { total: Number(resumen && resumen.total) || 0, tags: { ...((resumen && resumen.tags) || {}) } };
  r.total += 1;
  (tags || []).forEach((t) => {
    r.tags[t] = (Number(r.tags[t]) || 0) + 1;
  });
  return r;
}
export const resumenElogios = (lista = []) => lista.reduce((acc, e) => sumarElogio(acc, e && e.tags), { total: 0, tags: {} });
// [{ id, label, n }] de más a menos (empate: el orden de la lista)
export function topElogios(resumen, max = ELOGIOS.length) {
  const tags = (resumen && resumen.tags) || {};
  return ELOGIOS.map((e, i) => ({ id: e.id, label: e.label, n: Number(tags[e.id]) || 0, i }))
    .filter((e) => e.n > 0)
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .slice(0, max)
    .map(({ id, label, n }) => ({ id, label, n }));
}

// ----- Directorio -----
const sinTildes = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
// Filtro del directorio: texto (nombre o ciudad), ciudad exacta y club; solo perfiles activos
export function filtrarProfes(profes = [], { texto: t = "", ciudad = "", clubId = "" } = {}) {
  const q = sinTildes(t);
  const c = sinTildes(ciudad);
  return profes
    .filter((p) => p && p.activo !== false && clasesActivas(p).length > 0)
    .filter((p) => !clubId || (p.clubIds || []).includes(clubId))
    .filter((p) => !c || sinTildes(p.ciudad) === c || Object.values(p.clubes || {}).some((cl) => cl && cl.estado === "activo" && sinTildes(cl.ciudad) === c))
    .filter((p) => !q || sinTildes(p.nombre).includes(q) || sinTildes(p.ciudad).includes(q) || (p.especialidades || []).some((e) => sinTildes(e).includes(q)))
    .sort((a, b) => (Number(b.elogios && b.elogios.total) || 0) - (Number(a.elogios && a.elogios.total) || 0) || String(a.nombre).localeCompare(String(b.nombre), "es"));
}
