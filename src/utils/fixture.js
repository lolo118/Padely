// src/utils/fixture.js — armado de torneos sin React (P3-11): fixture de liga (round robin), partidos de grupo,
// semillas y cruces del cuadro, rondas, byes, avance de ganadores y validación de un resultado. Antes vivían dentro
// de TabGrupos/TabBracket; acá se testean (fixture.test.js).
import { calcularTabla, getGanador } from "./torneo.js";

// Menor potencia de 2 >= n (n parejas -> tamaño del cuadro)
export function siguientePotenciaDe2(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

export function nuevoPartido(pareja1, pareja2) {
  return {
    pareja1: pareja1 || null,
    pareja2: pareja2 || null,
    resultado: null,
    dia: "",
    hora: "",
    cancha: "",
    canchaId: null,
  };
}

export function mismoGrupo(a, b) {
  return !!(a && b && a.grupo && b.grupo && a.grupo === b.grupo);
}

// Completa las semillas con null hasta la próxima potencia de 2 y cruza la semilla i con la n-1-i
// (las mejores semillas reciben los byes). Después intenta evitar cruces entre parejas del mismo grupo.
export function emparejarConByes(seeds) {
  const n = siguientePotenciaDe2(seeds.length);
  const rellenas = [...seeds];
  while (rellenas.length < n) rellenas.push(null);
  const partidos = [];
  for (let i = 0; i < n / 2; i++) {
    partidos.push(nuevoPartido(rellenas[i], rellenas[n - 1 - i]));
  }

  // Fix-up: mientras haya un cruce del mismo grupo, intercambiamos su pareja2 con la de otro partido
  // siempre que el cambio no genere un nuevo cruce del mismo grupo. Máximo dos pasadas.
  for (let pasada = 0; pasada < 2; pasada++) {
    let huboClash = false;
    for (let i = 0; i < partidos.length; i++) {
      const m = partidos[i];
      if (!mismoGrupo(m.pareja1, m.pareja2)) continue;
      huboClash = true;
      for (let j = 0; j < partidos.length; j++) {
        if (j === i) continue;
        const o = partidos[j];
        if (!o.pareja2) continue;
        if (mismoGrupo(m.pareja1, o.pareja2) || mismoGrupo(o.pareja1, m.pareja2)) continue;
        const tmp = m.pareja2;
        m.pareja2 = o.pareja2;
        o.pareja2 = tmp;
        break;
      }
    }
    if (!huboClash) break;
  }
  return partidos;
}

// Semillas desde los grupos: todos los 1° (en orden de nombre de grupo), después todos los 2°, etc.
export function seedsDesdeGrupos(grupos, parejasQueAvanzan) {
  const tablas = grupos
    .map((g) => ({ nombre: g.nombre, tabla: calcularTabla(g) }))
    .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));
  const seeds = [];
  for (let pos = 0; pos < parejasQueAvanzan; pos++) {
    tablas.forEach((g) => {
      if (g.tabla[pos]) seeds.push({ ...g.tabla[pos], posGrupo: pos + 1, grupo: g.nombre });
    });
  }
  return seeds;
}

// Primera ronda = los cruces recibidos (cantidad potencia de 2); cada ronda siguiente tiene la mitad
export function generarRondas(partidosIniciales) {
  const rondas = [partidosIniciales];
  let cantSiguiente = partidosIniciales.length / 2;
  while (cantSiguiente >= 1) {
    rondas.push(Array.from({ length: cantSiguiente }, () => nuevoPartido(null, null)));
    cantSiguiente = cantSiguiente / 2;
  }
  return rondas;
}

// Un partido es "bye" si tiene exactamente una pareja, no tiene resultado y el lugar vacío
// no puede llenarse (primera ronda, o el partido que lo alimenta está vacío).
export function esBye(rondas, rondaIdx, partidoIdx) {
  const partido = rondas[rondaIdx]?.[partidoIdx];
  if (!partido || partido.resultado) return false;
  const tieneUna = (partido.pareja1 && !partido.pareja2) || (!partido.pareja1 && partido.pareja2);
  if (!tieneUna) return false;
  if (rondaIdx === 0) return true;
  const feederIdx = partido.pareja1 ? partidoIdx * 2 + 1 : partidoIdx * 2;
  const feeder = rondas[rondaIdx - 1]?.[feederIdx];
  return !feeder || (!feeder.pareja1 && !feeder.pareja2);
}

export function avanzarGanadores(rondas) {
  const nuevasRondas = rondas.map((r) => r.map((p) => ({ ...p })));
  for (let ri = 0; ri < nuevasRondas.length - 1; ri++) {
    for (let pi = 0; pi < nuevasRondas[ri].length; pi++) {
      const partido = nuevasRondas[ri][pi];
      let ganador = null;
      if (partido.resultado) {
        // P3-11: un resultado sin ganador (sets empatados) no hace avanzar a nadie (antes pasaba la pareja 2)
        const g = getGanador(partido.resultado);
        ganador = g === 1 ? partido.pareja1 : g === 2 ? partido.pareja2 : null;
      } else if (esBye(nuevasRondas, ri, pi)) {
        ganador = partido.pareja1 || partido.pareja2;
      }
      if (!ganador) continue;
      const siguienteIdx = Math.floor(pi / 2);
      const posicion = pi % 2 === 0 ? "pareja1" : "pareja2";
      if (nuevasRondas[ri + 1][siguienteIdx]) {
        nuevasRondas[ri + 1][siguienteIdx] = {
          ...nuevasRondas[ri + 1][siguienteIdx],
          [posicion]: ganador,
        };
      }
    }
  }
  return nuevasRondas;
}

