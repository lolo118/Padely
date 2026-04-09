import { useEffect, useState } from "react";
import {
  getParejas,
  getGrupos,
  guardarGrupos,
  actualizarGrupo,
} from "../../services/torneoService";

function generarPartidos(parejas) {
  const partidos = [];
  for (let i = 0; i < parejas.length; i++) {
    for (let j = i + 1; j < parejas.length; j++) {
      partidos.push({
        pareja1: parejas[i],
        pareja2: parejas[j],
        resultado: null,
        hora: "",
        cancha: "",
      });
    }
  }
  return partidos;
}

function getGanador(resultado) {
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

function calcularTabla(grupo) {
  const stats = {};
  grupo.parejas.forEach((p) => {
    stats[p.id] = {
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

function ManualGroupBuilder({ parejas, parejasXGrupo, onConfirm }) {
  const cantGrupos = Math.ceil(parejas.length / parejasXGrupo);
  const [gruposManuales, setGruposManuales] = useState(
    Array.from({ length: cantGrupos }, (_, i) => ({
      nombre: `Grupo ${String.fromCharCode(65 + i)}`,
      parejas: [],
    })),
  );

  const asignadasIds = new Set(
    gruposManuales.flatMap((g) => g.parejas.map((p) => p.id)),
  );
  const sinAsignar = parejas.filter((p) => !asignadasIds.has(p.id));

  const asignar = (pareja, grupoIdx) => {
    if (gruposManuales[grupoIdx].parejas.length >= parejasXGrupo) return;
    setGruposManuales(
      gruposManuales.map((g, i) =>
        i === grupoIdx ? { ...g, parejas: [...g.parejas, pareja] } : g,
      ),
    );
  };

  const desasignar = (pareja, grupoIdx) => {
    setGruposManuales(
      gruposManuales.map((g, i) =>
        i === grupoIdx
          ? { ...g, parejas: g.parejas.filter((p) => p.id !== pareja.id) }
          : g,
      ),
    );
  };

  return (
    <div className="flex flex-col gap-3 mt-2">
      {sinAsignar.length > 0 && (
        <div>
          <p className="text-sm font-semibold mb-2" style={{ color: "var(--text-muted)" }}>
            Parejas sin asignar ({sinAsignar.length})
          </p>
          <div className="flex flex-col gap-1">
            {sinAsignar.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-2"
              >
                <span className="text-sm" style={{ color: "var(--text-primary)" }}>
                  {p.nombrePareja || `${p.jugador1} / ${p.jugador2}`}
                </span>
                <div className="flex gap-1">
                  {gruposManuales.map((g, gi) => (
                    <button
                      key={gi}
                      onClick={() => asignar(p, gi)}
                      disabled={g.parejas.length >= parejasXGrupo}
                      className="px-2 py-1 rounded-lg text-xs font-semibold bg-green-100 text-green-700 hover:bg-green-200 transition disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      → {g.nombre.replace("Grupo ", "")}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {gruposManuales.map((g, gi) => (
        <div key={gi}>
          <p className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
            {g.nombre} ({g.parejas.length}/{parejasXGrupo})
          </p>
          {g.parejas.length === 0 ? (
            <div className="text-sm rounded-lg px-3 py-2 text-center" style={{ color: "var(--text-muted)", opacity: 0.4, backgroundColor: "var(--bg-card-hover)" }}>
              Sin parejas asignadas
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {g.parejas.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-lg px-3 py-2"
                  style={{ backgroundColor: "var(--bg-card-hover)" }}
                >
                  <span className="text-sm" style={{ color: "var(--text-primary)" }}>
                    {p.nombrePareja || `${p.jugador1} / ${p.jugador2}`}
                  </span>
                  <button
                    onClick={() => desasignar(p, gi)}
                    className="text-xs text-red-400 hover:text-red-600 font-semibold"
                  >
                    Quitar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      <button
        onClick={() => onConfirm(gruposManuales)}
        disabled={sinAsignar.length > 0}
        className="bg-green-600 text-white font-semibold py-2 rounded-xl hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {sinAsignar.length === 0
          ? "Generar grupos manuales"
          : `Faltan ${sinAsignar.length} pareja${sinAsignar.length !== 1 ? "s" : ""} por asignar`}
      </button>
    </div>
  );
}

export default function TabGrupos({ torneoId, torneo }) {
  const [parejas, setParejas] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [parejasXGrupo, setParejasXGrupo] = useState(3);
  const [modoGeneracion, setModoGeneracion] = useState("aleatorio");
  const [gruposGenerados, setGruposGenerados] = useState(false);
  const [editandoResultado, setEditandoResultado] = useState(null);
  const [setsInput, setSetsInput] = useState([]);
  const [tiebreakInput, setTiebreakInput] = useState([]);
  const [errorModal, setErrorModal] = useState("");

  useEffect(() => {
    const cargar = async () => {
      try {
        const [parejasData, gruposData] = await Promise.all([
          getParejas(torneoId),
          getGrupos(torneoId),
        ]);
        setParejas(parejasData);
        if (gruposData.length > 0) {
          setGrupos(gruposData.sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "")));
          setGruposGenerados(true);
        }
      } catch (err) {
        console.error("Error al cargar datos:", err);
      }
      setLoading(false);
    };
    cargar();
  }, [torneoId]);

  const generarGruposAleatorio = () => {
    const shuffled = [...parejas].sort(() => Math.random() - 0.5);
    const nuevosGrupos = [];
    let idx = 0,
      grupoNum = 1;
    while (idx < shuffled.length) {
      const pg = shuffled.slice(idx, idx + parejasXGrupo);
      nuevosGrupos.push({
        nombre: `Grupo ${String.fromCharCode(64 + grupoNum)}`,
        parejas: pg,
        partidos: generarPartidos(pg),
      });
      idx += parejasXGrupo;
      grupoNum++;
    }
    setGrupos(nuevosGrupos);
  };

  const guardarGruposEnFirebase = async () => {
    try {
      const ids = await guardarGrupos(torneoId, grupos);
      setGrupos(grupos.map((g, i) => ({ ...g, id: ids[i] })));
      setGruposGenerados(true);
    } catch (err) {
      console.error("Error al guardar grupos:", err);
    }
  };

  const actualizarPartidoInfo = async (grupoIdx, partidoIdx, campo, valor) => {
    const nuevosGrupos = [...grupos];
    const grupo = { ...nuevosGrupos[grupoIdx] };
    const partidos = [...grupo.partidos];
    partidos[partidoIdx] = { ...partidos[partidoIdx], [campo]: valor };
    grupo.partidos = partidos;
    nuevosGrupos[grupoIdx] = grupo;
    setGrupos(nuevosGrupos);
    if (grupo.id) {
      try {
        await actualizarGrupo(torneoId, grupo.id, { partidos });
      } catch (err) {
        console.error("Error al actualizar partido:", err);
      }
    }
  };

  const abrirEditarResultado = (grupoIdx, partidoIdx) => {
    const partido = grupos[grupoIdx].partidos[partidoIdx];
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
    setEditandoResultado({ grupoIdx, partidoIdx });
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

  const guardarResultado = async () => {
    const err = validarResultado();
    if (err) {
      setErrorModal(err);
      return;
    }

    const { grupoIdx, partidoIdx } = editandoResultado;
    const cantSets = Number(torneo.sets) || 1;
    const setsParaGanar = Math.ceil(cantSets / 2);

    // Solo guardar sets necesarios
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

    const nuevosGrupos = [...grupos];
    const grupo = { ...nuevosGrupos[grupoIdx] };
    const partidos = [...grupo.partidos];
    partidos[partidoIdx] = {
      ...partidos[partidoIdx],
      resultado: { sets: setsFinales },
    };
    grupo.partidos = partidos;
    nuevosGrupos[grupoIdx] = grupo;

    if (grupo.id) {
      try {
        await actualizarGrupo(torneoId, grupo.id, { partidos });
      } catch (e) {
        console.error("Error al guardar resultado:", e);
      }
    }

    setGrupos(nuevosGrupos);

    // Actualizar puntos de los jugadores
    try {
      const { actualizarPuntosPartido } = await import("../../services/torneoService");
      const p1 = partidos[partidoIdx].pareja1;
      const p2 = partidos[partidoIdx].pareja2;
      const categoriaTorneo = torneo.categoriasConfig ? Object.values(torneo.categoriasConfig).flat()[0] || "8va" : "8va";
      let setsP1Final = 0, setsP2Final = 0;
      setsFinales.forEach((s) => {
        let g1 = s.g1, g2 = s.g2;
        if (s.tb1 !== undefined && s.tb2 !== undefined) {
          if (s.tb1 > s.tb2) g1++; else if (s.tb2 > s.tb1) g2++;
        }
        if (g1 > g2) setsP1Final++; else if (g2 > g1) setsP2Final++;
      });
      const ganoP1 = setsP1Final > setsP2Final;
      if (p1.jugador1Uid) await actualizarPuntosPartido(p1.jugador1Uid, ganoP1 ? setsP1Final : setsP2Final, ganoP1, categoriaTorneo);
      if (p1.jugador2Uid) await actualizarPuntosPartido(p1.jugador2Uid, ganoP1 ? setsP1Final : setsP2Final, ganoP1, categoriaTorneo);
      if (p2.jugador1Uid) await actualizarPuntosPartido(p2.jugador1Uid, ganoP1 ? setsP2Final : setsP1Final, !ganoP1, categoriaTorneo);
      if (p2.jugador2Uid) await actualizarPuntosPartido(p2.jugador2Uid, ganoP1 ? setsP2Final : setsP1Final, !ganoP1, categoriaTorneo);
    } catch (err) { console.error("Error actualizando puntos:", err); }

    setEditandoResultado(null);
    setSetsInput([]);
    setTiebreakInput([]);
    setErrorModal("");
  };

  // Calcular sets necesarios para mostrar en el modal
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

  if (loading)
    return (
      <div className="text-center py-12" style={{ color: "var(--text-muted)" }}>Cargando grupos...</div>
    );

  if (parejas.length < 3) {
    return (
      <div className="themed-card rounded-2xl p-5 border text-center py-12">
        <div className="text-4xl mb-3">👥</div>
        <p className="font-medium" style={{ color: "var(--text-muted)" }}>
          Necesitás al menos 3 parejas inscriptas
        </p>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
          Actualmente hay {parejas.length} pareja
          {parejas.length !== 1 ? "s" : ""}
        </p>
      </div>
    );
  }

  const partido = editandoResultado
    ? grupos[editandoResultado.grupoIdx].partidos[editandoResultado.partidoIdx]
    : null;

  const parejasQueAvanzan = Number(torneo.parejasQueAvanzan) || 2;

  return (
    <div className="flex flex-col gap-4">
      {/* Regenerar arriba */}
      {gruposGenerados && (
        <div className="flex justify-end">
          {(() => {
            const tieneResultados = grupos.some((g) => (g.partidos || []).some((p) => p.resultado));
            return tieneResultados ? (
              <span className="px-3 py-1 rounded-lg text-xs font-semibold" style={{ color: "var(--text-muted)", backgroundColor: "var(--bg-card-hover)" }}>
                No podés regenerar grupos después de cargar resultados
              </span>
            ) : (
              <button
                onClick={() => {
                  if (window.confirm("¿Regenerar grupos? Se perderán los grupos actuales.")) {
                    setGruposGenerados(false);
                    setGrupos([]);
                  }
                }}
                className="px-3 py-1 rounded-lg text-xs font-semibold text-red-500 bg-red-50 hover:bg-red-100 transition"
              >
                Regenerar grupos desde cero
              </button>
            );
          })()}
        </div>
      )}

      {/* Tip */}
      {gruposGenerados && (
        <div className="text-xs text-blue-500 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
          💡 Asigná horario y cancha a cada partido tocando los campos debajo de
          cada enfrentamiento. Cargá los resultados con el botón "Cargar
          resultado".
        </div>
      )}

      {!gruposGenerados && (
        <div className="themed-card rounded-2xl p-5 border">
          <h2 className="font-semibold mb-3" style={{ color: "var(--text-primary)" }}>Generar grupos</h2>
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-sm block mb-1" style={{ color: "var(--text-muted)" }}>
                Parejas por grupo
              </label>
              <select
                value={parejasXGrupo}
                onChange={(e) => setParejasXGrupo(Number(e.target.value))}
                className="w-full border border-[var(--border-card)] rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                {(modoGeneracion === "aleatorio" ? [2, 4, 6] : [2, 3, 4, 5, 6]).map((n) => (
                  <option key={n} value={n}>
                    {n} parejas por grupo ({Math.ceil(parejas.length / n)}{" "}
                    grupos)
                  </option>
                ))}
              </select>
              {modoGeneracion === "aleatorio" && parejas.length % parejasXGrupo !== 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  ⚠ {parejas.length} parejas no se dividen exactamente en grupos de {parejasXGrupo}. El último grupo tendrá {parejas.length % parejasXGrupo} pareja{parejas.length % parejasXGrupo !== 1 ? "s" : ""}.
                </p>
              )}
            </div>
            <div>
              <label className="text-sm block mb-1" style={{ color: "var(--text-muted)" }}>Modo</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setModoGeneracion("aleatorio")}
                  className={`flex-1 px-4 py-2 rounded-xl text-sm font-semibold transition ${modoGeneracion === "aleatorio" ? "bg-green-600 text-white" : "bg-[var(--bg-card)] text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-card)]"}`}
                >
                  Aleatorio
                </button>
                <button
                  onClick={() => setModoGeneracion("manual")}
                  className={`flex-1 px-4 py-2 rounded-xl text-sm font-semibold transition ${modoGeneracion === "manual" ? "bg-green-600 text-white" : "bg-[var(--bg-card)] text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-card)]"}`}
                >
                  Manual
                </button>
              </div>
            </div>
            {modoGeneracion === "aleatorio" && (
              <button
                onClick={generarGruposAleatorio}
                className="bg-green-600 text-white font-semibold py-2 rounded-xl hover:bg-green-700 transition"
              >
                Generar grupos aleatorios
              </button>
            )}
            {modoGeneracion === "manual" && (
              <ManualGroupBuilder
                parejas={parejas}
                parejasXGrupo={parejasXGrupo}
                onConfirm={(gm) =>
                  setGrupos(
                    gm.map((g) => ({
                      ...g,
                      partidos: generarPartidos(g.parejas),
                    })),
                  )
                }
              />
            )}
          </div>
        </div>
      )}

      {grupos.length > 0 && !gruposGenerados && (
        <div className="themed-card rounded-2xl p-5 border">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>
              Vista previa ({grupos.length} grupos)
            </h2>
            <div className="flex gap-2">
              {modoGeneracion === "aleatorio" && (
                <button
                  onClick={generarGruposAleatorio}
                  className="px-3 py-1 rounded-lg text-sm font-semibold bg-[var(--bg-card)] text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-card)] transition"
                >
                  Regenerar
                </button>
              )}
              <button
                onClick={guardarGruposEnFirebase}
                className="px-3 py-1 rounded-lg text-sm font-semibold bg-green-600 text-white hover:bg-green-700 transition"
              >
                Confirmar grupos
              </button>
            </div>
          </div>
          {grupos.map((g, gi) => (
            <div key={gi} className="mb-3 last:mb-0">
              <p className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
                {g.nombre}
              </p>
              <div className="flex flex-col gap-1">
                {g.parejas.map((p, pi) => (
                  <div
                    key={pi}
                    className="text-sm rounded-lg px-3 py-2"
                    style={{ color: "var(--text-primary)", backgroundColor: "var(--bg-card-hover)" }}
                  >
                    {p.nombrePareja || `${p.jugador1} / ${p.jugador2}`}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Grupos confirmados */}
      {gruposGenerados &&
        grupos.map((grupo, gi) => {
          const tabla = calcularTabla(grupo);
          return (
            <div
              key={grupo.id || gi}
              className="themed-card rounded-2xl p-5 border"
            >
              <h2 className="font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
                {grupo.nombre}
              </h2>
              <div className="overflow-x-auto mb-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs border-b border-[var(--border-card)]" style={{ color: "var(--text-muted)" }}>
                      <th className="text-left py-2 pr-2">#</th>
                      <th className="text-left py-2">Pareja</th>
                      <th className="text-center py-2">PJ</th>
                      <th className="text-center py-2">PG</th>
                      <th className="text-center py-2">PP</th>
                      <th className="text-center py-2">SF</th>
                      <th className="text-center py-2">SC</th>
                      <th className="text-center py-2">GF</th>
                      <th className="text-center py-2">GC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tabla.map((row, ri) => (
                      <tr
                        key={row.id}
                        className={`border-b border-[var(--border-card)] ${ri < parejasQueAvanzan ? "bg-green-50" : ""}`}
                      >
                        <td className="py-2 pr-2 font-bold" style={{ color: "var(--text-muted)" }}>
                          {ri + 1}
                        </td>
                        <td className="py-2 font-medium" style={{ color: "var(--text-primary)" }}>
                          {row.nombre}
                        </td>
                        <td className="text-center py-2">{row.pj}</td>
                        <td className="text-center py-2 font-semibold text-green-600">
                          {row.pg}
                        </td>
                        <td className="text-center py-2 text-red-400">
                          {row.pp}
                        </td>
                        <td className="text-center py-2">{row.sf}</td>
                        <td className="text-center py-2">{row.sc}</td>
                        <td className="text-center py-2">{row.gf}</td>
                        <td className="text-center py-2">{row.gc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h3 className="text-sm font-semibold mb-2" style={{ color: "var(--text-muted)" }}>
                Partidos
              </h3>
              <div className="flex flex-col gap-2">
                {(grupo.partidos || []).map((p, pi) => {
                  const ganador = getGanador(p.resultado);
                  return (
                    <div key={pi} className="rounded-xl px-4 py-3" style={{ backgroundColor: "var(--bg-card-hover)" }}>
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p
                            className={`text-sm font-medium ${ganador === 1 ? "text-green-700 font-bold" : ganador === 2 ? "text-red-400" : ""}`}
                          style={!ganador ? { color: "var(--text-primary)" } : undefined}
                          >
                            {ganador === 1 && "🏆 "}
                            {p.pareja1.nombrePareja ||
                              `${p.pareja1.jugador1} / ${p.pareja1.jugador2}`}
                          </p>
                          <p className="text-xs" style={{ color: "var(--text-muted)" }}>vs</p>
                          <p
                            className={`text-sm font-medium ${ganador === 2 ? "text-green-700 font-bold" : ganador === 1 ? "text-red-400" : ""}`}
                            style={!ganador ? { color: "var(--text-primary)" } : undefined}
                          >
                            {ganador === 2 && "🏆 "}
                            {p.pareja2.nombrePareja ||
                              `${p.pareja2.jugador1} / ${p.pareja2.jugador2}`}
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
                              <button
                                onClick={() => abrirEditarResultado(gi, pi)}
                                className="text-xs text-green-600 hover:underline"
                              >
                                Editar
                              </button>
                            </div>
                          ) : torneo.status === "en_curso" || torneo.status === "finalizado" ? (
                            <button onClick={() => abrirEditarResultado(gi, pi)}
                              className="px-3 py-1 rounded-lg text-xs font-semibold text-white hover:opacity-90 transition"
                              style={{ backgroundColor: "var(--accent)" }}>
                              Cargar resultado
                            </button>
                          ) : (
                            <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: "var(--bg-card-hover)", color: "var(--text-muted)" }}>
                              Iniciá el torneo primero
                            </span>
                          )}
                        </div>
                      </div>
                      {/* Horario y cancha */}
                      <div className="flex gap-2 mt-2">
                        <input
                          type="time"
                          value={p.hora || ""}
                          onChange={(e) =>
                            actualizarPartidoInfo(
                              gi,
                              pi,
                              "hora",
                              e.target.value,
                            )
                          }
                          className="border border-[var(--border-card)] rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-green-500"
                          placeholder="Hora"
                        />
                        <input
                          type="text"
                          value={p.cancha || ""}
                          onChange={(e) =>
                            actualizarPartidoInfo(
                              gi,
                              pi,
                              "cancha",
                              e.target.value,
                            )
                          }
                          placeholder="Cancha (ej: 1)"
                          className="border border-[var(--border-card)] rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-green-500 w-28"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

      {/* Modal cargar resultado */}
      {editandoResultado && partido && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="themed-card rounded-2xl p-6 w-full max-w-sm mx-4">
            <h3 className="font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
              Cargar resultado
            </h3>
            <div className="mb-4 text-sm">
              <p className="font-medium" style={{ color: "var(--text-primary)" }}>
                {partido.pareja1.nombrePareja ||
                  `${partido.pareja1.jugador1} / ${partido.pareja1.jugador2}`}
              </p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>vs</p>
              <p className="font-medium" style={{ color: "var(--text-primary)" }}>
                {partido.pareja2.nombrePareja ||
                  `${partido.pareja2.jugador1} / ${partido.pareja2.jugador2}`}
              </p>
            </div>

            {errorModal && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3 text-xs text-red-600">
                {errorModal}
              </div>
            )}

            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <span className="w-12"></span>
                <span className="w-16 text-xs text-center text-green-600 font-semibold truncate">
                  {partido.pareja1.jugador1?.split(" ").pop() ||
                    partido.pareja1.jugador1}
                </span>
                <span></span>
                <span className="w-16 text-xs text-center text-green-600 font-semibold truncate">
                  {partido.pareja2.jugador1?.split(" ").pop() ||
                    partido.pareja2.jugador1}
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
            <div className="flex gap-2 mt-4">
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
          </div>
        </div>
      )}
    </div>
  );
}
