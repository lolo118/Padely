// src/utils/miniTorneo.js — mini torneo dentro de un turno: la gente que juega una reserva arma un torneíto social
// (americano o parejas fijas) que entra en las horas reservadas. Puro, sin React ni Firebase (miniTorneo.test.js).
// Reusa el motor de torneos (fixture.js / torneo.js) para round robin, tablas y el cuadro; acá vive solo lo nuevo:
// la rotación del americano, el armado de parejas, la elección automática del formato y la estimación de tiempo.
// No suma puntos, rankings ni Pase: vive en clubs/{c}/miniTorneos/{id} y ninguna Function lo escucha.
//
// Documento: { clubId, clubNombre, canchaNombre, fecha, horaInicio, horaFin, reservaGrupoId, creadorUid, creadorNombre,
//   editoresUids, edicionAbierta, nombre, modo ("auto" | "manual"), formato, partidoA { tipo: "games" | "minutos", valor },
//   canchas, jugadores [{ id, nombre }], parejas [{ id, nombrePareja, jugadores: [id, id], grupo? }],
//   grupos [{ nombre, parejas: [id] }], partidos [...], descansos [{ ronda, jugadores: [id] }],
//   llave { rondas: [{ partidos: [...] }] } | null, estimacionMin, motivo, estado ("en_curso" | "finalizado") }
// Partido del americano: { id, fase: "americano", ronda, cancha, equipo1: [id, id], equipo2: [id, id], resultado }
// Partido de parejas: { id, fase: "rr" | "grupo", grupo?, ronda, cancha, pareja1, pareja2, resultado }
// resultado = { sets: [{ g1, g2 }] } (un solo "set" de games: el formato del motor, así getGanador y calcularTabla sirven)
import { calcularTabla, getGanador } from "./torneo.js";
import { avanzarGanadores, emparejarConByes, generarFixtureRoundRobin, generarRondas, obtenerCampeonYSub, seedsDesdeGrupos, siguientePotenciaDe2 } from "./fixture.js";
import { NIVELES, normalizarNivel } from "./categorias.js";

export const MIN_JUGADORES = 4;
export const MAX_JUGADORES = 16;
export const MAX_CANCHAS = 4;
// Tiempos de referencia (juego social): un game ~3,5 min; entre partido y partido 2 min; 10 min para calentar
export const MIN_POR_GAME = 3.5;
export const MIN_CAMBIO = 2;
export const MIN_CALENTAMIENTO = 10;
export const MIN_PARTIDO_CRONOMETRADO = 8;

export const FORMATOS = {
  americano: { label: "Americano", ayuda: "Cambian de compañero en cada partido. Tabla individual: suma los games que gana cada uno." },
  roundRobin: { label: "Parejas fijas · todos contra todos", ayuda: "Cada pareja juega contra todas. Gana la que más partidos gana." },
  grupos: { label: "Parejas fijas · grupos y final", ayuda: "Dos grupos de todos contra todos y después el cuadro con los mejores." },
  eliminacion: { label: "Parejas fijas · eliminación directa", ayuda: "Cuadro: quien pierde queda afuera. Lo más corto." },
};
export const esDeParejas = (formato) => formato === "roundRobin" || formato === "grupos" || formato === "eliminacion";

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
  if (n < MIN_JUGADORES) return `Hacen falta al menos ${MIN_JUGADORES} jugadores`;
  if (n > MAX_JUGADORES) return `Como máximo ${MAX_JUGADORES} jugadores`;
  const uids = jugadores.map((j) => j.uid).filter(Boolean);
  if (new Set(uids).size !== uids.length) return "Hay un jugador repetido";
  return null;
}