export function obtenerCampeonYSub(rondas) {
  if (!rondas || rondas.length === 0) return null;
  const final = rondas[rondas.length - 1][0];
  if (!final || !final.resultado || !final.pareja1 || !final.pareja2)
    return null;
  const g = getGanador(final.resultado);
  if (g !== 1 && g !== 2) return null;
  return {
    campeon: g === 1 ? final.pareja1 : final.pareja2,
    subcampeon: g === 1 ? final.pareja2 : final.pareja1,
  };
}

// Round-robin scheduling (circle method)
export function generarFixtureRoundRobin(parejas) {
  const teams = [...parejas];
  const hasBye = teams.length % 2 !== 0;
  if (hasBye) teams.push({ id: "BYE", jugador1: "Descansa", jugador2: "", nombrePareja: "Descansa" });
  const totalTeams = teams.length;
  const totalFechas = totalTeams - 1;
  const matchesPerFecha = totalTeams / 2;
  const fechas = [];
  const fixed = teams[0];
  const rotating = teams.slice(1);

  for (let round = 0; round < totalFechas; round++) {
    const matches = [];
    const opp = rotating[0];
    if (fixed.id !== "BYE" && opp.id !== "BYE") {
      matches.push({ pareja1: fixed, pareja2: opp, resultado: null, dia: "", hora: "", cancha: "", canchaId: null, fecha: round + 1 });
    }
    for (let i = 1; i < matchesPerFecha; i++) {
      const home = rotating[i];
      // P3-11: el rival es el simétrico en la ronda (antes totalTeams - 2 - i: una pareja jugaba contra sí misma)
      const away = rotating[totalTeams - 1 - i];
      if (home && away && home.id !== "BYE" && away.id !== "BYE") {
        matches.push({ pareja1: home, pareja2: away, resultado: null, dia: "", hora: "", cancha: "", canchaId: null, fecha: round + 1 });
      }
    }
    fechas.push(matches);
    rotating.unshift(rotating.pop());
  }
  return fechas;
}

export function generarPartidos(parejas) {
  const partidos = [];
  for (let i = 0; i < parejas.length; i++) {
    for (let j = i + 1; j < parejas.length; j++) {
      partidos.push({
        pareja1: parejas[i],
        pareja2: parejas[j],
        resultado: null,
        dia: "",
        hora: "",
        cancha: "",
        canchaId: null,
      });
    }
  }
  return partidos;
}

// Valida los sets de un resultado (P3-11; antes copiado en TabGrupos y TabBracket). sets: [{ g1, g2 }],
// tiebreaks: [{ activo, tb1, tb2 }]. Devuelve el texto del error o null. Además de las reglas de cada set, exige que
// alguien gane el partido (antes un 1-1 en un partido a 3 sets sin el tercero se guardaba sin ganador).
export function validarSets(sets, tiebreaks = [], { gamesPorSet = 6, cantSets = 1 } = {}) {
  const gps = Number(gamesPorSet) || 6;
  const setsParaGanar = Math.ceil((Number(cantSets) || 1) / 2);
  let setsP1 = 0;
  let setsP2 = 0;
  for (let i = 0; i < sets.length; i++) {
    if (setsP1 >= setsParaGanar || setsP2 >= setsParaGanar) break;
    const s = sets[i];
    const max = Math.max(s.g1, s.g2);
    const min = Math.min(s.g1, s.g2);
    if (max < gps) return `Set ${i + 1}: al menos un equipo debe alcanzar ${gps} games`;
    if (max === gps && min === gps - 1) {
      return `Set ${i + 1}: no puede terminar ${max}-${min}. Si igualan ${gps - 1}-${gps - 1}, se juega a ${gps + 1}. Si igualan ${gps}-${gps}, van a tiebreak.`;
    }
    if (s.g1 >= gps && s.g2 >= gps && Math.abs(s.g1 - s.g2) <= 1 && !tiebreaks[i]?.activo) {
      return `Set ${i + 1}: con ${s.g1}-${s.g2} necesitás activar el tiebreak`;
    }
    if (max > gps + 1 && min >= gps) return `Set ${i + 1}: resultado ${s.g1}-${s.g2} no es válido`;
    let g1 = s.g1;
    let g2 = s.g2;
    if (tiebreaks[i]?.activo) {
      if ((tiebreaks[i].tb1 ?? 0) > (tiebreaks[i].tb2 ?? 0)) g1 += 1;
      else if ((tiebreaks[i].tb2 ?? 0) > (tiebreaks[i].tb1 ?? 0)) g2 += 1;
      else return `Set ${i + 1}: el tiebreak no puede terminar empatado`;
    }
    if (g1 > g2) setsP1++;
    else if (g2 > g1) setsP2++;
  }
  if (setsP1 === 0 && setsP2 === 0) return "Cargá al menos un set";
  if (setsP1 < setsParaGanar && setsP2 < setsParaGanar) return `Falta definir el partido: alguien tiene que ganar ${setsParaGanar} ${setsParaGanar === 1 ? "set" : "sets"}`;
  return null;
}
