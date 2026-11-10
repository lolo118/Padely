// src/utils/miniTorneo.js — mini torneo dentro de un turno: la gente que juega una reserva arma un torneíto social de
// parejas fijas (nadie cambia de compañero) que entra en las horas reservadas. Puro, sin React ni Firebase
// (miniTorneo.test.js). Reusa el motor de torneos (fixture.js / torneo.js) para round robin, tablas y el cuadro; acá
// vive solo lo nuevo: los mínimos de cada formato (derivados de cómo se arma), el armado de parejas, el rey de la
// cancha (que se arma a medida que llegan los resultados), la elección automática y la estimación de tiempo.
// No suma puntos, rankings ni Pase: vive en clubs/{c}/miniTorneos/{id} y ninguna Function lo escucha.
//
// Documento: { clubId, clubNombre, canchaNombre, fecha, horaInicio, horaFin, reservaGrupoId, creadorUid, creadorNombre,
//   editoresUids, edicionAbierta, nombre, modo ("auto" | "manual"), formato, partidoA { tipo: "games" | "minutos", valor },
//   canchas, jugadores [{ id, nombre }], parejas [{ id, nombrePareja, jugadores: [id, id], grupo? }],
//   grupos [{ nombre, parejas: [id] }], partidos [...], descansos [], llave { rondas: [{ partidos: [...] }],
//   tercerPuesto? } | null, rondas, tercerPuesto?, estimacionMin, motivo, estado ("en_curso" | "finalizado") }
// rondas: en el rey de la cancha, la cantidad de partidos.
// Partido: { id, fase: "rr" | "grupo" | "rey", grupo?, ronda, cancha, pareja1, pareja2, resultado }
// resultado = { sets: [{ g1, g2 }] } (un solo "set" de games: el formato del motor, así getGanador y calcularTabla sirven)
// Legacy: los primeros mini torneos (formato "americano") eran de compañeros rotativos: partidos { fase: "americano",
// equipo1: [id, id], equipo2: [id, id] } y descansos [{ ronda, jugadores }]. Ya no se crean, pero se siguen viendo y
// cargando (tablaAmericano, aplicarResultado).
import { calcularTabla, getGanador } from "./torneo.js";
import { avanzarGanadores, emparejarConByes, generarFixtureRoundRobin, generarRondas, obtenerCampeonYSub, seedsDesdeGrupos, siguientePotenciaDe2 } from "./fixture.js";
import { NIVELES, normalizarNivel } from "./categorias.js";

export const MAX_CANCHAS = 4;
// Tiempos de referencia (juego social): un game ~3,5 min; entre partido y partido 2 min; 10 min para calentar
export const MIN_POR_GAME = 3.5;
export const MIN_CAMBIO = 2;
export const MIN_CALENTAMIENTO = 10;
export const MIN_PARTIDO_CRONOMETRADO = 8;
export const MAX_PARTIDOS_REY = 60;
// Grupos del torneo común: de 3 o 4 parejas (con 2, el grupo es un solo partido; con 5 ya es una liguilla larga)
export const MIN_PAREJAS_POR_GRUPO = 3;
export const MAX_PAREJAS_POR_GRUPO = 4;

// ----- Mínimos, derivados de cómo se arma cada formato -----
// Todos contra todos: P·(P−1)/2 partidos. Hace falta más de uno para que haya torneo → 3 parejas (con 2, un partido).
export const partidosTodosContraTodos = (P) => (P * (P - 1)) / 2;
export const minimoTodosContraTodos = () => {
  let P = 2;
  while (partidosTodosContraTodos(P) <= 1) P++;
  return P;
};
// Eliminación: el cuadro es la potencia de 2 siguiente. Hace falta más de una ronda (si no, es solo la final) → 3
// parejas (una pasa con bye a la final); con 4, el cuadro queda justo.
export const rondasDeCuadro = (P) => Math.log2(siguientePotenciaDe2(Math.max(1, P)));
export const minimoEliminacion = () => {
  let P = 2;
  while (rondasDeCuadro(P) <= 1) P++;
  return P;
};
// Torneo común: al menos 2 grupos (para que el cuadro cruce grupos) de al menos MIN_PAREJAS_POR_GRUPO → 6 parejas
export const minimoGrupos = () => 2 * Math.max(MIN_PAREJAS_POR_GRUPO, minimoTodosContraTodos());
// Rey de la cancha: hace falta alguien esperando en la fila (con 2 parejas juegan siempre las mismas) → 3
export const minimoRey = () => 3;

// Formatos que se ofrecen, en orden. "americano" (rotativo) queda solo para leer los mini torneos viejos.
export const FORMATOS = {
  americanoParejas: {
    label: "Americano",
    ayuda: "Todos contra todos con partidos cortos (a 6 games o por tiempo). Gana la pareja que suma más games.",
    minimo: minimoTodosContraTodos(),
    razonMinimo: "con 2 parejas es un solo partido",
  },
  roundRobin: {
    label: "Liguilla (todos contra todos)",
    ayuda: "Todos contra todos con partidos normales. Gana la pareja que más partidos gana; desempata la diferencia de games.",
    minimo: minimoTodosContraTodos(),
    razonMinimo: "con 2 parejas es un solo partido",
  },
  grupos: {
    label: "Torneo común (grupos y semis)",
    ayuda: "Grupos de 3 o 4 parejas; las dos primeras de cada grupo pasan a semis y final.",
    minimo: minimoGrupos(),
    razonMinimo: `dos grupos de ${MIN_PAREJAS_POR_GRUPO}`,
  },
  eliminacion: {
    label: "Eliminación directa",
    ayuda: "Cuadro: la pareja que pierde queda afuera. Lo más corto. Si no son 4 u 8, las mejores pasan con bye.",
    minimo: minimoEliminacion(),
    razonMinimo: "con 2 parejas es solo la final",
  },
  rey: {
    label: "Rey de la cancha",
    ayuda: "En una cancha: la pareja que gana se queda y la que pierde vuelve a la fila. Gana la que más partidos gana.",
    minimo: minimoRey(),
    razonMinimo: "con 2 parejas no hay fila",
  },
  americano: { label: "Americano (compañeros rotativos)", ayuda: "Formato anterior: cambiaban de compañero en cada partido.", minimo: Infinity, legacy: true },
};
export const ORDEN_FORMATOS = ["americanoParejas", "roundRobin", "grupos", "eliminacion", "rey"];
export const minimoParejas = (formato) => FORMATOS[formato]?.minimo ?? Infinity;
// Mínimo general: el del formato más chico, en jugadores
export const MIN_PAREJAS = Math.min(...ORDEN_FORMATOS.map(minimoParejas));
export const MIN_JUGADORES = 2 * MIN_PAREJAS;
export const MAX_JUGADORES = 16;
// Partidos rotativos (solo el americano viejo)
export const esRotativo = (formato) => formato === "americano";
// Se arma a medida que llegan los resultados
export const esDinamico = (formato) => formato === "rey";
// Todos contra todos (americano de parejas y liguilla)
export const esTodosContraTodos = (formato) => formato === "americanoParejas" || formato === "roundRobin";
// El partido por el 3° puesto necesita dos semis de verdad: desde 4 parejas
export const admiteTercerPuesto = (formato, n) => (formato === "eliminacion" || formato === "grupos") && Math.floor(n / 2) >= 4;