// ===== Americano =====
// Partidos simultáneos por ronda: uno por cancha, mientras alcancen los jugadores (4 por partido)
export function partidosPorRonda(n, canchas = 1) {
  return Math.max(1, Math.min(Math.max(1, Math.floor(Number(canchas) || 1)), Math.floor(n / 4)));
}
// Rondas para que cada jugador pueda jugar una vez con cada uno: n(n-1)/2 compañeros, 2 por partido
export function rondasAmericanoCompleto(n, canchas = 1) {
  return Math.ceil((n * (n - 1)) / 4 / partidosPorRonda(n, canchas));
}
// Rondas mínimas para que todos jueguen al menos una vez
export const rondasAmericanoMinimas = (n, canchas = 1) => Math.ceil(n / (4 * partidosPorRonda(n, canchas)));
// La mayor cantidad de rondas ≤ tope con la que todos juegan la misma cantidad de partidos (si existe ≥ mínimo)
export function rondasParejas(n, canchas, tope) {
  const m = partidosPorRonda(n, canchas);
  const minimo = rondasAmericanoMinimas(n, canchas);
  for (let r = tope; r >= minimo; r--) if ((r * 4 * m) % n === 0) return r;
  return Math.max(minimo, tope);
}

const clave = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

// Todas las formas de partir 4·m jugadores en m partidos (2 vs 2). Para 4 y 8 jugadores se recorren todas
// (3 y 315); con más se sortean `intentos` al azar.
function* todosLosPartidos(jugadores) {
  if (jugadores.length === 0) {
    yield [];
    return;
  }
  const [a, ...resto] = jugadores;
  for (let i = 0; i < resto.length; i++) {
    for (let j = i + 1; j < resto.length; j++) {
      for (let k = j + 1; k < resto.length; k++) {
        const grupo = [a, resto[i], resto[j], resto[k]];
        const quedan = resto.filter((_, x) => x !== i && x !== j && x !== k);
        for (const sub of todosLosPartidos(quedan)) {
          const [p, q, r, s] = grupo;
          yield [[[p, q], [r, s]], ...sub];
          yield [[[p, r], [q, s]], ...sub];
          yield [[[p, s], [q, r]], ...sub];
        }
      }
    }
  }
}
function partidosAlAzar(jugadores, azar) {
  const m = mezclar(jugadores, azar);
  const partidos = [];
  for (let i = 0; i < m.length; i += 4) partidos.push([[m[i], m[i + 1]], [m[i + 2], m[i + 3]]]);
  return partidos;
}

// Costo de una ronda: repetir compañero pesa mucho; repetir rival, poco
function costoRonda(partidos, companeros, rivales) {
  let costo = 0;
  partidos.forEach(([e1, e2]) => {
    costo += 1000 * (companeros.get(clave(e1[0], e1[1])) || 0) + 1000 * (companeros.get(clave(e2[0], e2[1])) || 0);
    e1.forEach((x) => e2.forEach((y) => (costo += 10 * (rivales.get(clave(x, y)) || 0))));
  });
  return costo;
}

