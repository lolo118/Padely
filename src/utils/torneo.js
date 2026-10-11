// Helpers compartidos de torneos (grupos, bracket, categorías)

export function getNombrePareja(p) {
  if (!p) return "Por definir";
  return p.nombrePareja || `${p.jugador1} / ${p.jugador2}`;
}

export function getGanador(resultado) {
  if (!resultado) return null;
  let setsP1 = 0,
    setsP2 = 0;
  resultado.sets.forEach((s) => {
    let g1 = s.g1,
      g2 = s.g2;
    if (s.tb1 !== undefined || s.tb2 !== undefined) {
      if ((s.tb1 ?? 0) > (s.tb2 ?? 0)) g1 += 1;
      else if ((s.tb2 ?? 0) > (s.tb1 ?? 0)) g2 += 1;
    }
    if (g1 > g2) setsP1++;
    else if (g2 > g1) setsP2++;
  });
  return setsP1 > setsP2 ? 1 : setsP2 > setsP1 ? 2 : null;
}

// Tabla de posiciones de un grupo: pj/pg/pp/sf/sc/gf/gc.
// Cada fila conserva los datos de la pareja (uids, categoría, etc.) además de las estadísticas.
export function calcularTabla(grupo) {
  const stats = {};
  (grupo.parejas || []).forEach((p) => {
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

  (grupo.partidos || []).forEach((m) => {
    if (!m.resultado) return;
    const s1 = stats[m.pareja1.id];
    const s2 = stats[m.pareja2.id];
    if (!s1 || !s2) return;

    let setsP1 = 0,
      setsP2 = 0,
      gamesP1 = 0,
      gamesP2 = 0;
    m.resultado.sets.forEach((set) => {
      let g1 = set.g1,
        g2 = set.g2;
      if (set.tb1 !== undefined || set.tb2 !== undefined) {
        if ((set.tb1 ?? 0) > (set.tb2 ?? 0)) g1 += 1;
        else if ((set.tb2 ?? 0) > (set.tb1 ?? 0)) g2 += 1;
      }
      gamesP1 += g1;
      gamesP2 += g2;
      if (g1 > g2) setsP1++;
      else if (g2 > g1) setsP2++;
    });

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

// Categorías del torneo a partir de categoriasConfig ({ masculino: ["7ma", ...], femenino: [...] })
export function listaCategorias(torneo) {
  const config = torneo?.categoriasConfig;
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

// Proyección pública de una pareja: lo único que puede ir en groups y en el bracket, que son documentos de
// lectura pública. Los contactos (whatsapp1/2, email1/2) viven en tournaments/{tid}/contactos/{pairId},
// que solo lee el organizador.
const CAMPOS_PAREJA_PUBLICA = [
  "id", "nombrePareja", "jugador1", "jugador2", "jugador1Uid", "jugador2Uid", "categoria", "grupo", "posGrupo",
];
export function parejaPublica(p) {
  if (!p || typeof p !== "object") return null;
  const publica = {};
  CAMPOS_PAREJA_PUBLICA.forEach((k) => {
    if (p[k] !== undefined) publica[k] = p[k];
  });
  return publica;
}

// Un partido con sus dos parejas en proyección pública (las demás claves: resultado, hora, cancha, fecha)
export function partidoPublico(partido) {
  if (!partido || typeof partido !== "object") return partido ?? null;
  return { ...partido, pareja1: parejaPublica(partido.pareja1), pareja2: parejaPublica(partido.pareja2) };
}

// "masculino|7ma" -> "7ma"; null si no hay categoría
export function nivelDeCategoria(categoriaId) {
  if (typeof categoriaId !== "string" || !categoriaId.includes("|")) return null;
  return categoriaId.split("|")[1] || null;
}