const plural = (k, uno, varios) => (k === 1 ? uno : varios);
export const textoFaltan = (n) => {
  const faltan = MIN_JUGADORES - n;
  return `Faltan ${faltan} ${plural(faltan, "jugador", "jugadores")} para ${MIN_PAREJAS} parejas`;
};
export const textoImpar = (n) => `Con ${n} jugadores no se arman parejas: sumá uno o sacá uno.`;

// ¿Se puede jugar `formato` con n jugadores y esas canchas? → { formato, valido, motivo, explicacion }
// motivo: corto, para la opción deshabilitada ("desde 6 parejas: dos grupos de 3"); explicacion: para "Así queda".
export function evaluarFormato(formato, n, canchas = 1) {
  const f = FORMATOS[formato];
  const no = (motivo, explicacion) => ({ formato, valido: false, motivo, explicacion });
  if (!f || f.legacy) return no("ya no se arma", "Elegí un formato válido.");
  const P = Math.floor(n / 2);
  if (n > MAX_JUGADORES) return no(`hasta ${MAX_JUGADORES / 2} parejas`, `Como máximo ${MAX_JUGADORES} jugadores (${MAX_JUGADORES / 2} parejas).`);
  if (P < f.minimo) {
    const motivo = `desde ${f.minimo} parejas: ${f.razonMinimo}`;
    return no(motivo, n < MIN_JUGADORES ? `${textoFaltan(n)}.` : `${f.label} arranca ${motivo}. Con ${P} parejas, elegí otro formato.`);
  }
  if (n % 2 !== 0) return no("con número par", textoImpar(n));
  if (formato === "rey" && Math.floor(Number(canchas) || 1) > 1) return no("con una sola cancha", "El rey de la cancha se juega en una sola cancha: elegí 1 cancha u otro formato.");
  return { formato, valido: true, motivo: "", explicacion: "" };
}
// Formatos que se pueden jugar con n jugadores, en el orden en que se ofrecen
export const formatosPosibles = (n, canchas = 1) => ORDEN_FORMATOS.filter((f) => evaluarFormato(f, n, canchas).valido);

// ----- Quiénes juegan: la gente conocida del turno -----
// Etiquetas de rol que nunca son un nombre (la cuenta arma un titular "Titular" cuando no sabe cómo se llama)
const ETIQUETAS_DE_ROL = new Set(["titular", "jugador", "invitado", "sin nombre", "yo", "vos"]);
export const nombreReal = (nombre) => {
  const limpio = String(nombre || "").trim();
  return limpio && !ETIQUETAS_DE_ROL.has(limpio.toLowerCase()) ? limpio : "";
};
// Nombre de quien arma el torneo: el del perfil, el de la sesión o el de la reserva (si reservó él)
export function nombreDelCreador({ perfilNombre, displayName, reserva, uid } = {}) {
  return nombreReal(perfilNombre) || nombreReal(displayName) || (reserva?.jugadorUid && reserva.jugadorUid === uid ? nombreReal(reserva.nombreJugador) : "") || "Jugador";
}
// Sugerencias para sumar: los participantes reales de la cuenta del turno y quien reservó, sin el creador (va aparte,
// siempre primero), sin repetidos y nunca con una etiqueta de rol como nombre. El titular de una cuenta sin uid es
// quien reservó (cuentas viejas): si reservó el creador, es el creador. → [{ clave, nombre, uid }]
export function conocidosDelTurno({ participantes = [], reserva = null, creadorUid = null, creadorNombre = "" } = {}) {
  const lista = [];
  const uids = new Set(creadorUid ? [creadorUid] : []);
  const nombres = new Set(nombreReal(creadorNombre) ? [nombreReal(creadorNombre).toLowerCase()] : []);
  const titularUid = reserva?.jugadorUid || null;
  const sumar = (uid, nombre, clave) => {
    if (uid && uids.has(uid)) return;
    const limpio = nombreReal(nombre);
    if (!limpio) return;
    const k = limpio.toLowerCase();
    if (!uid && nombres.has(k)) return;
    if (uid) uids.add(uid);
    nombres.add(k);
    lista.push({ clave, nombre: limpio, uid: uid || null });
  };
  (Array.isArray(participantes) ? participantes : []).forEach((p) => {
    if (!p || p.estado === "quitado") return;
    const uid = p.uid || (p.tipo === "titular" ? titularUid : null);
    sumar(uid, p.nombre, `c:${p.id || uid || p.nombre}`);
  });
  if (titularUid) sumar(titularUid, reserva?.nombreJugador, `r:${titularUid}`);
  return lista;
}
// Contador de "¿Quiénes juegan?": "4 jugadores · 2 de 3 parejas mínimo", "5 jugadores · falta 1 para 3 parejas",
// "7 jugadores · sumá o sacá uno para armar parejas", "6 jugadores · 3 parejas"
export function textoContador(n) {
  if (n < MIN_JUGADORES) {
    const faltan = MIN_JUGADORES - n;
    if (n % 2 === 0) return `${n} jugadores · ${n / 2} de ${MIN_PAREJAS} parejas mínimo`;
    return `${n} ${plural(n, "jugador", "jugadores")} · ${plural(faltan, "falta", "faltan")} ${faltan} para ${MIN_PAREJAS} parejas`;
  }
  if (n % 2 !== 0) return `${n} jugadores · sumá o sacá uno para armar parejas`;
  return `${n} jugadores · ${n / 2} parejas`;
}

