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
      });
    }
  }
  return partidos;
}

function calcularTabla(grupo) {
  const stats = {};
  grupo.parejas.forEach((p) => {
    stats[p.id] = {
      id: p.id,
      nombre: `${p.jugador1} / ${p.jugador2}`,
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
    const { pareja1, pareja2, resultado } = m;
    const s1 = stats[pareja1.id];
    const s2 = stats[pareja2.id];
    if (!s1 || !s2) return;

    let setsP1 = 0,
      setsP2 = 0,
      gamesP1 = 0,
      gamesP2 = 0;

    resultado.sets.forEach((set) => {
      gamesP1 += set.g1;
      gamesP2 += set.g2;
      if (set.g1 > set.g2) setsP1++;
      else if (set.g2 > set.g1) setsP2++;
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
    const diffSetsA = a.sf - a.sc;
    const diffSetsB = b.sf - b.sc;
    if (diffSetsB !== diffSetsA) return diffSetsB - diffSetsA;
    const diffGamesA = a.gf - a.gc;
    const diffGamesB = b.gf - b.gc;
    return diffGamesB - diffGamesA;
  });
}

// ✅ Versión corregida: sin useEffect, sin estado sinAsignar duplicado
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

  const todasAsignadas = sinAsignar.length === 0;

  return (
    <div className="flex flex-col gap-3 mt-2">
      {sinAsignar.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-gray-500 mb-2">
            Parejas sin asignar ({sinAsignar.length})
          </p>
          <div className="flex flex-col gap-1">
            {sinAsignar.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-2"
              >
                <span className="text-sm text-gray-700">
                  {p.jugador1} / {p.jugador2}
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
          <p className="text-sm font-semibold text-gray-600 mb-1">
            {g.nombre} ({g.parejas.length}/{parejasXGrupo})
          </p>
          {g.parejas.length === 0 ? (
            <div className="text-sm text-gray-400 bg-gray-50 rounded-lg px-3 py-2 text-center">
              Sin parejas asignadas
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {g.parejas.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2"
                >
                  <span className="text-sm text-gray-700">
                    {p.jugador1} / {p.jugador2}
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
        disabled={!todasAsignadas}
        className="bg-green-600 text-white font-semibold py-2 rounded-xl hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {todasAsignadas
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

  useEffect(() => {
    const cargar = async () => {
      try {
        const [parejasData, gruposData] = await Promise.all([
          getParejas(torneoId),
          getGrupos(torneoId),
        ]);
        setParejas(parejasData);
        if (gruposData.length > 0) {
          setGrupos(gruposData);
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
    let idx = 0;
    let grupoNum = 1;

    while (idx < shuffled.length) {
      const parejasGrupo = shuffled.slice(idx, idx + parejasXGrupo);
      nuevosGrupos.push({
        nombre: `Grupo ${String.fromCharCode(64 + grupoNum)}`,
        parejas: parejasGrupo,
        partidos: generarPartidos(parejasGrupo),
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

  const abrirEditarResultado = (grupoIdx, partidoIdx) => {
    const partido = grupos[grupoIdx].partidos[partidoIdx];
    const cantSets = torneo.sets || 1;
    const setsExistentes = partido.resultado?.sets || [];
    const sets = [];
    for (let i = 0; i < cantSets; i++) {
      sets.push({
        g1: setsExistentes[i]?.g1 || 0,
        g2: setsExistentes[i]?.g2 || 0,
      });
    }
    setSetsInput(sets);
    setEditandoResultado({ grupoIdx, partidoIdx });
  };

  const guardarResultado = async () => {
    const { grupoIdx, partidoIdx } = editandoResultado;
    const nuevosGrupos = [...grupos];
    const grupo = { ...nuevosGrupos[grupoIdx] };
    const partidos = [...grupo.partidos];
    partidos[partidoIdx] = {
      ...partidos[partidoIdx],
      resultado: { sets: setsInput },
    };
    grupo.partidos = partidos;
    nuevosGrupos[grupoIdx] = grupo;

    if (grupo.id) {
      try {
        await actualizarGrupo(torneoId, grupo.id, {
          partidos: partidos,
        });
      } catch (err) {
        console.error("Error al guardar resultado:", err);
      }
    }

    setGrupos(nuevosGrupos);
    setEditandoResultado(null);
    setSetsInput([]);
  };

  if (loading) {
    return (
      <div className="text-center text-gray-400 py-12">Cargando grupos...</div>
    );
  }

  if (parejas.length < 3) {
    return (
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 text-center py-12">
        <div className="text-4xl mb-3">👥</div>
        <p className="text-gray-500 font-medium">
          Necesitás al menos 3 parejas inscriptas
        </p>
        <p className="text-gray-400 text-sm mt-1">
          Actualmente hay {parejas.length} pareja
          {parejas.length !== 1 ? "s" : ""}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Configuración de grupos - solo si no se generaron todavía */}
      {!gruposGenerados && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <h2 className="font-semibold text-gray-700 mb-3">Generar grupos</h2>

          <div className="flex flex-col gap-3">
            <div>
              <label className="text-sm text-gray-500 block mb-1">
                Parejas por grupo
              </label>
              <select
                value={parejasXGrupo}
                onChange={(e) => setParejasXGrupo(Number(e.target.value))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                {[2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n} parejas por grupo ({Math.ceil(parejas.length / n)}{" "}
                    grupos)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm text-gray-500 block mb-1">Modo</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setModoGeneracion("aleatorio")}
                  className={`flex-1 px-4 py-2 rounded-xl text-sm font-semibold transition ${
                    modoGeneracion === "aleatorio"
                      ? "bg-green-600 text-white"
                      : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}
                >
                  Aleatorio
                </button>
                <button
                  onClick={() => setModoGeneracion("manual")}
                  className={`flex-1 px-4 py-2 rounded-xl text-sm font-semibold transition ${
                    modoGeneracion === "manual"
                      ? "bg-green-600 text-white"
                      : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}
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
                onConfirm={(gruposManuales) => {
                  const gruposConPartidos = gruposManuales.map((g) => ({
                    ...g,
                    partidos: generarPartidos(g.parejas),
                  }));
                  setGrupos(gruposConPartidos);
                }}
              />
            )}
          </div>
        </div>
      )}

      {/* Preview de grupos antes de guardar */}
      {grupos.length > 0 && !gruposGenerados && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-700">
              Vista previa ({grupos.length} grupos)
            </h2>
            <div className="flex gap-2">
              {modoGeneracion === "aleatorio" && (
                <button
                  onClick={generarGruposAleatorio}
                  className="px-3 py-1 rounded-lg text-sm font-semibold bg-gray-100 text-gray-500 hover:bg-gray-200 transition"
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
              <p className="text-sm font-semibold text-gray-600 mb-1">
                {g.nombre}
              </p>
              <div className="flex flex-col gap-1">
                {g.parejas.map((p, pi) => (
                  <div
                    key={pi}
                    className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2"
                  >
                    {p.jugador1} / {p.jugador2}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Grupos confirmados con tablas y partidos */}
      {gruposGenerados &&
        grupos.map((grupo, gi) => {
          const tabla = calcularTabla(grupo);
          return (
            <div
              key={grupo.id || gi}
              className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100"
            >
              <h2 className="font-semibold text-gray-700 mb-3">
                {grupo.nombre}
              </h2>

              {/* Tabla de posiciones */}
              <div className="overflow-x-auto mb-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-400 text-xs border-b border-gray-100">
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
                        className={`border-b border-gray-50 ${
                          ri < 2 ? "bg-green-50" : ""
                        }`}
                      >
                        <td className="py-2 pr-2 font-bold text-gray-400">
                          {ri + 1}
                        </td>
                        <td className="py-2 text-gray-700 font-medium">
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

              {/* Partidos */}
              <h3 className="text-sm font-semibold text-gray-500 mb-2">
                Partidos
              </h3>
              <div className="flex flex-col gap-2">
                {(grupo.partidos || []).map((partido, pi) => (
                  <div
                    key={pi}
                    className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-700">
                        {partido.pareja1.jugador1} / {partido.pareja1.jugador2}
                      </p>
                      <p className="text-xs text-gray-400">vs</p>
                      <p className="text-sm font-medium text-gray-700">
                        {partido.pareja2.jugador1} / {partido.pareja2.jugador2}
                      </p>
                    </div>
                    <div>
                      {partido.resultado ? (
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-gray-700">
                            {partido.resultado.sets
                              .map((s) => `${s.g1}-${s.g2}`)
                              .join(" / ")}
                          </span>
                          <button
                            onClick={() => abrirEditarResultado(gi, pi)}
                            className="text-xs text-green-600 hover:underline"
                          >
                            Editar
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => abrirEditarResultado(gi, pi)}
                          className="px-3 py-1 rounded-lg text-xs font-semibold bg-green-600 text-white hover:bg-green-700 transition"
                        >
                          Cargar resultado
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

      {/* Modal cargar resultado */}
      {editandoResultado && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm mx-4">
            <h3 className="font-semibold text-gray-700 mb-2">
              Cargar resultado
            </h3>
            {editandoResultado && (
              <div className="mb-4 text-sm">
                <p className="font-medium text-gray-700">
                  {
                    grupos[editandoResultado.grupoIdx].partidos[
                      editandoResultado.partidoIdx
                    ].pareja1.jugador1
                  }
                  {" / "}
                  {
                    grupos[editandoResultado.grupoIdx].partidos[
                      editandoResultado.partidoIdx
                    ].pareja1.jugador2
                  }
                </p>
                <p className="text-gray-400 text-xs">vs</p>
                <p className="font-medium text-gray-700">
                  {
                    grupos[editandoResultado.grupoIdx].partidos[
                      editandoResultado.partidoIdx
                    ].pareja2.jugador1
                  }
                  {" / "}
                  {
                    grupos[editandoResultado.grupoIdx].partidos[
                      editandoResultado.partidoIdx
                    ].pareja2.jugador2
                  }
                </p>
              </div>
            )}
            <div className="flex flex-col gap-3">
              {/* Encabezado con nombres */}
              <div className="flex items-center gap-3">
                <span className="w-12"></span>
                <span className="w-16 text-xs text-center text-green-600 font-semibold truncate">
                  {editandoResultado &&
                    grupos[editandoResultado.grupoIdx].partidos[
                      editandoResultado.partidoIdx
                    ].pareja1.jugador1}
                </span>
                <span></span>
                <span className="w-16 text-xs text-center text-green-600 font-semibold truncate">
                  {editandoResultado &&
                    grupos[editandoResultado.grupoIdx].partidos[
                      editandoResultado.partidoIdx
                    ].pareja2.jugador1}
                </span>
              </div>
              {setsInput.map((set, si) => (
                <div key={si} className="flex items-center gap-3">
                  <span className="text-sm text-gray-400 w-12">
                    Set {si + 1}
                  </span>
                  <input
                    type="number"
                    min="0"
                    value={set.g1}
                    onChange={(e) => {
                      const nuevo = [...setsInput];
                      nuevo[si] = { ...nuevo[si], g1: Number(e.target.value) };
                      setSetsInput(nuevo);
                    }}
                    className="w-16 border border-gray-200 rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <span className="text-gray-400">-</span>
                  <input
                    type="number"
                    min="0"
                    value={set.g2}
                    onChange={(e) => {
                      const nuevo = [...setsInput];
                      nuevo[si] = { ...nuevo[si], g2: Number(e.target.value) };
                      setSetsInput(nuevo);
                    }}
                    className="w-16 border border-gray-200 rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => {
                  setEditandoResultado(null);
                  setSetsInput([]);
                }}
                className="flex-1 px-4 py-2 rounded-xl text-sm font-semibold bg-gray-100 text-gray-500 hover:bg-gray-200 transition"
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

      {/* Botón para regenerar grupos */}
      {gruposGenerados && (
        <button
          onClick={() => {
            if (
              window.confirm(
                "¿Regenerar grupos? Se perderán todos los resultados cargados.",
              )
            ) {
              setGruposGenerados(false);
              setGrupos([]);
            }
          }}
          className="text-sm text-red-400 hover:text-red-600 transition text-center"
        >
          Regenerar grupos desde cero
        </button>
      )}
    </div>
  );
}