function intentoAmericano(ids, m, total, azar) {
  const n = ids.length;
  const companeros = new Map();
  const rivales = new Map();
  const descansos = Object.fromEntries(ids.map((id) => [id, 0]));
  const jugados = Object.fromEntries(ids.map((id) => [id, 0]));
  let descansaronAntes = new Set();
  const rondas = [];
  let costoTotal = 0;
  for (let r = 1; r <= total; r++) {
    const cantDescansan = n - 4 * m;
    // Quién descansa: siempre los que menos descansaron (así todos juegan lo mismo, ±1); entre los empatados se
    // prueban varios grupos. Descansar dos rondas seguidas se evita siempre que descansen menos de los que juegan; si
    // descansan tantos o más (8 jugadores en una cancha) es solo un costo: evitarlo siempre dejaría dos grupos fijos
    // de 4 jugando entre ellos.
    const orden = mezclar(ids, azar).sort((a, b) => descansos[a] - descansos[b] || jugados[b] - jugados[a]);
    const tope = cantDescansan > 0 ? descansos[orden[cantDescansan - 1]] : 0;
    const fijos = orden.filter((id) => descansos[id] < tope).slice(0, cantDescansan);
    const empatados = orden.filter((id) => descansos[id] === tope && !fijos.includes(id));
    const candidatos = [];
    if (cantDescansan > 0) {
      const preferidos = [...empatados].sort((a, b) => Number(descansaronAntes.has(a)) - Number(descansaronAntes.has(b)));
      candidatos.push([...fijos, ...preferidos.slice(0, cantDescansan - fijos.length)]);
      const extra = empatados.length > cantDescansan - fijos.length ? (n - 4 * m <= 4 && 4 * m <= 8 ? 12 : 5) : 0;
      for (let k = 0; k < extra; k++) candidatos.push([...fijos, ...mezclar(empatados, azar).slice(0, cantDescansan - fijos.length)]);
    } else candidatos.push([]);

    let mejor = null;
    let mejorCosto = Infinity;
    let descansan = [];
    candidatos.forEach((cand) => {
      const seguidos = cand.filter((id) => descansaronAntes.has(id)).length;
      const base = (2 * cantDescansan < n ? 5000 : 300) * seguidos;
      if (base >= mejorCosto) return;
      const juegan = ids.filter((id) => !cand.includes(id));
      const probar = (partidos) => {
        const c = base + costoRonda(partidos, companeros, rivales);
        if (c < mejorCosto) {
          mejorCosto = c;
          mejor = partidos;
          descansan = cand;
        }
      };
      if (juegan.length <= 8) {
        for (const partidos of todosLosPartidos(mezclar(juegan, azar))) {
          probar(partidos);
          if (mejorCosto === base) break;
        }
      } else {
        for (let t = 0; t < 600 && mejorCosto > base; t++) probar(partidosAlAzar(juegan, azar));
      }
    });
    const juegan = ids.filter((id) => !descansan.includes(id));
    costoTotal += mejorCosto;
    mejor.forEach(([e1, e2]) => {
      companeros.set(clave(e1[0], e1[1]), (companeros.get(clave(e1[0], e1[1])) || 0) + 1);
      companeros.set(clave(e2[0], e2[1]), (companeros.get(clave(e2[0], e2[1])) || 0) + 1);
      e1.forEach((x) => e2.forEach((y) => rivales.set(clave(x, y), (rivales.get(clave(x, y)) || 0) + 1)));
    });
    juegan.forEach((id) => (jugados[id] += 1));
    descansan.forEach((id) => (descansos[id] += 1));
    descansaronAntes = new Set(descansan);
    rondas.push({ numero: r, partidos: mejor.map(([e1, e2], i) => ({ cancha: i + 1, equipo1: e1, equipo2: e2 })), descansan });
  }
  return { rondas, costoTotal };
}

// Rotación del americano para 4 a 16 jugadores. Devuelve { rondas: [{ numero, partidos: [{ cancha, equipo1, equipo2 }],
// descansan: [id] }] }. Todos juegan; quien descansa no repite descanso seguido si se puede evitar; los compañeros se
// reparten (con 4 jugadores, 3 rondas y cada uno juega una vez con cada otro). Se arma varias veces y queda la mejor.
export function generarAmericano(ids, { canchas = 1, rondas, seed = 1 } = {}) {
  const n = ids.length;
  if (n < MIN_JUGADORES || n > MAX_JUGADORES) throw new Error(`El americano es de ${MIN_JUGADORES} a ${MAX_JUGADORES} jugadores`);
  const m = partidosPorRonda(n, canchas);
  const total = Math.max(1, Math.floor(Number(rondas) || rondasAmericanoCompleto(n, canchas)));
  const azar = crearAzar(seed);
  const intentos = n <= 8 ? 24 : 6;
  let mejor = null;
  for (let i = 0; i < intentos; i++) {
    const intento = intentoAmericano(ids, m, total, azar);
    if (!mejor || intento.costoTotal < mejor.costoTotal) mejor = intento;
    if (mejor.costoTotal === 0) break;
  }
  return { rondas: mejor.rondas };
}

export function partidosDeAmericano(rondas) {
  const partidos = [];
  const descansos = [];
  rondas.forEach((r) => {
    r.partidos.forEach((p) => partidos.push({ id: `a${r.numero}-${p.cancha}`, fase: "americano", ronda: r.numero, cancha: p.cancha, equipo1: [...p.equipo1], equipo2: [...p.equipo2], resultado: null }));
    if (r.descansan.length) descansos.push({ ronda: r.numero, jugadores: [...r.descansan] });
  });
  return { partidos, descansos };
}