// ----- Azar reproducible (los tests pasan una semilla; la app, Date.now()) -----
export function crearAzar(seed = 1) {
  let a = Number(seed) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function mezclar(lista, azar = Math.random) {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ----- Nombres: en el documento público van solo nombres de pila ("Juan", y "Juan P." si hay dos Juan) -----
const capital = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
export function nombresCortos(nombres) {
  const partes = (nombres || []).map((n) => String(n || "").trim().split(/\s+/).filter(Boolean));
  const base = partes.map((p) => capital(p[0] || "Jugador").slice(0, 20));
  const conInicial = partes.map((p, i) => {
    const repetido = base.filter((b) => b.toLowerCase() === base[i].toLowerCase()).length > 1;
    return repetido && p[1] ? `${base[i]} ${p[1].charAt(0).toUpperCase()}.` : base[i];
  });
  const vistos = {};
  return conInicial.map((n) => {
    const k = n.toLowerCase();
    vistos[k] = (vistos[k] || 0) + 1;
    return vistos[k] > 1 ? `${n} ${vistos[k]}` : n;
  });
}

// jugadores de entrada [{ nombre, nivel?, uid? }] → [{ id: "j1", nombre corto, nivel, uid }] (uid y nivel no se guardan)
export function prepararJugadores(lista) {
  const limpios = (lista || []).filter((j) => j && String(j.nombre || "").trim());
  const nombres = nombresCortos(limpios.map((j) => j.nombre));
  return limpios.map((j, i) => ({ id: `j${i + 1}`, nombre: nombres[i], nivel: normalizarNivel(j.nivel) || null, uid: j.uid || null }));
}
export const jugadoresPublicos = (jugadores) => (jugadores || []).map((j) => ({ id: j.id, nombre: j.nombre }));

export function validarJugadores(jugadores) {
  const n = (jugadores || []).length;
  if (n < MIN_JUGADORES) return textoFaltan(n);
  if (n > MAX_JUGADORES) return `Como máximo ${MAX_JUGADORES} jugadores (${MAX_JUGADORES / 2} parejas)`;
  if (n % 2 !== 0) return textoImpar(n);
  const uids = jugadores.map((j) => j.uid).filter(Boolean);
  if (new Set(uids).size !== uids.length) return "Hay un jugador repetido";
  return null;
}


// ===== Parejas =====
export function indiceNivel(nivel) {
  const n = normalizarNivel(nivel);
  return n ? NIVELES.indexOf(n) : null;
}
// ¿Alcanzan los niveles para armar parejas equilibradas? (la mitad o más de los jugadores con nivel)
export const hayNiveles = (jugadores) => (jugadores || []).filter((j) => indiceNivel(j.nivel) !== null).length * 2 >= (jugadores || []).length && (jugadores || []).length > 0;

const nombreDePareja = (a, b) => `${a.nombre} / ${b.nombre}`;
export const crearPareja = (a, b, i) => ({ id: `p${i + 1}`, nombrePareja: nombreDePareja(a, b), jugadores: [a.id, b.id] });

// Parejas al azar o balanceadas por nivel (el mejor con el más flojo, el segundo con el anteúltimo...). Quien no tiene
// nivel cuenta como el promedio de los que sí. Las parejas salen ordenadas como semillas (por nivel, o al azar).
export function armarParejas(jugadores, { criterio = "azar", seed = 1 } = {}) {
  const lista = jugadores || [];
  if (lista.length % 2 !== 0) throw new Error("Para jugar en parejas hace falta un número par de jugadores");
  const azar = crearAzar(seed);
  const mezclados = mezclar(lista, azar);
  if (criterio !== "nivel") {
    const parejas = [];
    for (let i = 0; i < mezclados.length; i += 2) parejas.push(crearPareja(mezclados[i], mezclados[i + 1], parejas.length));
    return parejas;
  }
  const conocidos = lista.map((j) => indiceNivel(j.nivel)).filter((x) => x !== null);
  const promedio = conocidos.length ? conocidos.reduce((a, b) => a + b, 0) / conocidos.length : 0;
  const fuerza = (j) => indiceNivel(j.nivel) ?? promedio;
  const orden = [...mezclados].sort((a, b) => fuerza(b) - fuerza(a));
  const n = orden.length;
  const pares = [];
  for (let i = 0; i < n / 2; i++) pares.push([orden[i], orden[n - 1 - i]]);
  // Semillas: la pareja más fuerte primero (con la balanceada todas suman parecido; desempata el mejor jugador)
  pares.sort((x, y) => fuerza(y[0]) + fuerza(y[1]) - (fuerza(x[0]) + fuerza(x[1])));
  return pares.map(([a, b], i) => crearPareja(a, b, i));
}

// Proyección de una pareja que va dentro de los partidos y del cuadro
const parejaMin = (p) => (p ? { id: p.id, nombrePareja: p.nombrePareja, ...(p.grupo ? { grupo: p.grupo } : {}) } : null);

// Grupos de 3 o 4 parejas (al menos 2 grupos), repartidos en zigzag por semilla: 1→A, 2→B, 3→B, 4→A, 5→A...
export function cantidadDeGrupos(cantParejas) {
  return Math.max(2, Math.min(Math.floor(cantParejas / MIN_PAREJAS_POR_GRUPO), Math.ceil(cantParejas / MAX_PAREJAS_POR_GRUPO)));
}
export function repartirEnGrupos(parejas, cantidad = cantidadDeGrupos(parejas.length)) {
  const grupos = Array.from({ length: cantidad }, (_, g) => ({ nombre: String.fromCharCode(65 + g), parejas: [] }));
  parejas.forEach((p, i) => {
    const vuelta = Math.floor(i / cantidad);
    const g = vuelta % 2 === 0 ? i % cantidad : cantidad - 1 - (i % cantidad);
    grupos[g].parejas.push({ ...p, grupo: grupos[g].nombre });
  });
  return grupos;
}
export const tamañosDeGrupos = (cantParejas) => repartirEnGrupos(Array.from({ length: cantParejas }, (_, i) => ({ id: i }))).map((g) => g.parejas.length);
// Pasan al cuadro los dos primeros de cada grupo (semis y final con 2 grupos)
export const avanzanPorGrupo = (cantParejas) => (cantParejas >= 4 ? 2 : 1);

function asignarCanchas(partidos, canchas) {
  const porRonda = {};
  return partidos.map((p) => {
    const i = (porRonda[p.ronda] = (porRonda[p.ronda] ?? -1) + 1);
    return { ...p, cancha: (i % Math.max(1, canchas)) + 1 };
  });
}

export function partidosRoundRobin(parejas, { fase = "rr", grupo = null } = {}) {
  const fechas = generarFixtureRoundRobin(parejas);
  const partidos = [];
  fechas.forEach((fecha, fi) =>
    fecha.forEach((m, mi) =>
      partidos.push({ id: `${grupo ? `g${grupo}` : "r"}${fi + 1}-${mi + 1}`, fase, ...(grupo ? { grupo } : {}), ronda: fi + 1, cancha: 1, pareja1: parejaMin(m.pareja1), pareja2: parejaMin(m.pareja2), resultado: null }),
    ),
  );
  return partidos;
}

// Cuadro guardable: { rondas: [{ partidos: [{ id, pareja1, pareja2, resultado }] }], tercerPuesto? } (Firestore no
// guarda arrays de arrays). tercerPuesto: el partido por el 3° entre quienes pierden las semis (si se pidió).
const aLlave = (rondas, tercero) => ({
  rondas: rondas.map((r, ri) => ({ partidos: r.map((p, pi) => ({ id: `k${ri + 1}-${pi + 1}`, pareja1: parejaMin(p.pareja1), pareja2: parejaMin(p.pareja2), resultado: p.resultado || null })) })),
  ...(tercero ? { tercerPuesto: tercero } : {}),
});
const deLlave = (llave) => (llave?.rondas || []).map((r) => (r.partidos || []).map((p) => ({ ...p })));
export const ID_TERCER_PUESTO = "k3p";

const perdedorDe = (p) => {
  if (!p?.resultado || !p.pareja1 || !p.pareja2) return null;
  const g = getGanador(p.resultado);
  return g === 1 ? p.pareja2 : g === 2 ? p.pareja1 : null;
};
// El partido por el 3° puesto a partir de las semis; conserva el resultado si siguen siendo las mismas parejas
function partidoTercero(rondas, previo) {
  const semis = rondas.length >= 2 ? rondas[rondas.length - 2] : [];
  const [a, b] = [perdedorDe(semis[0]), perdedorDe(semis[1])];
  const mismas = !!previo && (previo.pareja1?.id || null) === (a?.id || null) && (previo.pareja2?.id || null) === (b?.id || null);
  return { id: ID_TERCER_PUESTO, pareja1: parejaMin(a), pareja2: parejaMin(b), resultado: mismas && a && b ? previo.resultado || null : null };
}

// Orden clásico de los cruces en el cuadro (1-8, 4-5, 2-7, 3-6...): así las dos mejores semillas solo se cruzan en
// la final. emparejarConByes arma los cruces (semilla i con la n-1-i, byes a las mejores); acá solo se reordenan.
export function ordenDeCruces(cantidad) {
  if (cantidad <= 1) return [0];
  return ordenDeCruces(cantidad / 2).flatMap((i) => [i, cantidad - 1 - i]);
}
export function crearLlave(seeds, { tercerPuesto = false } = {}) {
  const cruces = emparejarConByes(seeds.map(parejaMin));
  const rondas = avanzarGanadores(generarRondas(ordenDeCruces(cruces.length).map((i) => cruces[i])));
  return aLlave(rondas, tercerPuesto && seeds.length >= 4 ? partidoTercero(rondas, null) : null);
}

// Rearma el cuadro desde la primera ronda: avanza ganadores ronda por ronda y conserva cada resultado solo si el
// partido sigue siendo entre las mismas parejas (así borrar o cambiar un resultado limpia lo que venía después).
export function reconstruirLlave(llave) {
  const viejas = deLlave(llave);
  if (!viejas.length) return llave;
  let rondas = generarRondas(viejas[0].map((p) => ({ pareja1: p.pareja1, pareja2: p.pareja2, resultado: null })));
  for (let ri = 0; ri < rondas.length; ri++) {
    rondas[ri] = rondas[ri].map((p, pi) => {
      const vieja = viejas[ri]?.[pi];
      const mismas = vieja && (vieja.pareja1?.id || null) === (p.pareja1?.id || null) && (vieja.pareja2?.id || null) === (p.pareja2?.id || null);
      return { ...p, resultado: mismas && p.pareja1 && p.pareja2 ? vieja.resultado || null : null };
    });
    rondas = avanzarGanadores(rondas);
  }
  return aLlave(rondas, llave?.tercerPuesto ? partidoTercero(rondas, llave.tercerPuesto) : null);
}

// ===== Rey de la cancha =====
// Una cancha, parejas fijas. Partido 1: pareja 1 contra la 2; las demás hacen fila. La que gana se queda (pareja1 del
// partido siguiente); la que pierde va al final de la fila y entra la primera de la fila. Sin empates.
const partidoRey = (numero, p1, p2) => ({ id: `rey${numero}`, fase: "rey", ronda: numero, cancha: 1, pareja1: parejaMin(p1), pareja2: parejaMin(p2), resultado: null });
export function siguientePartidoRey(parejas, jugados = []) {
  const porId = Object.fromEntries((parejas || []).map((p) => [p.id, p]));
  const ids = (parejas || []).map((p) => p.id);
  if (ids.length < 2) return null;
  const orden = [...(jugados || [])].sort((a, b) => a.ronda - b.ronda);
  if (!orden.length) return partidoRey(1, porId[ids[0]], porId[ids[1]]);
  const fila = ids.slice(2);
  let rey = null;
  let retador = null;
  for (const m of orden) {
    const g = getGanador(m.resultado);
    if (g !== 1 && g !== 2) return null;
    const [gana, pierde] = g === 1 ? [m.pareja1.id, m.pareja2.id] : [m.pareja2.id, m.pareja1.id];
    fila.push(pierde);
    rey = gana;
    retador = fila.shift();
  }
  return partidoRey(orden.length + 1, porId[rey], porId[retador]);
}
// Partidos de rey que entran en el turno (al menos uno por pareja)
export function partidosReyQueEntran(cantParejas, minutos, partidoA) {
  const caben = Math.floor((Math.max(0, Number(minutos) || 0) - MIN_CALENTAMIENTO) / minutosPorPartido(partidoA));
  return Math.max(cantParejas, Math.min(MAX_PARTIDOS_REY, caben));
}

// Si el último partido del rey de la cancha tiene resultado y faltan partidos, el siguiente: { ronda, partidos } o null
export function siguienteRonda(mini) {
  const partidos = mini?.partidos || [];
  if (!esDinamico(mini?.formato) || !partidos.length) return null;
  const ultima = Math.max(...partidos.map((p) => Number(p.ronda) || 0));
  if (ultima >= (Number(mini.rondas) || 0)) return null;
  if (!partidos.filter((p) => p.ronda === ultima).every((p) => !!p.resultado)) return null;
  const p = siguientePartidoRey(mini.parejas, partidos);
  return p ? { ronda: ultima + 1, partidos: [p] } : null;
}

// ===== Tiempo =====
export function minutosDeHora(hora) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hora || "").trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
// Minutos del turno ("20:00"–"22:00" → 120; pasa la medianoche si el fin es menor o "00:00")
export function minutosDelTurno(horaInicio, horaFin, turnos = 1) {
  const a = minutosDeHora(horaInicio);
  const b = minutosDeHora(horaFin);
  if (a === null || b === null) return Math.max(1, Number(turnos) || 1) * 60;
  return b > a ? b - a : b + 24 * 60 - a;
}
export function minutosPorPartido(partidoA) {
  const valor = Math.max(1, Number(partidoA?.valor) || 1);
  if (partidoA?.tipo === "minutos") return valor + MIN_CAMBIO;
  // "A N games": en promedio se juegan ~1,6·N games
  return Math.round(1.6 * valor * MIN_POR_GAME) + MIN_CAMBIO;
}
export function textoPartidoA(partidoA) {
  if (!partidoA) return "";
  return partidoA.tipo === "minutos" ? `Partidos de ${partidoA.valor} minutos` : `Partidos a ${partidoA.valor} games`;
}

const sumaTandas = (lista, canchas) => lista.reduce((acc, cant) => acc + Math.ceil(cant / Math.max(1, canchas)), 0);
const partidosPorFechaRR = (p) => Array.from({ length: p % 2 === 0 ? p - 1 : p }, () => Math.floor(p / 2));
// Partidos reales por ronda de un cuadro de `seeds` parejas (sin byes); el 3° puesto va con la final
export function partidosPorRondaDeCuadro(seeds, tercero = false) {
  const S = siguientePotenciaDe2(seeds);
  const lista = [seeds - S / 2];
  for (let k = S / 4; k >= 1; k /= 2) lista.push(k);
  lista[lista.length - 1] += tercero ? 1 : 0;
  return lista.filter((x) => x > 0);
}
export const partidosReyPorDefecto = (cantParejas) => 2 * cantParejas;
// Tandas (partidos que se juegan uno después del otro; en cada tanda, uno por cancha). En el rey de la cancha, los
// partidos (una sola cancha).
export function tandas(formato, n, canchas = 1, { rondas, tercerPuesto = false } = {}) {
  const c = Math.max(1, Math.floor(Number(canchas) || 1));
  const P = Math.floor(n / 2);
  const tercero = !!tercerPuesto && admiteTercerPuesto(formato, n);
  if (formato === "rey") return Math.max(1, Math.floor(Number(rondas) || partidosReyPorDefecto(P)));
  if (esTodosContraTodos(formato)) return sumaTandas(partidosPorFechaRR(P), c);
  if (formato === "eliminacion") return sumaTandas(partidosPorRondaDeCuadro(P, tercero), c);
  if (formato === "grupos") {
    const fechasPorGrupo = tamañosDeGrupos(P).map(partidosPorFechaRR);
    const fechas = Math.max(...fechasPorGrupo.map((f) => f.length));
    const porFecha = Array.from({ length: fechas }, (_, i) => fechasPorGrupo.reduce((a, f) => a + (f[i] || 0), 0));
    const seeds = cantidadDeGrupos(P) * avanzanPorGrupo(P);
    return sumaTandas(porFecha, c) + sumaTandas(partidosPorRondaDeCuadro(seeds, tercero), c);
  }
  return 0;
}
export function estimarMinutos(formato, n, canchas, partidoA, opciones = {}) {
  return MIN_CALENTAMIENTO + tandas(formato, n, canchas, opciones) * minutosPorPartido(partidoA);
}

// Duración sugerida para que entre en el turno: en el americano, a 6 games (partido corto) y si no, por tiempo; en los
// demás, a 6, 5, 4 o 3 games y si no, por tiempo. En el rey de la cancha, partidos cortos (a 4, 3 o 2 games) y tantos
// como entren (al menos 2 por pareja).
export function sugerirPartido(formato, n, canchas, minutosDisponibles, opciones = {}) {
  const disp = Math.max(0, Number(minutosDisponibles) || 0);
  const tercerPuesto = !!opciones.tercerPuesto;
  if (formato === "rey" && !(Number(opciones.rondas) > 0)) {
    const P = Math.floor(n / 2);
    for (const valor of [4, 3, 2]) {
      const partidoA = { tipo: "games", valor };
      const caben = Math.floor((disp - MIN_CALENTAMIENTO) / minutosPorPartido(partidoA));
      if (caben >= 2 * P) {
        const rondas = Math.min(caben, MAX_PARTIDOS_REY);
        return { partidoA, rondas, estimacionMin: estimarMinutos(formato, n, 1, partidoA, { rondas }), entra: true };
      }
    }
    const partidoA = { tipo: "games", valor: 2 };
    const rondas = partidosReyQueEntran(P, disp, partidoA);
    const est = estimarMinutos(formato, n, 1, partidoA, { rondas });
    return { partidoA, rondas, estimacionMin: est, entra: est <= disp };
  }
  const rondas = formato === "rey" ? Math.floor(Number(opciones.rondas)) : undefined;
  const opts = { rondas, tercerPuesto };
  for (const valor of formato === "americanoParejas" ? [6] : [6, 5, 4, 3]) {
    const partidoA = { tipo: "games", valor };
    const est = estimarMinutos(formato, n, canchas, partidoA, opts);
    if (est <= disp) return { partidoA, rondas, estimacionMin: est, entra: true };
  }
  const t = tandas(formato, n, canchas, opts);
  const porPartido = Math.min(60, Math.floor((disp - MIN_CALENTAMIENTO) / t) - MIN_CAMBIO);
  const partidoA = { tipo: "minutos", valor: Math.max(MIN_PARTIDO_CRONOMETRADO, porPartido) };
  const est = estimarMinutos(formato, n, canchas, partidoA, opts);
  return { partidoA, rondas, estimacionMin: est, entra: est <= disp };
}

// Duración y estimación de un formato (sin armar los partidos): la sugerida para que entre en el turno o, con
// partidoA (modo manual), la que sale de esa duración. → { partidoA, rondas, estimacionMin, entra }
export function planDeTiempo(formato, n, canchas, minutos, { partidoA: pedido = null, rondas: rondasPedidas, tercerPuesto = false } = {}) {
  const c = formato === "rey" ? 1 : canchas;
  let rondas = formato === "rey" ? Math.floor(Number(rondasPedidas) || 0) || undefined : undefined;
  let partidoA = pedido ? normalizarPartidoA(pedido) : null;
  if (!partidoA) ({ partidoA, rondas } = sugerirPartido(formato, n, c, minutos, { rondas, tercerPuesto }));
  if (formato === "rey") rondas = Math.min(MAX_PARTIDOS_REY, rondas || partidosReyQueEntran(Math.floor(n / 2), minutos, partidoA));
  const estimacionMin = estimarMinutos(formato, n, c, partidoA, { rondas, tercerPuesto });
  return { partidoA, rondas, estimacionMin, entra: estimacionMin <= minutos };
}

// Las opciones de formato para la pantalla: todas, con su explicación; las que no se pueden, con el motivo; las que
// sí, con la estimación contra el turno. → [{ formato, label, ayuda, valido, motivo, explicacion, estimacionMin?, entra? }]
export function opcionesDeFormato({ n, canchas = 1, minutos = 60, partidoA = null, tercerPuesto = false }) {
  return ORDEN_FORMATOS.map((formato) => {
    const ev = evaluarFormato(formato, n, canchas);
    const base = { ...ev, label: FORMATOS[formato].label, ayuda: FORMATOS[formato].ayuda };
    if (!ev.valido) return base;
    const t = planDeTiempo(formato, n, canchas, minutos, { partidoA, tercerPuesto });
    return { ...base, estimacionMin: t.estimacionMin, entra: t.entra };
  });
}

// Modo automático: entre los formatos que se pueden, según parejas, canchas y minutos. → { formato, motivo }
// 1) Liguilla, si todos contra todos entra con partidos de 4 games o más. 2) Torneo común (desde 6 parejas), si entra
// a games o con partidos de 12 minutos o más. 3) Americano, si todos contra todos entra con partidos cortos (a 6 games
// o de 10 minutos o más). 4) Eliminación directa, lo más corto.
export function elegirFormatoAuto({ n, canchas = 1, minutos = 60 }) {
  const P = Math.floor(n / 2);
  const ok = (f) => evaluarFormato(f, n, canchas).valido;
  const rr = ok("roundRobin") && sugerirPartido("roundRobin", n, canchas, minutos);
  if (rr && rr.entra && rr.partidoA.tipo === "games" && rr.partidoA.valor >= 4) {
    return { formato: "roundRobin", motivo: `Con ${P} parejas y ${minutos} minutos entra todos contra todos con partidos a ${rr.partidoA.valor} games.` };
  }
  const gr = ok("grupos") && sugerirPartido("grupos", n, canchas, minutos);
  if (gr && gr.entra && (gr.partidoA.tipo === "games" || gr.partidoA.valor >= 12)) {
    return { formato: "grupos", motivo: `Con ${P} parejas y ${minutos} minutos entran los grupos, las semis y la final.` };
  }
  const am = ok("americanoParejas") && sugerirPartido("americanoParejas", n, canchas, minutos);
  if (am && am.entra && (am.partidoA.tipo === "games" || am.partidoA.valor >= 10)) {
    return { formato: "americanoParejas", motivo: `Con ${P} parejas y ${minutos} minutos, todos contra todos entra con partidos cortos: americano.` };
  }
  if (ok("eliminacion")) return { formato: "eliminacion", motivo: `Con ${P} parejas y ${minutos} minutos, lo que entra es eliminación directa.` };
  return { formato: null, motivo: "" };
}

// Total de partidos del torneo (con los del rey que todavía no se armaron, y sin los byes del cuadro)
export function totalPartidos(mini) {
  const P = (mini.parejas || []).length;
  const tercero = mini.llave?.tercerPuesto || mini.tercerPuesto ? 1 : 0;
  switch (mini.formato) {
    case "rey":
      return Number(mini.rondas) || 0;
    case "eliminacion":
      return Math.max(0, P - 1) + tercero;
    case "grupos": {
      const seeds = (mini.grupos || []).length * avanzanPorGrupo(P);
      return (mini.partidos || []).filter((p) => p.fase === "grupo").length + Math.max(0, seeds - 1) + tercero;
    }
    default:
      return (mini.partidos || []).length;
  }
}

// ===== Armado completo =====
// entrada: { jugadores (de prepararJugadores), modo, formato? (en automático, solo si lo cambió a mano), parejas?
//   ([[idA, idB]] o de armarParejas), criterio?, canchas, partidoA?, rondas?, tercerPuesto?, horaInicio, horaFin, turnos?, seed }
// → { formato, motivo, partidoA, canchas, parejas, grupos, partidos, descansos, llave, rondas, tercerPuesto,
//     estimacionMin, minutosTurno, entra, totalPartidos }
export function armarMiniTorneo(entrada) {
  const { jugadores, modo = "auto", canchas: canchasIn = 1, horaInicio, horaFin, turnos, seed = 1 } = entrada;
  const error = validarJugadores(jugadores);
  if (error) throw new Error(error);
  const n = jugadores.length;
  const canchas = Math.max(1, Math.min(MAX_CANCHAS, Math.floor(Number(canchasIn) || 1)));
  const minutosTurno = minutosDelTurno(horaInicio, horaFin, turnos);
  let formato = entrada.formato;
  let motivo = "";
  if (!formato) ({ formato, motivo } = elegirFormatoAuto({ n, canchas, minutos: minutosTurno }));
  const ev = evaluarFormato(formato, n, canchas);
  if (!ev.valido) throw new Error(ev.explicacion);

  const tercerPuesto = !!entrada.tercerPuesto && admiteTercerPuesto(formato, n);
  const tiempo = planDeTiempo(formato, n, canchas, minutosTurno, {
    partidoA: modo === "manual" && entrada.partidoA ? entrada.partidoA : null,
    rondas: entrada.rondas,
    tercerPuesto,
  });
  const { partidoA, rondas } = tiempo;
  const parejas = parejasDeEntrada(jugadores, entrada, seed);
  const base = { formato, motivo, partidoA, canchas: formato === "rey" ? 1 : canchas, parejas, grupos: [], partidos: [], descansos: [], llave: null, rondas: rondas ?? null, tercerPuesto };
  if (esTodosContraTodos(formato)) base.partidos = asignarCanchas(partidosRoundRobin(parejas), canchas);
  else if (formato === "eliminacion") base.llave = crearLlave(parejas, { tercerPuesto });
  else if (formato === "rey") base.partidos = [siguientePartidoRey(parejas, [])];
  else {
    const grupos = repartirEnGrupos(parejas);
    base.parejas = grupos.flatMap((g) => g.parejas);
    base.grupos = grupos.map((g) => ({ nombre: g.nombre, parejas: g.parejas.map((p) => p.id) }));
    base.partidos = asignarCanchas(grupos.flatMap((g) => partidosRoundRobin(g.parejas, { fase: "grupo", grupo: g.nombre })), canchas);
  }
  base.estimacionMin = tiempo.estimacionMin;
  base.minutosTurno = minutosTurno;
  base.entra = tiempo.entra;
  base.totalPartidos = totalPartidos({ ...base, jugadores });
  return base;
}

function parejasDeEntrada(jugadores, entrada, seed) {
  if (Array.isArray(entrada.parejas) && entrada.parejas.length) {
    const porId = Object.fromEntries(jugadores.map((j) => [j.id, j]));
    const usados = new Set();
    const parejas = entrada.parejas.map((par, i) => {
      const ids = Array.isArray(par) ? par : par.jugadores;
      const [a, b] = (ids || []).map((id) => porId[id]);
      if (!a || !b || a.id === b.id || usados.has(a.id) || usados.has(b.id)) throw new Error("Revisá las parejas: cada jugador va en una sola");
      usados.add(a.id);
      usados.add(b.id);
      return crearPareja(a, b, i);
    });
    if (usados.size !== jugadores.length) throw new Error("Falta poner a alguien en una pareja");
    return parejas;
  }
  const criterio = entrada.criterio || (hayNiveles(jugadores) ? "nivel" : "azar");
  return armarParejas(jugadores, { criterio, seed });
}

export function normalizarPartidoA(p) {
  const tipo = p?.tipo === "minutos" ? "minutos" : "games";
  const valor = Math.floor(Number(p?.valor) || 0);
  const [min, max] = tipo === "minutos" ? [5, 60] : [1, 9];
  return { tipo, valor: Math.min(max, Math.max(min, valor || (tipo === "minutos" ? 15 : 4))) };
}

// ===== Resultados =====
// { g1, g2 } → texto del error o null. A N games: el ganador llega a N (el otro, menos). Cronometrado: cualquier
// tanteo; el empate solo donde la tabla cuenta games (americano), si no lo define un punto de oro.
export function validarResultado({ g1, g2 } = {}, partidoA, { permiteEmpate = false } = {}) {
  const vacio = (x) => x === null || x === undefined || String(x).trim() === "";
  const a = vacio(g1) ? NaN : Number(g1);
  const b = vacio(g2) ? NaN : Number(g2);
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) return "Cargá los games de los dos lados";
  if (a > 99 || b > 99) return "Revisá el resultado";
  if (partidoA?.tipo !== "minutos") {
    const n = Number(partidoA?.valor) || 0;
    if (Math.max(a, b) !== n || a === b) return `A ${n} games: el que gana llega a ${n}`;
    return null;
  }
  if (a === b && !permiteEmpate) return "No puede quedar empatado: definan con un punto de oro";
  return null;
}
export const resultadoDe = (g1, g2) => ({ sets: [{ g1: Number(g1), g2: Number(g2) }] });
export const gamesDe = (resultado) => (resultado?.sets?.[0] ? { g1: resultado.sets[0].g1, g2: resultado.sets[0].g2 } : null);
// ¿Puede quedar empatado? En el americano (cuenta games, no partidos) y en el americano viejo
export const permiteEmpate = (mini, partido) => partido?.fase === "americano" || (mini?.formato === "americanoParejas" && partido?.fase === "rr");

