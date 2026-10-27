// functions/puntos.js — lógica de puntos y ranking de Padely.
// Es una copia servidor de src/utils/torneo.js (getGanador, calcularTabla, nivelDeCategoria) y de
// las reglas que vivían en src/services/torneoService.js (PUNTOS, multiplicador, ascenso).
// Cualquier cambio acá tiene que reflejarse en el texto "¿Cómo funciona?" de Perfil.jsx.

const CATEGORIAS_ORDEN = ["8va", "7ma", "6ta", "5ta", "4ta", "3era", "2da", "1era", "Libre"];

const PUNTOS = {
  ganarPartido: 10,
  ganarSet: 3,
  perderPartido: 2,
  campeon: 50,
  subcampeon: 25,
};

// Multiplicador por jugar en una categoría superior a la propia: x1 (misma o inferior),
// x1.5 (una categoría más arriba), x2 (dos o más categorías más arriba).
function getMultiplicadorCategoria(categoriaJugador, categoriaTorneo) {
  const idxJugador = CATEGORIAS_ORDEN.indexOf(categoriaJugador);
  const idxTorneo = CATEGORIAS_ORDEN.indexOf(categoriaTorneo);
  if (idxJugador === -1 || idxTorneo === -1) return 1;
  const diff = idxTorneo - idxJugador;
  if (diff >= 2) return 2;
  if (diff === 1) return 1.5;
  return 1;
}

// "masculino|7ma" -> "7ma"; null si no hay categoría
function nivelDeCategoria(categoriaId) {
  if (typeof categoriaId !== "string" || !categoriaId.includes("|")) return null;
  return categoriaId.split("|")[1] || null;
}

// ===== Cuadros (copia servidor de src/utils/torneo.js: listaCategorias, cuadrosDeTorneo, cuadroDeGrupo) =====
// Categorías del torneo a partir de categoriasConfig ({ masculino: ["7ma", ...], femenino: [...] })
function listaCategorias(torneo) {
  const config = torneo && torneo.categoriasConfig;
  if (!config || typeof config !== "object") return [];
  const lista = [];
  Object.entries(config).forEach(([genero, niveles]) => {
    (Array.isArray(niveles) ? niveles : []).forEach((nivel) => {
      const Genero = genero.charAt(0).toUpperCase() + genero.slice(1);
      lista.push({ id: `${genero}|${nivel}`, genero, nivel, label: `${nivel} ${Genero}` });
    });
  });
  return lista;
}

// Un cuadro por categoría; sin categorías, un único cuadro "general"
function cuadrosDeTorneo(torneo) {
  const categorias = listaCategorias(torneo);
  if (categorias.length === 0) return [{ id: "general", label: "General", genero: null, nivel: null }];
  return categorias.map((c) => ({ id: c.id, label: c.label, genero: c.genero, nivel: c.nivel }));
}

// Cuadro de un grupo: su campo `cuadro`, o el primer cuadro del torneo si falta (datos viejos)
function cuadroDeGrupo(grupo, torneo) {
  if (grupo && typeof grupo.cuadro === "string" && grupo.cuadro) return grupo.cuadro;
  return cuadrosDeTorneo(torneo)[0].id;
}

// Primera categoría configurada del torneo ("8va" si no hay ninguna). Se usa cuando la pareja
// no tiene categoría propia, igual que en TabGrupos/TabBracket.
function categoriaFallbackDeTorneo(torneo) {
  const config = torneo && torneo.categoriasConfig;
  if (!config || typeof config !== "object") return "8va";
  return Object.values(config).flat()[0] || "8va";
}

// Games de un set aplicando la regla del tie-break: quien gana el tie-break suma un game.
function gamesDeSet(set) {
  let g1 = Number(set && set.g1) || 0;
  let g2 = Number(set && set.g2) || 0;
  if (set && (set.tb1 !== undefined || set.tb2 !== undefined)) {
    const tb1 = set.tb1 ?? 0;
    const tb2 = set.tb2 ?? 0;
    if (tb1 > tb2) g1 += 1;
    else if (tb2 > tb1) g2 += 1;
  }
  return { g1, g2 };
}

// Sets ganados por cada pareja (un set empatado en games no cuenta para nadie)
function contarSets(resultado) {
  let setsP1 = 0;
  let setsP2 = 0;
  const sets = resultado && Array.isArray(resultado.sets) ? resultado.sets : [];
  sets.forEach((s) => {
    const { g1, g2 } = gamesDeSet(s);
    if (g1 > g2) setsP1++;
    else if (g2 > g1) setsP2++;
  });
  return { setsP1, setsP2 };
}

// 1 si ganó la pareja 1, 2 si ganó la pareja 2, null si no hay resultado o están empatados
function getGanador(resultado) {
  if (!resultado) return null;
  const { setsP1, setsP2 } = contarSets(resultado);
  return setsP1 > setsP2 ? 1 : setsP2 > setsP1 ? 2 : null;
}

