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

    // P3-11: un resultado sin ganador (sets empatados, carga a medias) no cuenta (antes sumaba la victoria a la pareja 2)
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

// Un partido con sus dos parejas en proyección pública (las demás claves pasan tal cual: resultado, dia, hora,
// cancha, canchaId, y en la liga `fecha` = número de fecha del fixture)
export function partidoPublico(partido) {
  if (!partido || typeof partido !== "object") return partido ?? null;
  return { ...partido, pareja1: parejaPublica(partido.pareja1), pareja2: parejaPublica(partido.pareja2) };
}

// "masculino|7ma" -> "7ma"; null si no hay categoría
export function nivelDeCategoria(categoriaId) {
  if (typeof categoriaId !== "string" || !categoriaId.includes("|")) return null;
  return categoriaId.split("|")[1] || null;
}

// ===== Cuadros =====
// Un "cuadro" es un sorteo independiente dentro del torneo: una categoría con sus propios grupos (o fixture
// de liga), su propio bracket (tournaments/{tid}/cuadros/{cuadroId}), sus campeones y sus puntos.
// El id del cuadro es el id de la categoría ("masculino|7ma") o "general" cuando el torneo no tiene categorías.
// functions/puntos.js tiene una copia servidor de cuadrosDeTorneo y cuadroDeGrupo: mantenerlas iguales.
export const CUADRO_GENERAL = { id: "general", label: "General", genero: null, nivel: null };

export function cuadrosDeTorneo(torneo) {
  const categorias = listaCategorias(torneo);
  if (categorias.length === 0) return [{ ...CUADRO_GENERAL }];
  return categorias.map((c) => ({ id: c.id, label: c.label, genero: c.genero, nivel: c.nivel }));
}

// Cuadro de una pareja: su categoría si es una del torneo; el único cuadro cuando el torneo tiene uno solo
// (parejas con categoria null en torneos de una categoría o sin categorías); si no, null = "sin cuadro".
export function cuadroDePareja(pareja, torneo) {
  const cuadros = cuadrosDeTorneo(torneo);
  const categoria = pareja?.categoria;
  if (typeof categoria === "string" && cuadros.some((c) => c.id === categoria)) return categoria;
  if (cuadros.length === 1) return cuadros[0].id;
  return null;
}

export function parejasDeCuadro(parejas, cuadroId, torneo) {
  return (parejas || []).filter((p) => cuadroDePareja(p, torneo) === cuadroId);
}

export function parejasSinCuadro(parejas, torneo) {
  return (parejas || []).filter((p) => cuadroDePareja(p, torneo) === null);
}

// Cuadro de un grupo: su campo `cuadro`, o el primer cuadro del torneo si falta (datos viejos)
export function cuadroDeGrupo(grupo, torneo) {
  if (grupo && typeof grupo.cuadro === "string" && grupo.cuadro) return grupo.cuadro;
  return cuadrosDeTorneo(torneo)[0].id;
}

export function labelDeCuadro(cuadroId, torneo) {
  return cuadrosDeTorneo(torneo).find((c) => c.id === cuadroId)?.label || cuadroId || "";
}

// Nombre de una ronda del bracket según cuántas faltan para la final
export function nombreRonda(totalRondas, rondaIdx) {
  const faltantes = totalRondas - rondaIdx;
  if (faltantes === 1) return "Final";
  if (faltantes === 2) return "Semifinales";
  if (faltantes === 3) return "Cuartos de final";
  if (faltantes === 4) return "Octavos de final";
  if (faltantes === 5) return "16avos de final";
  return `Ronda ${rondaIdx + 1}`;
}

// ===== Sede y canchas del torneo =====
// tournaments/{tid}.club = null | { id, nombre, ciudad, estado: "pendiente" | "aceptado" | "rechazado" }
// tournaments/{tid}.canchas = [{ id, nombre }] (ids del club cuando hay club; slug del nombre si no)
// Los partidos llevan dia ("YYYY-MM-DD"), hora ("HH:MM"), cancha (nombre) y canchaId (id de la cancha del club o null).

export function slugDeCancha(nombre) {
  return (
    String(nombre || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "cancha"
  );
}

// "Cancha 1, Cancha 2" -> [{ id: "cancha-1", nombre: "Cancha 1" }, ...] (sin repetidos)
export function canchasDesdeTexto(texto) {
  const vistos = new Set();
  const lista = [];
  String(texto || "")
    .split(/[,;\n]/)
    .map((n) => n.trim())
    .filter(Boolean)
    .forEach((nombre) => {
      let id = slugDeCancha(nombre);
      let n = 2;
      while (vistos.has(id)) id = `${slugDeCancha(nombre)}-${n++}`;
      vistos.add(id);
      lista.push({ id, nombre });
    });
  return lista;
}

export function textoDeCanchas(canchas) {
  return (Array.isArray(canchas) ? canchas : []).map((c) => c?.nombre).filter(Boolean).join(", ");
}

export function canchasDelTorneo(torneo) {
  return Array.isArray(torneo?.canchas) ? torneo.canchas.filter((c) => c && c.id && c.nombre) : [];
}

// true cuando el torneo se juega en un club de Padely que ya aceptó
export function clubAceptado(torneo) {
  return !!(torneo?.club && torneo.club.id && torneo.club.estado === "aceptado");
}

// Dónde se juega, para mostrar: el club (si está vinculado) o la sede en texto
export function sedeDeTorneo(torneo) {
  const club = torneo?.club;
  if (club && club.id) {
    return {
      nombre: club.nombre || torneo.sede || "",
      ciudad: club.ciudad || torneo.ciudad || "",
      provincia: torneo.provincia || "",
      direccion: torneo.direccionSede || "",
      clubId: club.id,
      estado: club.estado || "pendiente",
      aceptado: club.estado === "aceptado",
    };
  }
  return {
    nombre: torneo?.sede || "",
    ciudad: torneo?.ciudad || "",
    provincia: torneo?.provincia || "",
    direccion: torneo?.direccionSede || "",
    clubId: null,
    estado: null,
    aceptado: false,
  };
}

// Un partido está programado cuando tiene día, hora y cancha (nombre; canchaId cuando hay club)
export function partidoProgramado(partido) {
  return !!(partido && partido.dia && partido.hora && partido.cancha);
}

// "sáb 18 oct · 20:00 · Cancha 2" con lo que haya cargado (las partes vacías se omiten)
export function etiquetaProgramacion(partido, formatDia) {
  if (!partido) return "";
  const partes = [];
  if (partido.dia) partes.push(typeof formatDia === "function" ? formatDia(partido.dia) : partido.dia);
  if (partido.hora) partes.push(partido.hora);
  if (partido.cancha) partes.push(partido.cancha);
  return partes.join(" · ");
}