const gruposCompletos = (mini) => (mini.partidos || []).filter((p) => p.fase === "grupo").every((p) => !!p.resultado);
const llaveConResultados = (llave) => deLlave(llave).some((r) => r.some((p) => !!p.resultado)) || !!llave?.tercerPuesto?.resultado;

export function gruposDeMini(mini) {
  const porId = Object.fromEntries((mini.parejas || []).map((p) => [p.id, p]));
  return (mini.grupos || []).map((g) => ({
    nombre: g.nombre,
    parejas: (g.parejas || []).map((id) => porId[id]).filter(Boolean),
    partidos: (mini.partidos || []).filter((p) => p.fase === "grupo" && p.grupo === g.nombre),
  }));
}

// Rey de la cancha: cargar (o borrar) un resultado deja fijos los partidos anteriores, descarta el siguiente si todavía
// no tiene resultado y, con el resultado cargado, arma el siguiente (la que gana se queda; entra la primera de la fila).
function aplicarRey(mini, partidoId, resultado) {
  const partido = (mini.partidos || []).find((p) => p.id === partidoId);
  if (!partido) return { error: "No encontramos ese partido" };
  const r = partido.ronda;
  if ((mini.partidos || []).some((p) => p.ronda > r && p.resultado)) return { error: "Ya se jugó el partido siguiente: este resultado queda fijo" };
  if (resultado && getGanador(resultado) === null) return { error: "No puede quedar empatado: definan con un punto de oro" };
  let partidos = (mini.partidos || []).filter((p) => p.ronda <= r).map((p) => (p.id === partidoId ? { ...p, resultado: resultado || null } : { ...p }));
  const sig = siguienteRonda({ ...mini, partidos });
  if (sig) partidos = [...partidos, ...sig.partidos];
  return { partidos, llave: mini.llave || null, estado: terminado({ ...mini, partidos }) ? "finalizado" : "en_curso" };
}