// Tabla de posiciones de un grupo: pj/pg/pp/sf/sc/gf/gc, ordenada por partidos ganados,
// diferencia de sets y diferencia de games. Cada fila conserva los datos de la pareja.
function calcularTabla(grupo) {
  const stats = {};
  ((grupo && grupo.parejas) || []).forEach((p) => {
    stats[p.id] = {
      ...p,
      id: p.id,
      nombre: p.nombrePareja || `${p.jugador1} / ${p.jugador2}`,
      pj: 0,
      pg: 0,
      pp: 0,
      sf: 0,
      sc: 0,
      gf: 0,
      gc: 0,
    };
  });

  ((grupo && grupo.partidos) || []).forEach((m) => {
    if (!m || !m.resultado || !m.pareja1 || !m.pareja2) return;
    const s1 = stats[m.pareja1.id];
    const s2 = stats[m.pareja2.id];
    if (!s1 || !s2) return;

    let setsP1 = 0;
    let setsP2 = 0;
    let gamesP1 = 0;
    let gamesP2 = 0;
    (Array.isArray(m.resultado.sets) ? m.resultado.sets : []).forEach((set) => {
      const { g1, g2 } = gamesDeSet(set);
      gamesP1 += g1;
      gamesP2 += g2;
      if (g1 > g2) setsP1++;
      else if (g2 > g1) setsP2++;
    });

    // P3-11: igual que el cliente: un resultado sin ganador (sets empatados) no cuenta
    if (setsP1 === setsP2) return;
    s1.pj++;
    s2.pj++;
    s1.sf += setsP1;
    s1.sc += setsP2;
    s2.sf += setsP2;
    s2.sc += setsP1;
    s1.gf += gamesP1;
    s1.gc += gamesP2;
    s2.gf += gamesP2;
    s2.gc += gamesP1;
    if (setsP1 > setsP2) {
      s1.pg++;
      s2.pp++;
    } else {
      s2.pg++;
      s1.pp++;
    }
  });

  return Object.values(stats).sort((a, b) => {
    if (b.pg !== a.pg) return b.pg - a.pg;
    if (b.sf - b.sc !== a.sf - a.sc) return b.sf - b.sc - (a.sf - a.sc);
    return b.gf - b.gc - (a.gf - a.gc);
  });
}

// Puntos de un partido para un jugador: 3 por set ganado + 10 si ganó / 2 si perdió,
// multiplicado por categoría y redondeado.
function puntosDePartido(setsGanados, ganoPartido, multiplicador) {
  const base =
    setsGanados * PUNTOS.ganarSet + (ganoPartido ? PUNTOS.ganarPartido : PUNTOS.perderPartido);
  return Math.round(base * multiplicador);
}

// Bonus de campeón (posición 1) o subcampeón (posición 2), multiplicado por categoría y redondeado.
function bonusDeTorneo(posicion, multiplicador) {
  if (posicion === 1) return Math.round(PUNTOS.campeon * multiplicador);
  if (posicion === 2) return Math.round(PUNTOS.subcampeon * multiplicador);
  return 0;
}

// Evalúa el ascenso de categoría sobre los datos YA actualizados del usuario (con el bonus sumado).
// Tres vías, como en el cliente: A) 150+ pts y 2 torneos ganados en la categoría,
// B) 300+ pts y 1 torneo ganado, C) 500+ pts (experiencia). "Libre" no asciende más.
// Devuelve null si no asciende; si asciende, devuelve los cambios para users/{uid}
// (nivel nuevo, torneosGanadosEnCategoria en 0, ascensos con la entrada nueva) y la notificación
// a crear en users/{uid}/notifications. Las escrituras las hace el llamador dentro de su transacción.
function evaluarAscenso(data, fechaIso) {
  const categoriaActual = (data && data.nivel) || "";
  const puntos = (data && data.puntos) || 0;
  const torneosGanadosEnCategoria = (data && data.torneosGanadosEnCategoria) || 0;

  const idxActual = CATEGORIAS_ORDEN.indexOf(categoriaActual);
  if (idxActual === -1 || idxActual >= CATEGORIAS_ORDEN.length - 1) return null;

  const viaA = puntos >= 150 && torneosGanadosEnCategoria >= 2;
  const viaB = puntos >= 300 && torneosGanadosEnCategoria >= 1;
  const viaC = puntos >= 500;
  if (!(viaA || viaB || viaC)) return null;

  const nuevaCategoria = CATEGORIAS_ORDEN[idxActual + 1];
  const via = viaA ? "A (puntos + victorias)" : viaB ? "B (puntos + victoria)" : "C (experiencia)";
  return {
    de: categoriaActual,
    a: nuevaCategoria,
    via,
    updates: {
      nivel: nuevaCategoria,
      torneosGanadosEnCategoria: 0,
      ascensos: [
        ...((data && data.ascensos) || []),
        {
          de: categoriaActual,
          a: nuevaCategoria,
          fecha: fechaIso,
          puntos,
          torneosGanados: torneosGanadosEnCategoria,
          via,
        },
      ],
    },
    notificacion: {
      tipo: "ascenso",
      titulo: "¡Subiste de categoría!",
      mensaje: `Pasaste de ${categoriaActual} a ${nuevaCategoria}`,
      link: "/perfil",
      icono: "🏆",
      leida: false,
    },
  };
}

module.exports = {
  CATEGORIAS_ORDEN,
  PUNTOS,
  getMultiplicadorCategoria,
  nivelDeCategoria,
  listaCategorias,
  cuadrosDeTorneo,
  cuadroDeGrupo,
  categoriaFallbackDeTorneo,
  gamesDeSet,
  contarSets,
  getGanador,
  calcularTabla,
  puntosDePartido,
  bonusDeTorneo,
  evaluarAscenso,
};
