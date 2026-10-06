import { useEffect, useState } from "react";
import {
  getGrupos,
  getParejas,
  guardarBracket,
  getBracket,
} from "../../services/torneoService";
import { notificarResultadoCargado } from "../../services/notificationService";
import { calcularTabla, getGanador, getNombrePareja, nivelDeCategoria } from "../../utils/torneo";

function getNombreRonda(totalRondas, rondaIdx) {
  const faltantes = totalRondas - rondaIdx;
  if (faltantes === 1) return "Final";
  if (faltantes === 2) return "Semifinales";
  if (faltantes === 3) return "Cuartos de final";
  if (faltantes === 4) return "Octavos de final";
  if (faltantes === 5) return "16avos de final";
  return `Ronda ${rondaIdx + 1}`;
}

// Menor potencia de 2 >= n (n parejas -> tamaño del cuadro)
function siguientePotenciaDe2(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

function nuevoPartido(pareja1, pareja2) {
  return { pareja1: pareja1 || null, pareja2: pareja2 || null, resultado: null, hora: "", cancha: "" };
}

function mismoGrupo(a, b) {
  return !!(a && b && a.grupo && b.grupo && a.grupo === b.grupo);
}

// Completa las semillas con null hasta la próxima potencia de 2 y cruza la semilla i con la n-1-i
// (las mejores semillas reciben los byes). Después intenta evitar cruces entre parejas del mismo grupo.
function emparejarConByes(seeds) {
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
function seedsDesdeGrupos(grupos, parejasQueAvanzan) {
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

function generarCrucesAutomaticos(grupos, parejasQueAvanzan) {
  return emparejarConByes(seedsDesdeGrupos(grupos, parejasQueAvanzan));
}

// Primera ronda = los cruces recibidos (cantidad potencia de 2); cada ronda siguiente tiene la mitad
function generarRondas(partidosIniciales) {
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
function esBye(rondas, rondaIdx, partidoIdx) {
  const partido = rondas[rondaIdx]?.[partidoIdx];
  if (!partido || partido.resultado) return false;
  const tieneUna = (partido.pareja1 && !partido.pareja2) || (!partido.pareja1 && partido.pareja2);
  if (!tieneUna) return false;
  if (rondaIdx === 0) return true;
  const feederIdx = partido.pareja1 ? partidoIdx * 2 + 1 : partidoIdx * 2;
  const feeder = rondas[rondaIdx - 1]?.[feederIdx];
  return !feeder || (!feeder.pareja1 && !feeder.pareja2);
}

function avanzarGanadores(rondas) {
  const nuevasRondas = rondas.map((r) => r.map((p) => ({ ...p })));
  for (let ri = 0; ri < nuevasRondas.length - 1; ri++) {
    for (let pi = 0; pi < nuevasRondas[ri].length; pi++) {
      const partido = nuevasRondas[ri][pi];
      let ganador = null;
      if (partido.resultado) {
        const g = getGanador(partido.resultado);
        ganador = g === 1 ? partido.pareja1 : partido.pareja2;
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

function obtenerCampeonYSub(rondas) {
  if (!rondas || rondas.length === 0) return null;
  const final = rondas[rondas.length - 1][0];
  if (!final || !final.resultado || !final.pareja1 || !final.pareja2)
    return null;
  const g = getGanador(final.resultado);
  return {
    campeon: g === 1 ? final.pareja1 : final.pareja2,
    subcampeon: g === 1 ? final.pareja2 : final.pareja1,
  };
}

function ManualBracketBuilder({ clasificados, onConfirm }) {
  // Tamaño del cuadro: próxima potencia de 2; una llave con un solo lugar ocupado es un bye
  const cantPartidos = Math.max(1, siguientePotenciaDe2(clasificados.length) / 2);
  const [llaves, setLlaves] = useState(
    Array.from({ length: cantPartidos }, () => nuevoPartido(null, null)),
  );

  const asignadasIds = new Set(
    llaves.flatMap((l) => [l.pareja1?.id, l.pareja2?.id].filter(Boolean)),
  );
  const sinAsignar = clasificados.filter((c) => !asignadasIds.has(c.id));

  return (
    <div className="flex flex-col gap-3 mt-2">
      {sinAsignar.length > 0 && (
        <div>
          <p className="text-sm font-semibold mb-2" style={{ color: "var(--text-muted)" }}>
            Parejas clasificadas sin asignar ({sinAsignar.length})
          </p>
          <div className="flex flex-col gap-1">
            {sinAsignar.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-xl px-4 py-2 border"
                style={{ backgroundColor: "rgba(234,179,8,0.08)", borderColor: "rgba(234,179,8,0.3)" }}
              >
                <div>
                  <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {getNombrePareja(p)}
                  </span>
                  {p.grupo && (
                    <span className="text-xs ml-2" style={{ color: "var(--text-muted)" }}>
                      ({p.grupo} — {p.posGrupo}°)
                    </span>
                  )}
                </div>
                <div className="flex gap-1 flex-wrap">
                  {llaves.map((l, li) => (
                    <span key={li} className="flex gap-0.5">
                      {!l.pareja1 && (
                        <button
                          onClick={() => {
                            const n = llaves.map((x, i) =>
                              i === li ? { ...x, pareja1: p } : x,
                            );
                            setLlaves(n);
                          }}
                          className="px-2 py-1 rounded-lg text-xs font-semibold bg-green-100 text-green-700 hover:bg-green-200 transition"
                        >
                          L{li + 1}↑
                        </button>
                      )}
                      {!l.pareja2 && (
                        <button
                          onClick={() => {
                            const n = llaves.map((x, i) =>
                              i === li ? { ...x, pareja2: p } : x,
                            );
                            setLlaves(n);
                          }}
                          className="px-2 py-1 rounded-lg text-xs font-semibold bg-green-100 text-green-700 hover:bg-green-200 transition"
                        >
                          L{li + 1}↓
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div>
        <p className="text-sm font-semibold mb-2" style={{ color: "var(--text-muted)" }}>Llaves</p>
        <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>
          Si una llave queda con una sola pareja, esa pareja pasa directo (bye).
        </p>
        <div className="flex flex-col gap-2">
          {llaves.map((l, li) => (
            <div key={li} className="rounded-xl px-4 py-3" style={{ backgroundColor: "var(--bg-card-hover)" }}>
              <p className="text-xs font-semibold mb-1" style={{ color: "var(--text-muted)" }}>
                Llave {li + 1}
              </p>
              <div className="flex items-center justify-between">
                <span
                  className={`text-sm ${l.pareja1 ? "font-medium" : ""}`}
                  style={l.pareja1 ? { color: "var(--text-primary)" } : { color: "var(--text-muted)", opacity: 0.4 }}
                >
                  {l.pareja1 ? getNombrePareja(l.pareja1) : "— vacío —"}
                </span>
                {l.pareja1 && (
                  <button
                    onClick={() => {
                      const n = llaves.map((x, i) =>
                        i === li ? { ...x, pareja1: null } : x,
                      );
                      setLlaves(n);
                    }}
                    className="text-xs text-red-400 hover:text-red-600"
                  >
                    Quitar
                  </button>
                )}
              </div>
              <p className="text-xs my-0.5" style={{ color: "var(--text-muted)" }}>vs</p>
              <div className="flex items-center justify-between">
                <span
                  className={`text-sm ${l.pareja2 ? "font-medium" : ""}`}
                  style={l.pareja2 ? { color: "var(--text-primary)" } : { color: "var(--text-muted)", opacity: 0.4 }}
                >
                  {l.pareja2 ? getNombrePareja(l.pareja2) : "— vacío —"}
                </span>
                {l.pareja2 && (
                  <button
                    onClick={() => {
                      const n = llaves.map((x, i) =>
                        i === li ? { ...x, pareja2: null } : x,
                      );
                      setLlaves(n);
                    }}
                    className="text-xs text-red-400 hover:text-red-600"
                  >
                    Quitar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      <button
        onClick={() => onConfirm(llaves)}
        disabled={sinAsignar.length > 0}
        className="bg-green-600 text-white font-semibold py-2 rounded-xl hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {sinAsignar.length === 0
          ? "Generar bracket manual"
          : `Faltan ${sinAsignar.length} pareja${sinAsignar.length !== 1 ? "s" : ""} por asignar`}
      </button>
    </div>
  );
}

export default function TabBracket({ torneoId, torneo }) {
  const [grupos, setGrupos] = useState([]);
  const [parejas, setParejas] = useState([]);
  const [rondas, setRondas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bracketGenerado, setBracketGenerado] = useState(false);
  const [editandoResultado, setEditandoResultado] = useState(null);
  const [setsInput, setSetsInput] = useState([]);
  const [tiebreakInput, setTiebreakInput] = useState([]);
  const [modoGeneracion, setModoGeneracion] = useState("automatico");
  const [errorModal, setErrorModal] = useState("");

  const parejasQueAvanzan = Number(torneo.parejasQueAvanzan) || 2;
  // Eliminación directa: el cuadro se arma con todas las parejas inscriptas, sin fase de grupos
  const esEliminacionDirecta = torneo.formato === "eliminacion";

  useEffect(() => {
    const cargar = async () => {
      try {
        const [gruposData, bracketData, parejasData] = await Promise.all([
          getGrupos(torneoId),
          getBracket(torneoId),
          torneo.formato === "eliminacion" ? getParejas(torneoId) : Promise.resolve([]),
        ]);
        setGrupos(gruposData);
        setParejas(parejasData);
        if (bracketData && bracketData.rondas) {
          setRondas(avanzarGanadores(bracketData.rondas));
          setBracketGenerado(true);
        }
      } catch (err) {
        console.error("Error al cargar bracket:", err);
      }
      setLoading(false);
    };
    cargar();
  }, [torneoId, torneo.formato]);

  // Parejas que entran al cuadro: las clasificadas de los grupos, o todas en eliminación directa
  const clasificados = esEliminacionDirecta ? parejas : seedsDesdeGrupos(grupos, parejasQueAvanzan);

  const generarBracketAutomatico = () => {
    let partidos;
    if (esEliminacionDirecta) {
      if (parejas.length < 2) return;
      const sorteadas = [...parejas].sort(() => Math.random() - 0.5);
      partidos = emparejarConByes(sorteadas);
    } else {
      if (grupos.length === 0) return;
      partidos = generarCrucesAutomaticos(grupos, parejasQueAvanzan);
    }
    setRondas(avanzarGanadores(generarRondas(partidos)));
  };

  const confirmarBracket = async () => {
    try {
      await guardarBracket(torneoId, { rondas });
      setBracketGenerado(true);
    } catch (err) {
      console.error("Error al guardar bracket:", err);
    }
  };

  const actualizarPartidoBracket = async (
    rondaIdx,
    partidoIdx,
    campo,
    valor,
  ) => {
    const partidoOriginal = rondas[rondaIdx]?.[partidoIdx];
    const yaEstabaProgramado = partidoOriginal?.hora && partidoOriginal?.cancha;

    const nuevasRondas = rondas.map((r) => r.map((p) => ({ ...p })));
    nuevasRondas[rondaIdx][partidoIdx] = {
      ...nuevasRondas[rondaIdx][partidoIdx],
      [campo]: valor,
    };
    setRondas(nuevasRondas);
    try {
      await guardarBracket(torneoId, { rondas: nuevasRondas });
    } catch (err) {
      console.error("Error al actualizar:", err);
    }

    const partidoActualizado = nuevasRondas[rondaIdx][partidoIdx];
    if (!yaEstabaProgramado && partidoActualizado.hora && partidoActualizado.cancha) {
      try {
        const { notificarPartidoListo } = await import("../../services/notificationService");
        const torneoNombre = torneo.nombre || "torneo";
        const p1 = partidoActualizado.pareja1;
        const p2 = partidoActualizado.pareja2;
        if (!p1 || !p2) return;
        const nombreP1 = p1.nombrePareja || `${p1.jugador1} / ${p1.jugador2}`;
        const nombreP2 = p2.nombrePareja || `${p2.jugador1} / ${p2.jugador2}`;
        if (p1.jugador1Uid) notificarPartidoListo(p1.jugador1Uid, torneoNombre, torneoId, partidoActualizado.hora, partidoActualizado.cancha, nombreP2);
        if (p1.jugador2Uid) notificarPartidoListo(p1.jugador2Uid, torneoNombre, torneoId, partidoActualizado.hora, partidoActualizado.cancha, nombreP2);
        if (p2.jugador1Uid) notificarPartidoListo(p2.jugador1Uid, torneoNombre, torneoId, partidoActualizado.hora, partidoActualizado.cancha, nombreP1);
        if (p2.jugador2Uid) notificarPartidoListo(p2.jugador2Uid, torneoNombre, torneoId, partidoActualizado.hora, partidoActualizado.cancha, nombreP1);
      } catch (err) { console.error("Error notificando partido listo:", err); }
    }
  };

  const abrirEditarResultado = (rondaIdx, partidoIdx) => {
    const partido = rondas[rondaIdx][partidoIdx];
    if (!partido.pareja1 || !partido.pareja2) return;
    const cantSets = Number(torneo.sets) || 1;
    const setsExistentes = partido.resultado?.sets || [];
    const sets = [],
      tbs = [];
    for (let i = 0; i < cantSets; i++) {
      sets.push({
        g1: setsExistentes[i]?.g1 || 0,
        g2: setsExistentes[i]?.g2 || 0,
      });
      tbs.push({
        activo:
          setsExistentes[i]?.tb1 !== undefined ||
          setsExistentes[i]?.tb2 !== undefined,
        tb1: setsExistentes[i]?.tb1 || 0,
        tb2: setsExistentes[i]?.tb2 || 0,
      });
    }
    setSetsInput(sets);
    setTiebreakInput(tbs);
    setErrorModal("");
    setEditandoResultado({ rondaIdx, partidoIdx });
  };

  const validarResultado = () => {
    const gamesPorSet = Number(torneo.gamesPorSet) || 6;
    const cantSets = Number(torneo.sets) || 1;
    const setsParaGanar = Math.ceil(cantSets / 2);
    let setsP1 = 0, setsP2 = 0;

    for (let i = 0; i < setsInput.length; i++) {
      if (setsP1 >= setsParaGanar || setsP2 >= setsParaGanar) break;
      const s = setsInput[i];
      const max = Math.max(s.g1, s.g2);
      const min = Math.min(s.g1, s.g2);

      if (max < gamesPorSet) {
        return `Set ${i + 1}: al menos un equipo debe alcanzar ${gamesPorSet} games`;
      }

      // Validar diferencia de 2 games
      if (max === gamesPorSet && min === gamesPorSet - 1) {
        return `Set ${i + 1}: no puede terminar ${max}-${min}. Si igualan ${gamesPorSet - 1}-${gamesPorSet - 1}, se juega a ${gamesPorSet + 1}. Si igualan ${gamesPorSet}-${gamesPorSet}, van a tiebreak.`;
      }

      // Si ambos tienen 6 o más, debe haber tiebreak
      if (s.g1 >= gamesPorSet && s.g2 >= gamesPorSet && Math.abs(s.g1 - s.g2) <= 1) {
        if (!tiebreakInput[i]?.activo) {
          return `Set ${i + 1}: con ${s.g1}-${s.g2} necesitás activar el tiebreak`;
        }
      }

      // Si la diferencia es mayor a 2 y ambos superan gamesPorSet, no es válido (excepto 7-5)
      if (max > gamesPorSet + 1 && min >= gamesPorSet) {
        return `Set ${i + 1}: resultado ${s.g1}-${s.g2} no es válido`;
      }

      let g1 = s.g1, g2 = s.g2;
      if (tiebreakInput[i]?.activo) {
        if ((tiebreakInput[i].tb1 ?? 0) > (tiebreakInput[i].tb2 ?? 0)) g1 += 1;
        else if ((tiebreakInput[i].tb2 ?? 0) > (tiebreakInput[i].tb1 ?? 0)) g2 += 1;
      }
      if (g1 > g2) setsP1++; else if (g2 > g1) setsP2++;
    }

    if (setsP1 === 0 && setsP2 === 0) return "Cargá al menos un set";
    return null;
  };

  const setsVisibles = () => {
    const cantSets = Number(torneo.sets) || 1;
    if (cantSets <= 1) return 1;
    const setsParaGanar = Math.ceil(cantSets / 2);
    let p1 = 0,
      p2 = 0;
    for (let i = 0; i < setsInput.length; i++) {
      const s = setsInput[i];
      let g1 = s.g1,
        g2 = s.g2;
      if (tiebreakInput[i]?.activo) {
        if ((tiebreakInput[i].tb1 ?? 0) > (tiebreakInput[i].tb2 ?? 0)) g1 += 1;
        else if ((tiebreakInput[i].tb2 ?? 0) > (tiebreakInput[i].tb1 ?? 0))
          g2 += 1;
      }
      if (g1 > g2) p1++;
      else if (g2 > g1) p2++;
      if (p1 >= setsParaGanar || p2 >= setsParaGanar) return i + 1;
    }
    return cantSets;
  };

  const guardarResultado = async (keepOpen = false) => {
    const err = validarResultado();
    if (err) {
      setErrorModal(err);
      return;
    }

    const { rondaIdx, partidoIdx } = editandoResultado;
    const cantSets = Number(torneo.sets) || 1;
    const setsParaGanar = Math.ceil(cantSets / 2);
    // Los puntos (y el bonus de campeón/subcampeón) se otorgan una sola vez
    const esPrimerResultado = !rondas[rondaIdx][partidoIdx].resultado;

    let setsP1 = 0,
      setsP2 = 0;
    const setsFinales = [];
    for (let i = 0; i < setsInput.length; i++) {
      if (setsP1 >= setsParaGanar || setsP2 >= setsParaGanar) break;
      const set = setsInput[i];
      const resultado = { g1: set.g1, g2: set.g2 };
      if (tiebreakInput[i]?.activo) {
        resultado.tb1 = tiebreakInput[i].tb1;
        resultado.tb2 = tiebreakInput[i].tb2;
      }
      setsFinales.push(resultado);
      let g1 = set.g1,
        g2 = set.g2;
      if (resultado.tb1 !== undefined) {
        if (resultado.tb1 > (resultado.tb2 ?? 0)) g1 += 1;
        else if ((resultado.tb2 ?? 0) > resultado.tb1) g2 += 1;
      }
      if (g1 > g2) setsP1++;
      else if (g2 > g1) setsP2++;
    }

    const nuevasRondas = rondas.map((r) => r.map((p) => ({ ...p })));
    nuevasRondas[rondaIdx][partidoIdx] = {
      ...nuevasRondas[rondaIdx][partidoIdx],
      resultado: { sets: setsFinales },
    };
    const rondasActualizadas = avanzarGanadores(nuevasRondas);
    setRondas(rondasActualizadas);

    try {
      await guardarBracket(torneoId, { rondas: rondasActualizadas });
    } catch (e) {
      console.error("Error al guardar resultado:", e);
    }

    // Actualizar puntos de los jugadores (solo la primera vez que se carga el resultado)
    if (esPrimerResultado) {
      try {
        const { actualizarPuntosPartido, actualizarPuntosTorneo } = await import("../../services/torneoService");
        const partido = rondasActualizadas[rondaIdx][partidoIdx];
        const p1 = partido.pareja1;
        const p2 = partido.pareja2;
        // Categoría del torneo: la de la pareja puntuada si la tiene, si no la primera configurada
        const categoriaFallback = torneo.categoriasConfig ? Object.values(torneo.categoriasConfig).flat()[0] || "8va" : "8va";
        const categoriaP1 = nivelDeCategoria(p1.categoria) || categoriaFallback;
        const categoriaP2 = nivelDeCategoria(p2.categoria) || categoriaFallback;
        let sP1 = 0, sP2 = 0;
        setsFinales.forEach((s) => {
          let g1 = s.g1, g2 = s.g2;
          if (s.tb1 !== undefined && s.tb2 !== undefined) {
            if (s.tb1 > s.tb2) g1++; else if (s.tb2 > s.tb1) g2++;
          }
          if (g1 > g2) sP1++; else if (g2 > g1) sP2++;
        });
        const ganoP1 = sP1 > sP2;
        if (p1.jugador1Uid) await actualizarPuntosPartido(p1.jugador1Uid, ganoP1 ? sP1 : sP2, ganoP1, categoriaP1);
        if (p1.jugador2Uid) await actualizarPuntosPartido(p1.jugador2Uid, ganoP1 ? sP1 : sP2, ganoP1, categoriaP1);
        if (p2.jugador1Uid) await actualizarPuntosPartido(p2.jugador1Uid, ganoP1 ? sP2 : sP1, !ganoP1, categoriaP2);
        if (p2.jugador2Uid) await actualizarPuntosPartido(p2.jugador2Uid, ganoP1 ? sP2 : sP1, !ganoP1, categoriaP2);

        // Si es la final, dar bonus
        const esFinal = rondaIdx === rondasActualizadas.length - 1;
        if (esFinal) {
          const campeon = ganoP1 ? p1 : p2;
          const sub = ganoP1 ? p2 : p1;
          const categoriaCampeon = ganoP1 ? categoriaP1 : categoriaP2;
          const categoriaSub = ganoP1 ? categoriaP2 : categoriaP1;
          if (campeon.jugador1Uid) await actualizarPuntosTorneo(campeon.jugador1Uid, 1, categoriaCampeon);
          if (campeon.jugador2Uid) await actualizarPuntosTorneo(campeon.jugador2Uid, 1, categoriaCampeon);
          if (sub.jugador1Uid) await actualizarPuntosTorneo(sub.jugador1Uid, 2, categoriaSub);
          if (sub.jugador2Uid) await actualizarPuntosTorneo(sub.jugador2Uid, 2, categoriaSub);
        }
      } catch (err) { console.error("Error actualizando puntos:", err); }
    }

    // Notify players about result
    try {
      const matchP = rondasActualizadas[rondaIdx][partidoIdx];
      const torneoNombre = torneo.nombre || "torneo";
      if (matchP.pareja1?.jugador1Uid) notificarResultadoCargado(matchP.pareja1.jugador1Uid, torneoNombre, torneoId);
      if (matchP.pareja1?.jugador2Uid) notificarResultadoCargado(matchP.pareja1.jugador2Uid, torneoNombre, torneoId);
      if (matchP.pareja2?.jugador1Uid) notificarResultadoCargado(matchP.pareja2.jugador1Uid, torneoNombre, torneoId);
      if (matchP.pareja2?.jugador2Uid) notificarResultadoCargado(matchP.pareja2.jugador2Uid, torneoNombre, torneoId);
    } catch (err) { console.error("Error notificando resultado:", err); }

    if (!keepOpen) {
      setEditandoResultado(null);
      setSetsInput([]);
      setTiebreakInput([]);
      setErrorModal("");
    }
  };

  if (loading)
    return (
      <div className="text-center py-12" style={{ color: "var(--text-muted)" }}>Cargando bracket...</div>
    );

  if (!esEliminacionDirecta && grupos.length === 0) {
    return (
      <div className="themed-card rounded-2xl p-5 border text-center py-12">
        <div className="text-4xl mb-3">📋</div>
        <p className="font-medium" style={{ color: "var(--text-muted)" }}>Primero generá los grupos</p>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
          Necesitás tener grupos confirmados con resultados cargados
        </p>
      </div>
    );
  }

  if (esEliminacionDirecta && parejas.length < 2 && rondas.length === 0) {
    return (
      <div className="themed-card rounded-2xl p-5 border text-center py-12">
        <div className="text-4xl mb-3">👥</div>
        <p className="font-medium" style={{ color: "var(--text-muted)" }}>Necesitás al menos 2 parejas inscriptas</p>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
          Actualmente hay {parejas.length} pareja{parejas.length !== 1 ? "s" : ""}
        </p>
      </div>
    );
  }

  const campeonData = obtenerCampeonYSub(rondas);
  const partido = editandoResultado
    ? rondas[editandoResultado.rondaIdx][editandoResultado.partidoIdx]
    : null;

  return (
    <div className="flex flex-col gap-4">
      {/* Regenerar arriba */}
      {bracketGenerado && (
        <div className="flex justify-end">
          <button
            onClick={() => {
              if (
                window.confirm(
                  "¿Regenerar el bracket? Se perderán todos los resultados.",
                )
              ) {
                setBracketGenerado(false);
                setRondas([]);
              }
            }}
            className="px-3 py-1 rounded-lg text-xs font-semibold text-red-500 transition"
            style={{ backgroundColor: "rgba(239,68,68,0.08)" }}
          >
            Regenerar bracket desde cero
          </button>
        </div>
      )}

      {/* Tip */}
      {bracketGenerado && !campeonData && (
        <div className="text-xs rounded-lg px-3 py-2 border"
          style={{ color: "#3b82f6", backgroundColor: "rgba(59,130,246,0.08)", borderColor: "rgba(59,130,246,0.15)" }}>
          💡 Asigná horario y cancha a cada partido. Cargá los resultados y los
          ganadores avanzarán automáticamente a la siguiente ronda.
        </div>
      )}

      {/* Campeones */}
      {bracketGenerado && campeonData && (
        <div className="rounded-2xl p-6 shadow-sm text-center border"
          style={{ background: "linear-gradient(to right, rgba(234,179,8,0.08), rgba(234,179,8,0.15))", borderColor: "rgba(234,179,8,0.3)" }}>
          <div className="text-5xl mb-3">🏆</div>
          <p className="text-xs text-yellow-600 font-semibold uppercase tracking-wider mb-1">
            Campeones
          </p>
          <p className="text-xl font-bold mb-4" style={{ color: "var(--text-primary)" }}>
            {getNombrePareja(campeonData.campeon)}
          </p>
          <div className="text-3xl mb-2">🥈</div>
          <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>
            Subcampeones
          </p>
          <p className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            {getNombrePareja(campeonData.subcampeon)}
          </p>
        </div>
      )}

      {/* Generar bracket */}
      {!bracketGenerado && rondas.length === 0 && (
        <div className="themed-card rounded-2xl p-5 border">
          <h2 className="font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
            Generar bracket eliminatorio
          </h2>
          <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
            {esEliminacionDirecta
              ? `Entran las ${parejas.length} parejas inscriptas; si no son potencia de 2, algunas pasan directo (bye)`
              : `Avanzan ${parejasQueAvanzan} pareja${parejasQueAvanzan !== 1 ? "s" : ""} de cada grupo`}
          </p>
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setModoGeneracion("automatico")}
              className={`flex-1 px-4 py-2 rounded-xl text-sm font-semibold transition ${modoGeneracion === "automatico" ? "bg-green-600 text-white" : "bg-[var(--bg-card)] text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-card)]"}`}
            >
              {esEliminacionDirecta ? "Automático (sorteo)" : "Automático (cruzado)"}
            </button>
            <button
              onClick={() => setModoGeneracion("manual")}
              className={`flex-1 px-4 py-2 rounded-xl text-sm font-semibold transition ${modoGeneracion === "manual" ? "bg-green-600 text-white" : "bg-[var(--bg-card)] text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-card)]"}`}
            >
              Manual
            </button>
          </div>
          {modoGeneracion === "automatico" && (
            <button
              onClick={generarBracketAutomatico}
              className="w-full bg-green-600 text-white font-semibold py-2 rounded-xl hover:bg-green-700 transition"
            >
              {esEliminacionDirecta ? "Sortear cruces" : "Generar cruces automáticos"}
            </button>
          )}
          {modoGeneracion === "manual" && (
            <ManualBracketBuilder
              key={clasificados.length}
              clasificados={clasificados}
              onConfirm={(llaves) => setRondas(avanzarGanadores(generarRondas(llaves)))}
            />
          )}
        </div>
      )}

      {/* Rondas */}
      {rondas.length > 0 && (
        <div className="flex flex-col gap-4">
          {!bracketGenerado && (
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setRondas([])}
                className="px-3 py-1 rounded-lg text-sm font-semibold bg-[var(--bg-card)] text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-card)] transition"
              >
                Descartar
              </button>
              <button
                onClick={confirmarBracket}
                className="px-3 py-1 rounded-lg text-sm font-semibold bg-green-600 text-white hover:bg-green-700 transition"
              >
                Confirmar bracket
              </button>
            </div>
          )}

          {rondas.map((ronda, ri) => (
            <div
              key={ri}
              className="themed-card rounded-2xl p-5 border"
            >
              <h2 className="font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
                {getNombreRonda(rondas.length, ri)}
              </h2>
              <div className="flex flex-col gap-2">
                {ronda.map((p, pi) => {
                  const ganador = getGanador(p.resultado);
                  return (
                    <div key={pi} className="rounded-xl px-4 py-3" style={{ backgroundColor: "var(--bg-card-hover)" }}>
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p
                            className={`text-sm font-medium ${!p.pareja1 ? "" : ganador === 1 ? "text-green-700 font-bold" : ganador === 2 ? "text-red-400" : ""}`}
                            style={!p.pareja1 ? { color: "var(--text-muted)", opacity: 0.4 } : (!ganador ? { color: "var(--text-primary)" } : undefined)}
                          >
                            {ganador === 1 && "🏆 "}
                            {getNombrePareja(p.pareja1)}
                          </p>
                          <p className="text-xs" style={{ color: "var(--text-muted)" }}>vs</p>
                          <p
                            className={`text-sm font-medium ${!p.pareja2 ? "" : ganador === 2 ? "text-green-700 font-bold" : ganador === 1 ? "text-red-400" : ""}`}
                            style={!p.pareja2 ? { color: "var(--text-muted)", opacity: 0.4 } : (!ganador ? { color: "var(--text-primary)" } : undefined)}
                          >
                            {ganador === 2 && "🏆 "}
                            {getNombrePareja(p.pareja2)}
                          </p>
                        </div>
                        <div>
                          {p.resultado ? (
                            <div className="flex flex-col items-end gap-1">
                              <div className="flex flex-wrap gap-1 justify-end">
                                {p.resultado.sets.map((s, si) => (
                                  <span
                                    key={si}
                                    className="text-sm font-bold rounded-lg px-2 py-0.5 themed-card border border-[var(--border-card)]"
                                    style={{ color: "var(--text-primary)" }}
                                  >
                                    {s.g1}-{s.g2}
                                    {s.tb1 !== undefined &&
                                      s.tb2 !== undefined && (
                                        <span className="text-xs font-normal text-orange-500 ml-1">
                                          TB {s.tb1}-{s.tb2}
                                        </span>
                                      )}
                                  </span>
                                ))}
                              </div>
                              {bracketGenerado && (
                                <button
                                  onClick={() => abrirEditarResultado(ri, pi)}
                                  className="text-xs text-green-600 hover:underline"
                                >
                                  Editar
                                </button>
                              )}
                            </div>
                          ) : p.pareja1 && p.pareja2 && bracketGenerado ? (
                            torneo.status === "en_curso" || torneo.status === "finalizado" ? (
                              <button
                                onClick={() => abrirEditarResultado(ri, pi)}
                                className="px-3 py-1 rounded-lg text-xs font-semibold text-white hover:opacity-90 transition"
                                style={{ backgroundColor: "var(--accent)" }}
                              >
                                Cargar resultado
                              </button>
                            ) : (
                              <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: "var(--bg-card-hover)", color: "var(--text-muted)" }}>
                                Iniciá el torneo primero
                              </span>
                            )
                          ) : esBye(rondas, ri, pi) ? (
                            <span className="text-xs font-semibold px-2 py-1 rounded-full"
                              style={{ backgroundColor: "var(--accent-light)", color: "var(--accent)" }}>
                              Pasa directo (bye)
                            </span>
                          ) : (
                            <span className="text-xs" style={{ color: "var(--text-muted)", opacity: 0.4 }}>—</span>
                          )}
                        </div>
                      </div>
                      {/* Horario y cancha */}
                      {bracketGenerado && p.pareja1 && p.pareja2 && (
                        <div className="flex gap-2 mt-2">
                          <input
                            type="time"
                            value={p.hora || ""}
                            onChange={(e) =>
                              actualizarPartidoBracket(
                                ri,
                                pi,
                                "hora",
                                e.target.value,
                              )
                            }
                            className="border border-[var(--border-card)] rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-green-500"
                          />
                          <input
                            type="text"
                            value={p.cancha || ""}
                            placeholder="Cancha (ej: 1)"
                            onChange={(e) =>
                              actualizarPartidoBracket(
                                ri,
                                pi,
                                "cancha",
                                e.target.value,
                              )
                            }
                            className="border border-[var(--border-card)] rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-green-500 w-28"
                          />
                          {p.hora && p.cancha && (
                            <a
                              href={`https://wa.me/?text=${encodeURIComponent(
                                `🎾 ¡Partido listo!\n\nTorneo: ${torneo.nombre}\n⏰ Hora: ${p.hora}\n📍 Cancha: ${p.cancha}\n\n${p.pareja1?.nombrePareja || "Pareja 1"}\nvs\n${p.pareja2?.nombrePareja || "Pareja 2"}\n\n¡Nos vemos en la cancha!`
                              )}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="flex items-center justify-center w-8 h-8 rounded-lg transition hover:opacity-80"
                              style={{ backgroundColor: "#25d366" }}
                              title="Enviar por WhatsApp"
                            >
                              <span className="text-white text-xs font-bold">W</span>
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal cargar resultado */}
      {editandoResultado && partido && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="themed-card rounded-2xl p-6 w-full max-w-sm mx-4">
            <h3 className="font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
              Cargar resultado
            </h3>
            {partido.resultado && (
              <p className="text-xs mb-2 rounded-lg px-3 py-2" style={{ color: "var(--text-muted)", backgroundColor: "var(--bg-card-hover)" }}>
                Editar un resultado no vuelve a otorgar puntos.
              </p>
            )}
            <div className="mb-4 text-sm">
              <p className="font-medium" style={{ color: "var(--text-primary)" }}>
                {getNombrePareja(partido.pareja1)}
              </p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>vs</p>
              <p className="font-medium" style={{ color: "var(--text-primary)" }}>
                {getNombrePareja(partido.pareja2)}
              </p>
            </div>

            {errorModal && (
              <div className="rounded-lg px-3 py-2 mb-3 text-xs text-red-600 border"
                style={{ backgroundColor: "rgba(239,68,68,0.08)", borderColor: "rgba(239,68,68,0.2)" }}>
                {errorModal}
              </div>
            )}

            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <span className="w-12"></span>
                <span className="w-16 text-xs text-center text-green-600 font-semibold truncate">
                  {partido.pareja1?.jugador1?.split(" ").pop() || "P1"}
                </span>
                <span></span>
                <span className="w-16 text-xs text-center text-green-600 font-semibold truncate">
                  {partido.pareja2?.jugador1?.split(" ").pop() || "P2"}
                </span>
              </div>
              {setsInput.slice(0, setsVisibles()).map((set, si) => (
                <div key={si}>
                  <div className="flex items-center gap-3">
                    <span className="text-sm w-12" style={{ color: "var(--text-muted)" }}>
                      Set {si + 1}
                    </span>
                    <input
                      type="number"
                      min="0"
                      value={set.g1}
                      onChange={(e) => {
                        const n = [...setsInput];
                        n[si] = { ...n[si], g1: Number(e.target.value) };
                        setSetsInput(n);
                      }}
                      className="w-16 border border-[var(--border-card)] rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                    <span style={{ color: "var(--text-muted)" }}>-</span>
                    <input
                      type="number"
                      min="0"
                      value={set.g2}
                      onChange={(e) => {
                        const n = [...setsInput];
                        n[si] = { ...n[si], g2: Number(e.target.value) };
                        setSetsInput(n);
                      }}
                      className="w-16 border border-[var(--border-card)] rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                  <div className="ml-12 mt-1">
                    <button
                      type="button"
                      onClick={() => {
                        const n = [...tiebreakInput];
                        n[si] = {
                          ...n[si],
                          activo: !n[si].activo,
                          tb1: 0,
                          tb2: 0,
                        };
                        setTiebreakInput(n);
                      }}
                      className={`text-xs font-semibold transition ${tiebreakInput[si]?.activo ? "text-orange-600" : ""}`}
                      style={!tiebreakInput[si]?.activo ? { color: "var(--text-muted)" } : undefined}
                    >
                      {tiebreakInput[si]?.activo
                        ? "✓ Tie break"
                        : "+ Tie break"}
                    </button>
                    {tiebreakInput[si]?.activo && (
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-orange-500 w-12">TB</span>
                        <input
                          type="number"
                          min="0"
                          value={tiebreakInput[si].tb1}
                          onChange={(e) => {
                            const n = [...tiebreakInput];
                            n[si] = { ...n[si], tb1: Number(e.target.value) };
                            setTiebreakInput(n);
                          }}
                          className="w-16 border border-orange-200 rounded-lg px-3 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-orange-400"
                        />
                        <span style={{ color: "var(--text-muted)" }}>-</span>
                        <input
                          type="number"
                          min="0"
                          value={tiebreakInput[si].tb2}
                          onChange={(e) => {
                            const n = [...tiebreakInput];
                            n[si] = { ...n[si], tb2: Number(e.target.value) };
                            setTiebreakInput(n);
                          }}
                          className="w-16 border border-orange-200 rounded-lg px-3 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-orange-400"
                        />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-2 mt-4">
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setEditandoResultado(null);
                    setSetsInput([]);
                    setTiebreakInput([]);
                    setErrorModal("");
                  }}
                  className="flex-1 px-4 py-2 rounded-xl text-sm font-semibold bg-[var(--bg-card)] text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-card)] transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={guardarResultado}
                  className="flex-1 px-4 py-2 rounded-xl text-sm font-semibold bg-green-600 text-white hover:bg-green-700 transition"
                >
                  Guardar
                </button>
              </div>
              {(() => {
                if (!editandoResultado) return null;
                const { rondaIdx, partidoIdx } = editandoResultado;
                const partidosRonda = rondas[rondaIdx] || [];
                const siguienteIdx = partidosRonda.findIndex((p, i) => i > partidoIdx && p.pareja1 && p.pareja2 && !p.resultado);
                let siguienteRonda = null;
                if (siguienteIdx === -1) {
                  for (let ri = rondaIdx + 1; ri < rondas.length; ri++) {
                    const pi = (rondas[ri] || []).findIndex(p => p.pareja1 && p.pareja2 && !p.resultado);
                    if (pi !== -1) { siguienteRonda = { rondaIdx: ri, partidoIdx: pi }; break; }
                  }
                }
                const haySiguiente = siguienteIdx !== -1 || siguienteRonda;
                if (!haySiguiente) return null;
                return (
                  <button
                    onClick={async () => {
                      const err = validarResultado();
                      if (err) { setErrorModal(err); return; }
                      await guardarResultado(true);
                      if (siguienteIdx !== -1) {
                        abrirEditarResultado(rondaIdx, siguienteIdx);
                      } else if (siguienteRonda) {
                        abrirEditarResultado(siguienteRonda.rondaIdx, siguienteRonda.partidoIdx);
                      }
                    }}
                    className="px-4 py-2 rounded-xl text-sm font-semibold transition border-2"
                    style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
                  >
                    Guardar y cargar siguiente →
                  </button>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