// Carga (o borra, con resultado null) el resultado de un partido. Devuelve { partidos, llave, estado } o { error }.
export function aplicarResultado(mini, partidoId, resultado) {
  if (esDinamico(mini.formato)) return aplicarRey(mini, partidoId, resultado);
  const partidos = (mini.partidos || []).map((p) => ({ ...p }));
  let llave = mini.llave || null;
  const i = partidos.findIndex((p) => p.id === partidoId);
  if (i >= 0) {
    if (partidos[i].fase === "grupo" && llaveConResultados(llave)) return { error: "El cuadro ya empezó: los resultados de los grupos quedan fijos" };
    partidos[i].resultado = resultado || null;
    if (mini.formato === "grupos") {
      const nuevo = { ...mini, partidos };
      llave = gruposCompletos(nuevo) ? crearLlave(seedsDesdeGrupos(gruposDeMini(nuevo), avanzanPorGrupo((mini.parejas || []).length)), { tercerPuesto: !!mini.tercerPuesto }) : null;
    }
  } else if (partidoId === ID_TERCER_PUESTO) {
    const t = llave?.tercerPuesto;
    if (!t?.pareja1 || !t?.pareja2) return { error: "Ese partido todavía no tiene rivales" };
    llave = { ...llave, tercerPuesto: { ...t, resultado: resultado || null } };
  } else {
    const rondas = deLlave(llave);
    let encontrado = false;
    rondas.forEach((r) =>
      r.forEach((p) => {
        if (p.id === partidoId) {
          if (!p.pareja1 || !p.pareja2) return;
          p.resultado = resultado || null;
          encontrado = true;
        }
      }),
    );
    if (!encontrado) return { error: "Ese partido todavía no tiene rivales" };
    llave = reconstruirLlave({ rondas: rondas.map((r) => ({ partidos: r })), ...(llave?.tercerPuesto ? { tercerPuesto: llave.tercerPuesto } : {}) });
  }
  const estado = terminado({ ...mini, partidos, llave }) ? "finalizado" : "en_curso";
  return { partidos, llave, estado };
}