// ===== Parejas =====
export function indiceNivel(nivel) {
  const n = normalizarNivel(nivel);
  return n ? NIVELES.indexOf(n) : null;
}
// ¿Alcanzan los niveles para parejas parejas? (la mitad o más de los jugadores con nivel)
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

// Dos grupos (A y B) en zigzag por semilla: 1→A, 2→B, 3→B, 4→A, 5→A...
export function repartirEnGrupos(parejas) {
  const a = [];
  const b = [];
  parejas.forEach((p, i) => ((i % 4 === 0 || i % 4 === 3 ? a : b).push(p)));
  return [
    { nombre: "A", parejas: a.map((p) => ({ ...p, grupo: "A" })) },
    { nombre: "B", parejas: b.map((p) => ({ ...p, grupo: "B" })) },
  ];
}
// Cuántas parejas por grupo pasan al cuadro: con 5 o 6 parejas, el 1° de cada grupo juega la final; con 7 u 8, semis
export const avanzanPorGrupo = (cantParejas) => (cantParejas >= 7 ? 2 : 1);

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

// Cuadro guardable: { rondas: [{ partidos: [{ id, pareja1, pareja2, resultado }] }] } (Firestore no guarda arrays de arrays)
const aLlave = (rondas) => ({ rondas: rondas.map((r, ri) => ({ partidos: r.map((p, pi) => ({ id: `k${ri + 1}-${pi + 1}`, pareja1: parejaMin(p.pareja1), pareja2: parejaMin(p.pareja2), resultado: p.resultado || null })) })) });
const deLlave = (llave) => (llave?.rondas || []).map((r) => (r.partidos || []).map((p) => ({ ...p })));