export function terminado(mini) {
  const partidos = mini.partidos || [];
  const todos = partidos.length > 0 && partidos.every((p) => !!p.resultado);
  if (mini.formato === "americano" || esTodosContraTodos(mini.formato)) return todos;
  if (mini.formato === "rey") return todos && partidos.length >= (Number(mini.rondas) || 0);
  if (!obtenerCampeonYSub(deLlave(mini.llave))) return false;
  return !mini.llave?.tercerPuesto || !!mini.llave.tercerPuesto.resultado;
}
export const rondasDeLlave = deLlave;
export const tercerPuestoDe = (mini) => mini?.llave?.tercerPuesto || null;

// ===== Tablas y podio =====
// Americano viejo (compañeros rotativos): tabla individual. Puntos = games ganados; desempatan la diferencia y los
// partidos ganados.
export function tablaAmericano(mini) {
  const stats = Object.fromEntries((mini.jugadores || []).map((j) => [j.id, { id: j.id, nombre: j.nombre, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, pts: 0 }]));
  (mini.partidos || []).forEach((p) => {
    const g = gamesDe(p.resultado);
    if (!g) return;
    const lado = (ids, a, b) =>
      ids.forEach((id) => {
        const s = stats[id];
        if (!s) return;
        s.pj++;
        s.gf += a;
        s.gc += b;
        s.pts += a;
        if (a > b) s.pg++;
        else if (a < b) s.pp++;
        else s.pe++;
      });
    lado(p.equipo1 || [], g.g1, g.g2);
    lado(p.equipo2 || [], g.g2, g.g1);
  });
  return Object.values(stats).sort((a, b) => b.pts - a.pts || b.gf - b.gc - (a.gf - a.gc) || b.pg - a.pg || a.nombre.localeCompare(b.nombre));
}

// Americano (parejas fijas): todos contra todos y gana quien suma más games. pj/pg/pe/pp, gf/gc y pts = games ganados.
// Desempatan la diferencia de games y los partidos ganados.
export function tablaAmericanoParejas(mini) {
  const stats = Object.fromEntries((mini.parejas || []).map((p) => [p.id, { ...p, id: p.id, nombre: p.nombrePareja, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, pts: 0 }]));
  (mini.partidos || []).forEach((m) => {
    const g = gamesDe(m.resultado);
    const s1 = stats[m.pareja1?.id];
    const s2 = stats[m.pareja2?.id];
    if (!g || !s1 || !s2) return;
    [
      [s1, g.g1, g.g2],
      [s2, g.g2, g.g1],
    ].forEach(([s, a, b]) => {
      s.pj++;
      s.gf += a;
      s.gc += b;
      s.pts += a;
      if (a > b) s.pg++;
      else if (a < b) s.pp++;
      else s.pe++;
    });
  });
  return Object.values(stats).sort((a, b) => b.pts - a.pts || b.gf - b.gc - (a.gf - a.gc) || b.pg - a.pg || a.nombre.localeCompare(b.nombre));
}

// Parejas: la tabla del motor (calcularTabla: partidos ganados, diferencia de sets y de games) para la liguilla, el
// rey de la cancha o un grupo
export function tablaParejas(mini, grupo = null) {
  if (grupo) {
    const g = gruposDeMini(mini).find((x) => x.nombre === grupo);
    return g ? calcularTabla(g) : [];
  }
  if (mini.formato === "americanoParejas") return tablaAmericanoParejas(mini);
  const fase = mini.formato === "rey" ? "rey" : "rr";
  return calcularTabla({ parejas: mini.parejas || [], partidos: (mini.partidos || []).filter((p) => p.fase === fase) });
}