// Orden clásico de los cruces en el cuadro (1-8, 4-5, 2-7, 3-6...): así las dos mejores semillas solo se cruzan en
// la final. emparejarConByes arma los cruces (semilla i con la n-1-i, byes a las mejores); acá solo se reordenan.
export function ordenDeCruces(cantidad) {
  if (cantidad <= 1) return [0];
  return ordenDeCruces(cantidad / 2).flatMap((i) => [i, cantidad - 1 - i]);
}
export function crearLlave(seeds) {
  const cruces = emparejarConByes(seeds.map(parejaMin));
  return aLlave(avanzarGanadores(generarRondas(ordenDeCruces(cruces.length).map((i) => cruces[i]))));
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
  return aLlave(rondas);
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
function tamañosDeGrupos(cantParejas) {
  return [Math.ceil(cantParejas / 2), Math.floor(cantParejas / 2)];
}
// Tandas (partidos que se juegan uno después del otro; en cada tanda, uno por cancha)
export function tandas(formato, n, canchas = 1, { rondas } = {}) {
  const c = Math.max(1, Math.floor(Number(canchas) || 1));
  const P = Math.floor(n / 2);
  if (formato === "americano") return Math.max(1, Math.floor(Number(rondas) || rondasAmericanoCompleto(n, c)));
  if (formato === "roundRobin") return sumaTandas(partidosPorFechaRR(P), c);
  if (formato === "eliminacion") {
    const S = siguientePotenciaDe2(P);
    const lista = [P - S / 2];
    for (let k = S / 4; k >= 1; k /= 2) lista.push(k);
    return sumaTandas(lista.filter((x) => x > 0), c);
  }
  if (formato === "grupos") {
    const [g1, g2] = tamañosDeGrupos(P);
    const f1 = partidosPorFechaRR(g1);
    const f2 = partidosPorFechaRR(g2);
    const fechas = Math.max(f1.length, f2.length);
    const porFecha = Array.from({ length: fechas }, (_, i) => (f1[i] || 0) + (f2[i] || 0));
    const llave = avanzanPorGrupo(P) === 2 ? [2, 1] : [1];
    return sumaTandas(porFecha, c) + sumaTandas(llave, c);
  }
  return 0;
}
export function estimarMinutos(formato, n, canchas, partidoA, opciones = {}) {
  return MIN_CALENTAMIENTO + tandas(formato, n, canchas, opciones) * minutosPorPartido(partidoA);
}

// Partidos por jugador en el americano (mín y máx) con esas rondas
export function partidosPorJugadorAmericano(n, canchas, rondas) {
  const jugadas = rondas * 4 * partidosPorRonda(n, canchas);
  return { min: Math.floor(jugadas / n), max: Math.ceil(jugadas / n) };
}

// Formatos que se pueden elegir a mano con n jugadores
export function formatosPosibles(n) {
  const lista = ["americano"];
  if (n % 2 === 0) {
    const P = n / 2;
    if (P >= 2 && P <= 6) lista.push("roundRobin");
    if (P >= 5) lista.push("grupos");
    if (P >= 3) lista.push("eliminacion");
  }
  return lista;
}

// Duración sugerida para que entre en el turno: a 6, 5, 4 o 3 games; si no, partidos cronometrados; en el americano,
// si ni así entra la vuelta completa, menos rondas (con la misma cantidad de partidos para todos cuando se puede).
export function sugerirPartido(formato, n, canchas, minutosDisponibles, opciones = {}) {
  const disp = Math.max(0, Number(minutosDisponibles) || 0);
  const rondasPedidas = formato === "americano" ? Math.floor(Number(opciones.rondas) || rondasAmericanoCompleto(n, canchas)) : undefined;
  for (const valor of [6, 5, 4, 3]) {
    const partidoA = { tipo: "games", valor };
    const est = estimarMinutos(formato, n, canchas, partidoA, { rondas: rondasPedidas });
    if (est <= disp) return { partidoA, rondas: rondasPedidas, estimacionMin: est, entra: true };
  }
  const t = tandas(formato, n, canchas, { rondas: rondasPedidas });
  const porPartido = Math.floor((disp - MIN_CALENTAMIENTO) / t) - MIN_CAMBIO;
  if (porPartido >= MIN_PARTIDO_CRONOMETRADO) {
    const partidoA = { tipo: "minutos", valor: porPartido };
    return { partidoA, rondas: rondasPedidas, estimacionMin: estimarMinutos(formato, n, canchas, partidoA, { rondas: rondasPedidas }), entra: true };
  }
  const partidoA = { tipo: "minutos", valor: 10 };
  if (formato === "americano") {
    const caben = Math.floor((disp - MIN_CALENTAMIENTO) / minutosPorPartido(partidoA));
    const rondas = Math.max(rondasAmericanoMinimas(n, canchas), rondasParejas(n, canchas, Math.min(caben, rondasPedidas)));
    const est = estimarMinutos(formato, n, canchas, partidoA, { rondas });
    return { partidoA, rondas, estimacionMin: est, entra: est <= disp };
  }
  const minimo = { tipo: "minutos", valor: MIN_PARTIDO_CRONOMETRADO };
  return { partidoA: minimo, rondas: undefined, estimacionMin: estimarMinutos(formato, n, canchas, minimo), entra: false };
}

// Modo automático: el formato según jugadores, canchas y minutos. Devuelve { formato, motivo }.
export function elegirFormatoAuto({ n, canchas = 1, minutos = 60 }) {
  if (n % 2 !== 0) return { formato: "americano", motivo: `Con ${n} jugadores (impar), el americano hace rotar a todos con descansos parejos.` };
  if (n <= 8) return { formato: "americano", motivo: `Con ${n} jugadores, el americano hace que todos jueguen con todos.` };
  if (canchas * 4 >= n) return { formato: "americano", motivo: `Con ${canchas} canchas juegan todos en cada ronda: americano.` };
  const enGrupos = sugerirPartido("grupos", n, canchas, minutos);
  if (enGrupos.entra && (enGrupos.partidoA.tipo === "games" || enGrupos.partidoA.valor >= 12)) {
    return { formato: "grupos", motivo: `Con ${n / 2} parejas y ${minutos} minutos entran dos grupos y el cuadro final.` };
  }
  return { formato: "eliminacion", motivo: `Con ${n / 2} parejas y ${minutos} minutos, lo que entra es eliminación directa.` };
}

// ===== Armado completo =====
// entrada: { jugadores (de prepararJugadores), modo, formato?, parejas? ([[idA, idB]] o de armarParejas), criterio?,
//   canchas, partidoA?, rondas?, horaInicio, horaFin, turnos?, seed }
// → { formato, motivo, partidoA, canchas, parejas, grupos, partidos, descansos, llave, estimacionMin, minutosTurno, entra, rondas }
export function armarMiniTorneo(entrada) {
  const { jugadores, modo = "auto", canchas: canchasIn = 1, horaInicio, horaFin, turnos, seed = 1 } = entrada;
  const error = validarJugadores(jugadores);
  if (error) throw new Error(error);
  const n = jugadores.length;
  const canchas = Math.max(1, Math.min(MAX_CANCHAS, Math.floor(Number(canchasIn) || 1)));
  const minutosTurno = minutosDelTurno(horaInicio, horaFin, turnos);
  let formato = entrada.formato;
  let motivo = "";
  if (modo === "auto" || !formato) ({ formato, motivo } = elegirFormatoAuto({ n, canchas, minutos: minutosTurno }));
  if (!formatosPosibles(n).includes(formato)) throw new Error(`${FORMATOS[formato]?.label || "Ese formato"} no se puede con ${n} jugadores`);

  let partidoA = modo === "manual" && entrada.partidoA ? normalizarPartidoA(entrada.partidoA) : null;
  let rondas = formato === "americano" ? Math.floor(Number(entrada.rondas) || 0) || undefined : undefined;
  if (!partidoA) {
    const s = sugerirPartido(formato, n, canchas, minutosTurno, { rondas });
    partidoA = s.partidoA;
    rondas = s.rondas;
  }
  if (formato === "americano" && !rondas) rondas = rondasAmericanoCompleto(n, canchas);

  const base = { formato, motivo, partidoA, canchas, parejas: [], grupos: [], partidos: [], descansos: [], llave: null, rondas: rondas ?? null };
  if (formato === "americano") {
    const { rondas: plan } = generarAmericano(jugadores.map((j) => j.id), { canchas, rondas, seed });
    Object.assign(base, partidosDeAmericano(plan));
  } else {
    const parejas = parejasDeEntrada(jugadores, entrada, seed);
    base.parejas = parejas;
    if (formato === "roundRobin") base.partidos = asignarCanchas(partidosRoundRobin(parejas), canchas);
    else if (formato === "eliminacion") base.llave = crearLlave(parejas);
    else {
      const grupos = repartirEnGrupos(parejas);
      base.parejas = grupos.flatMap((g) => g.parejas);
      base.grupos = grupos.map((g) => ({ nombre: g.nombre, parejas: g.parejas.map((p) => p.id) }));
      base.partidos = asignarCanchas(grupos.flatMap((g) => partidosRoundRobin(g.parejas, { fase: "grupo", grupo: g.nombre })), canchas);
    }
  }
  base.estimacionMin = estimarMinutos(formato, n, canchas, partidoA, { rondas });
  base.minutosTurno = minutosTurno;
  base.entra = base.estimacionMin <= minutosTurno;
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
// tanteo; el empate solo en el americano (en parejas lo define un punto de oro).
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

const gruposCompletos = (mini) => (mini.partidos || []).filter((p) => p.fase === "grupo").every((p) => !!p.resultado);
const llaveConResultados = (llave) => deLlave(llave).some((r) => r.some((p) => !!p.resultado));

export function gruposDeMini(mini) {
  const porId = Object.fromEntries((mini.parejas || []).map((p) => [p.id, p]));
  return (mini.grupos || []).map((g) => ({
    nombre: g.nombre,
    parejas: (g.parejas || []).map((id) => porId[id]).filter(Boolean),
    partidos: (mini.partidos || []).filter((p) => p.fase === "grupo" && p.grupo === g.nombre),
  }));
}

// Carga (o borra, con resultado null) el resultado de un partido. Devuelve { partidos, llave, estado } o { error }.
export function aplicarResultado(mini, partidoId, resultado) {
  const partidos = (mini.partidos || []).map((p) => ({ ...p }));
  let llave = mini.llave || null;
  const i = partidos.findIndex((p) => p.id === partidoId);
  if (i >= 0) {
    if (partidos[i].fase === "grupo" && llaveConResultados(llave)) return { error: "El cuadro ya empezó: los resultados de los grupos quedan fijos" };
    partidos[i].resultado = resultado || null;
    if (mini.formato === "grupos") {
      const nuevo = { ...mini, partidos };
      llave = gruposCompletos(nuevo) ? crearLlave(seedsDesdeGrupos(gruposDeMini(nuevo), avanzanPorGrupo((mini.parejas || []).length))) : null;
    }
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
    llave = reconstruirLlave({ rondas: rondas.map((r) => ({ partidos: r })) });
  }
  const estado = terminado({ ...mini, partidos, llave }) ? "finalizado" : "en_curso";
  return { partidos, llave, estado };
}

export function terminado(mini) {
  if (mini.formato === "americano" || mini.formato === "roundRobin") return (mini.partidos || []).length > 0 && mini.partidos.every((p) => !!p.resultado);
  return !!obtenerCampeonYSub(deLlave(mini.llave));
}
export const rondasDeLlave = deLlave;

// ===== Tablas y podio =====
// Americano: tabla individual. Puntos = games ganados; desempatan la diferencia y los partidos ganados.
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

// Parejas: la tabla del motor (calcularTabla: partidos ganados, diferencia de sets y de games) para todos contra todos
// o para un grupo
export function tablaParejas(mini, grupo = null) {
  if (grupo) {
    const g = gruposDeMini(mini).find((x) => x.nombre === grupo);
    return g ? calcularTabla(g) : [];
  }
  return calcularTabla({ parejas: mini.parejas || [], partidos: (mini.partidos || []).filter((p) => p.fase === "rr") });
}

// Podio cuando termina: [{ puesto, nombre }] (en el cuadro, el 3° es compartido entre quienes perdieron las semis)
export function podio(mini) {
  if (!terminado(mini)) return null;
  if (mini.formato === "americano") return tablaAmericano(mini).slice(0, 3).map((r, i) => ({ puesto: i + 1, nombre: r.nombre, detalle: `${r.pts} games` }));
  if (mini.formato === "roundRobin") return tablaParejas(mini).slice(0, 3).map((r, i) => ({ puesto: i + 1, nombre: r.nombre, detalle: `${r.pg} ganados` }));
  const rondas = deLlave(mini.llave);
  const cs = obtenerCampeonYSub(rondas);
  const lista = [
    { puesto: 1, nombre: cs.campeon.nombrePareja },
    { puesto: 2, nombre: cs.subcampeon.nombrePareja },
  ];
  if (rondas.length >= 2) {
    rondas[rondas.length - 2].forEach((p) => {
      const g = getGanador(p.resultado);
      const perdedor = g === 1 ? p.pareja2 : g === 2 ? p.pareja1 : null;
      if (perdedor) lista.push({ puesto: 3, nombre: perdedor.nombrePareja });
    });
  }
  return lista;
}

// Progreso: partidos con resultado / partidos jugables (sin contar los byes del cuadro)
export function progreso(mini) {
  const jugables = [...(mini.partidos || []), ...deLlave(mini.llave).flat().filter((p) => p.pareja1 && p.pareja2)];
  return { hechos: jugables.filter((p) => !!p.resultado).length, total: jugables.length };
}

// Mensaje para compartir por WhatsApp
export const urlMini = (clubId, id, origen = typeof window !== "undefined" ? window.location.origin : "https://padely.netlify.app") => `${origen}/mini/${clubId}/${id}`;
export const mensajeMini = ({ nombre, fechaTexto, hora, clubNombre, url }) => `${nombre || "Mini torneo"} · ${fechaTexto} ${hora} en ${clubNombre}. Seguí los partidos y la tabla en vivo acá: ${url}`;