// Podio cuando termina: [{ puesto, nombre }] (en el cuadro sin partido por el 3°, el 3° es compartido entre quienes
// perdieron las semis)
export function podio(mini) {
  if (!terminado(mini)) return null;
  if (mini.formato === "americano") return tablaAmericano(mini).slice(0, 3).map((r, i) => ({ puesto: i + 1, nombre: r.nombre, detalle: `${r.pts} games` }));
  if (mini.formato === "americanoParejas") return tablaAmericanoParejas(mini).slice(0, 3).map((r, i) => ({ puesto: i + 1, nombre: r.nombre, detalle: `${r.pts} games` }));
  if (mini.formato === "roundRobin" || mini.formato === "rey") return tablaParejas(mini).slice(0, 3).map((r, i) => ({ puesto: i + 1, nombre: r.nombre, detalle: `${r.pg} ganados` }));
  const rondas = deLlave(mini.llave);
  const cs = obtenerCampeonYSub(rondas);
  const lista = [
    { puesto: 1, nombre: cs.campeon.nombrePareja },
    { puesto: 2, nombre: cs.subcampeon.nombrePareja },
  ];
  const tercero = mini.llave?.tercerPuesto;
  if (tercero?.resultado) {
    const g = getGanador(tercero.resultado);
    const gana = g === 1 ? tercero.pareja1 : g === 2 ? tercero.pareja2 : null;
    if (gana) lista.push({ puesto: 3, nombre: gana.nombrePareja });
    return lista;
  }
  if (rondas.length >= 2) {
    rondas[rondas.length - 2].forEach((p) => {
      const perdedor = perdedorDe(p);
      if (perdedor) lista.push({ puesto: 3, nombre: perdedor.nombrePareja });
    });
  }
  return lista;
}

// Progreso: partidos con resultado / partidos del torneo (sin contar los byes del cuadro)
export function progreso(mini) {
  const jugados = [...(mini.partidos || []), ...deLlave(mini.llave).flat(), ...(mini.llave?.tercerPuesto ? [mini.llave.tercerPuesto] : [])];
  return { hechos: jugados.filter((p) => !!p.resultado).length, total: totalPartidos(mini) };
}

// Mensaje para compartir por WhatsApp
export const urlMini = (clubId, id, origen = typeof window !== "undefined" ? window.location.origin : "https://padely.netlify.app") => `${origen}/mini/${clubId}/${id}`;
export const mensajeMini = ({ nombre, fechaTexto, hora, clubNombre, url }) => `${nombre || "Mini torneo"} · ${fechaTexto} ${hora} en ${clubNombre}. Seguí los partidos y la tabla en vivo acá: ${url}`;
