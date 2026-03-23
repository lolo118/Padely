import { useEffect, useState } from "react";
import {
  getGrupos,
  guardarBracket,
  getBracket,
} from "../../services/torneoService";

function calcularTabla(grupo) {
  const stats = {};
  grupo.parejas.forEach((p) => {
    stats[p.id] = {
      id: p.id,
      jugador1: p.jugador1,
      jugador2: p.jugador2,
      nombrePareja: p.nombrePareja,
      nombre: p.nombrePareja || `${p.jugador1} / ${p.jugador2}`,
      pj: 0,
      pg: 0,
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
    if (setsP1 > setsP2) s1.pg++;
    else s2.pg++;
  });

  return Object.values(stats).sort((a, b) => {
    if (b.pg !== a.pg) return b.pg - a.pg;
    if (b.sf - b.sc !== a.sf - a.sc) return b.sf - b.sc - (a.sf - a.sc);
    return b.gf - b.gc - (a.gf - a.gc);
  });
}

function getNombreRonda(totalRondas, rondaIdx) {
  const faltantes = totalRondas - rondaIdx;
  if (faltantes === 1) return "Final";
  if (faltantes === 2) return "Semifinales";
  if (faltantes === 3) return "Cuartos de final";
  if (faltantes === 4) return "Octavos de final";
  if (faltantes === 5) return "16avos de final";
  return `Ronda ${rondaIdx + 1}`;
}

function getNombrePareja(p) {
  if (!p) return "Por definir";
  return p.nombrePareja || `${p.jugador1} / ${p.jugador2}`;
}

function formatResultadoBracket(resultado) {
  return resultado.sets.map((s, si) => (
    <span
      key={si}
      className="text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-lg px-2 py-0.5"
    >
      {s.g1}-{s.g2}
      {s.tb1 !== undefined && s.tb2 !== undefined && (
        <span className="text-xs font-normal text-orange-500 ml-1">
          TB {s.tb1}-{s.tb2}
        </span>
      )}
    </span>
  ));
}

function generarCrucesAutomaticos(grupos) {
  const clasificados = [];
  const tablas = grupos
    .map((g) => ({ nombre: g.nombre, tabla: calcularTabla(g) }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  tablas.forEach((g) => {
    if (g.tabla[0])
      clasificados.push({ ...g.tabla[0], posGrupo: 1, grupo: g.nombre });
    if (g.tabla[1])
      clasificados.push({ ...g.tabla[1], posGrupo: 2, grupo: g.nombre });
  });

  const primeros = clasificados.filter((c) => c.posGrupo === 1);
  const segundos = clasificados.filter((c) => c.posGrupo === 2);

  const partidos = [];
  const cantCruces = Math.min(primeros.length, segundos.length);

  for (let i = 0; i < cantCruces; i++) {
    const segundoIdx = (cantCruces - 1 - i) % segundos.length;
    partidos.push({
      pareja1: primeros[i],
      pareja2: segundos[segundoIdx],
      resultado: null,
    });
  }

  const usados = new Set(partidos.flatMap((p) => [p.pareja1.id, p.pareja2.id]));
  const sobrantes = clasificados.filter((c) => !usados.has(c.id));
  for (let i = 0; i < sobrantes.length; i += 2) {
    if (sobrantes[i + 1]) {
      partidos.push({
        pareja1: sobrantes[i],
        pareja2: sobrantes[i + 1],
        resultado: null,
      });
    }
  }

  return { clasificados, partidos };
}

function generarRondas(partidosIniciales) {
  const rondas = [partidosIniciales];
  let cantSiguiente = Math.floor(partidosIniciales.length / 2);
  while (cantSiguiente >= 1) {
    const rondaVacia = Array.from({ length: cantSiguiente }, () => ({
      pareja1: null,
      pareja2: null,
      resultado: null,
    }));
    rondas.push(rondaVacia);
    cantSiguiente = Math.floor(cantSiguiente / 2);
  }
  return rondas;
}

function avanzarGanadores(rondas) {
  const nuevasRondas = rondas.map((r) => r.map((p) => ({ ...p })));
  for (let ri = 0; ri < nuevasRondas.length - 1; ri++) {
    for (let pi = 0; pi < nuevasRondas[ri].length; pi++) {
      const partido = nuevasRondas[ri][pi];
      if (!partido.resultado) continue;
      let setsP1 = 0,
        setsP2 = 0;
      partido.resultado.sets.forEach((s) => {
        let g1 = s.g1,
          g2 = s.g2;
        if (s.tb1 !== undefined || s.tb2 !== undefined) {
          if ((s.tb1 ?? 0) > (s.tb2 ?? 0)) g1 += 1;
          else if ((s.tb2 ?? 0) > (s.tb1 ?? 0)) g2 += 1;
        }
        if (g1 > g2) setsP1++;
        else if (g2 > g1) setsP2++;
      });
      const ganador = setsP1 > setsP2 ? partido.pareja1 : partido.pareja2;
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

  let setsP1 = 0,
    setsP2 = 0;
  final.resultado.sets.forEach((s) => {
    let g1 = s.g1,
      g2 = s.g2;
    if (s.tb1 !== undefined || s.tb2 !== undefined) {
      if ((s.tb1 ?? 0) > (s.tb2 ?? 0)) g1 += 1;
      else if ((s.tb2 ?? 0) > (s.tb1 ?? 0)) g2 += 1;
    }
    if (g1 > g2) setsP1++;
    else if (g2 > g1) setsP2++;
  });

  return {
    campeon: setsP1 > setsP2 ? final.pareja1 : final.pareja2,
    subcampeon: setsP1 > setsP2 ? final.pareja2 : final.pareja1,
  };
}

function ManualBracketBuilder({ grupos, onConfirm }) {
  const clasificados = [];
  const tablas = grupos
    .map((g) => ({ nombre: g.nombre, tabla: calcularTabla(g) }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  tablas.forEach((g) => {
    if (g.tabla[0])
      clasificados.push({ ...g.tabla[0], posGrupo: 1, grupo: g.nombre });
    if (g.tabla[1])
      clasificados.push({ ...g.tabla[1], posGrupo: 2, grupo: g.nombre });
  });

  const cantPartidos = Math.floor(clasificados.length / 2);
  const [llaves, setLlaves] = useState(
    Array.from({ length: cantPartidos }, () => ({
      pareja1: null,
      pareja2: null,
      resultado: null,
    })),
  );

  const asignadasIds = new Set(
    llaves.flatMap((l) => [l.pareja1?.id, l.pareja2?.id].filter(Boolean)),
  );
  const sinAsignar = clasificados.filter((c) => !asignadasIds.has(c.id));

  const asignarPareja = (pareja, llaveIdx, posicion) => {
    const nuevas = llaves.map((l, i) =>
      i === llaveIdx ? { ...l, [posicion]: pareja } : l,
    );
    setLlaves(nuevas);
  };

  const quitarPareja = (llaveIdx, posicion) => {
    const nuevas = llaves.map((l, i) =>
      i === llaveIdx ? { ...l, [posicion]: null } : l,
    );
    setLlaves(nuevas);
  };

  const todasAsignadas = sinAsignar.length === 0;

  return (
    <div className="flex flex-col gap-3 mt-2">
      {sinAsignar.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-gray-500 mb-2">
            Parejas clasificadas sin asignar ({sinAsignar.length})
          </p>
          <div className="flex flex-col gap-1">
            {sinAsignar.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-2"
              >
                <div>
                  <span className="text-sm font-medium text-gray-700">
                    {getNombrePareja(p)}
                  </span>
                  <span className="text-xs text-gray-400 ml-2">
                    ({p.grupo} — {p.posGrupo}°)
                  </span>
                </div>
                <div className="flex gap-1 flex-wrap">
                  {llaves.map((l, li) => (
                    <span key={li} className="flex gap-0.5">
                      {!l.pareja1 && (
                        <button
                          onClick={() => asignarPareja(p, li, "pareja1")}
                          className="px-2 py-1 rounded-lg text-xs font-semibold bg-green-100 text-green-700 hover:bg-green-200 transition"
                        >
                          L{li + 1}↑
                        </button>
                      )}
                      {!l.pareja2 && (
                        <button
                          onClick={() => asignarPareja(p, li, "pareja2")}
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
        <p className="text-sm font-semibold text-gray-500 mb-2">Llaves</p>
        <div className="flex flex-col gap-2">
          {llaves.map((l, li) => (
            <div key={li} className="bg-gray-50 rounded-xl px-4 py-3">
              <p className="text-xs font-semibold text-gray-400 mb-1">
                Llave {li + 1}
              </p>
              <div className="flex items-center justify-between">
                <span
                  className={`text-sm ${l.pareja1 ? "font-medium text-gray-700" : "text-gray-300"}`}
                >
                  {l.pareja1 ? getNombrePareja(l.pareja1) : "— vacío —"}
                </span>
                {l.pareja1 && (
                  <button
                    onClick={() => quitarPareja(li, "pareja1")}
                    className="text-xs text-red-400 hover:text-red-600"
                  >
                    Quitar
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-400 my-0.5">vs</p>
              <div className="flex items-center justify-between">
                <span
                  className={`text-sm ${l.pareja2 ? "font-medium text-gray-700" : "text-gray-300"}`}
                >
                  {l.pareja2 ? getNombrePareja(l.pareja2) : "— vacío —"}
                </span>
                {l.pareja2 && (
                  <button
                    onClick={() => quitarPareja(li, "pareja2")}
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
        disabled={!todasAsignadas}
        className="bg-green-600 text-white font-semibold py-2 rounded-xl hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {todasAsignadas
          ? "Generar bracket manual"
          : `Faltan ${sinAsignar.length} pareja${sinAsignar.length !== 1 ? "s" : ""} por asignar`}
      </button>
    </div>
  );
}

export default function TabBracket({ torneoId, torneo }) {
  const [grupos, setGrupos] = useState([]);
  const [rondas, setRondas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bracketGenerado, setBracketGenerado] = useState(false);
  const [editandoResultado, setEditandoResultado] = useState(null);
  const [setsInput, setSetsInput] = useState([]);
  const [tiebreakInput, setTiebreakInput] = useState([]);
  const [modoGeneracion, setModoGeneracion] = useState("automatico");

  useEffect(() => {
    const cargar = async () => {
      try {
        const [gruposData, bracketData] = await Promise.all([
          getGrupos(torneoId),
          getBracket(torneoId),
        ]);
        setGrupos(gruposData);
        if (bracketData && bracketData.rondas) {
          setRondas(bracketData.rondas);
          setBracketGenerado(true);
        }
      } catch (err) {
        console.error("Error al cargar bracket:", err);
      }
      setLoading(false);
    };
    cargar();
  }, [torneoId]);

  const generarBracketAutomatico = () => {
    if (grupos.length === 0) return;
    const { partidos } = generarCrucesAutomaticos(grupos);
    const nuevasRondas = generarRondas(partidos);
    setRondas(nuevasRondas);
  };

  const generarBracketManual = (llaves) => {
    const nuevasRondas = generarRondas(llaves);
    setRondas(nuevasRondas);
  };

  const confirmarBracket = async () => {
    try {
      await guardarBracket(torneoId, { rondas });
      setBracketGenerado(true);
    } catch (err) {
      console.error("Error al guardar bracket:", err);
    }
  };

  const abrirEditarResultado = (rondaIdx, partidoIdx) => {
    const partido = rondas[rondaIdx][partidoIdx];
    if (!partido.pareja1 || !partido.pareja2) return;
    const cantSets = torneo.sets || 1;
    const setsExistentes = partido.resultado?.sets || [];
    const sets = [];
    const tbs = [];
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
    setEditandoResultado({ rondaIdx, partidoIdx });
  };

  const guardarResultado = async () => {
    const { rondaIdx, partidoIdx } = editandoResultado;
    const nuevasRondas = rondas.map((r) => r.map((p) => ({ ...p })));

    const setsConTb = setsInput.map((set, i) => {
      const resultado = { g1: set.g1, g2: set.g2 };
      if (tiebreakInput[i]?.activo) {
        resultado.tb1 = tiebreakInput[i].tb1;
        resultado.tb2 = tiebreakInput[i].tb2;
      }
      return resultado;
    });

    nuevasRondas[rondaIdx][partidoIdx] = {
      ...nuevasRondas[rondaIdx][partidoIdx],
      resultado: { sets: setsConTb },
    };

    const rondasActualizadas = avanzarGanadores(nuevasRondas);
    setRondas(rondasActualizadas);

    try {
      await guardarBracket(torneoId, { rondas: rondasActualizadas });
    } catch (err) {
      console.error("Error al guardar resultado:", err);
    }

    setEditandoResultado(null);
    setSetsInput([]);
    setTiebreakInput([]);
  };

  if (loading) {
    return (
      <div className="text-center text-gray-400 py-12">Cargando bracket...</div>
    );
  }

  if (grupos.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 text-center py-12">
        <div className="text-4xl mb-3">📋</div>
        <p className="text-gray-500 font-medium">Primero generá los grupos</p>
        <p className="text-gray-400 text-sm mt-1">
          Necesitás tener grupos confirmados con resultados cargados
        </p>
      </div>
    );
  }

  const resultado = obtenerCampeonYSub(rondas);
  const partido = editandoResultado
    ? rondas[editandoResultado.rondaIdx][editandoResultado.partidoIdx]
    : null;

  return (
    <div className="flex flex-col gap-4">
      {/* Campeones */}
      {bracketGenerado && resultado && (
        <div className="bg-gradient-to-r from-yellow-50 to-yellow-100 rounded-2xl p-6 shadow-sm border border-yellow-200 text-center">
          <div className="text-5xl mb-3">🏆</div>
          <p className="text-xs text-yellow-600 font-semibold uppercase tracking-wider mb-1">
            Campeones
          </p>
          <p className="text-xl font-bold text-gray-800 mb-4">
            {getNombrePareja(resultado.campeon)}
          </p>
          <div className="text-3xl mb-2">🥈</div>
          <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-1">
            Subcampeones
          </p>
          <p className="text-lg font-semibold text-gray-600">
            {getNombrePareja(resultado.subcampeon)}
          </p>
        </div>
      )}

      {/* Generar bracket */}
      {!bracketGenerado && rondas.length === 0 && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <h2 className="font-semibold text-gray-700 mb-3">
            Generar bracket eliminatorio
          </h2>
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setModoGeneracion("automatico")}
              className={`flex-1 px-4 py-2 rounded-xl text-sm font-semibold transition ${
                modoGeneracion === "automatico"
                  ? "bg-green-600 text-white"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              Automático (cruzado)
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

          {modoGeneracion === "automatico" && (
            <button
              onClick={generarBracketAutomatico}
              className="w-full bg-green-600 text-white font-semibold py-2 rounded-xl hover:bg-green-700 transition"
            >
              Generar cruces automáticos
            </button>
          )}

          {modoGeneracion === "manual" && (
            <ManualBracketBuilder
              grupos={grupos}
              onConfirm={generarBracketManual}
            />
          )}
        </div>
      )}

      {/* Vista previa / Bracket confirmado */}
      {rondas.length > 0 && (
        <div className="flex flex-col gap-4">
          {!bracketGenerado && (
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setRondas([])}
                className="px-3 py-1 rounded-lg text-sm font-semibold bg-gray-100 text-gray-500 hover:bg-gray-200 transition"
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
              className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100"
            >
              <h2 className="font-semibold text-gray-700 mb-3">
                {getNombreRonda(rondas.length, ri)}
              </h2>
              <div className="flex flex-col gap-2">
                {ronda.map((p, pi) => (
                  <div
                    key={pi}
                    className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3"
                  >
                    <div className="flex-1">
                      <p
                        className={`text-sm font-medium ${p.pareja1 ? "text-gray-700" : "text-gray-300"}`}
                      >
                        {getNombrePareja(p.pareja1)}
                      </p>
                      <p className="text-xs text-gray-400">vs</p>
                      <p
                        className={`text-sm font-medium ${p.pareja2 ? "text-gray-700" : "text-gray-300"}`}
                      >
                        {getNombrePareja(p.pareja2)}
                      </p>
                    </div>
                    <div>
                      {p.resultado ? (
                        <div className="flex flex-col items-end gap-1">
                          <div className="flex flex-wrap gap-1 justify-end">
                            {formatResultadoBracket(p.resultado)}
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
                        <button
                          onClick={() => abrirEditarResultado(ri, pi)}
                          className="px-3 py-1 rounded-lg text-xs font-semibold bg-green-600 text-white hover:bg-green-700 transition"
                        >
                          Cargar resultado
                        </button>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal cargar resultado */}
      {editandoResultado && partido && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm mx-4">
            <h3 className="font-semibold text-gray-700 mb-2">
              Cargar resultado
            </h3>
            <div className="mb-4 text-sm">
              <p className="font-medium text-gray-700">
                {getNombrePareja(partido.pareja1)}
              </p>
              <p className="text-gray-400 text-xs">vs</p>
              <p className="font-medium text-gray-700">
                {getNombrePareja(partido.pareja2)}
              </p>
            </div>
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
              {setsInput.map((set, si) => (
                <div key={si}>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-400 w-12">
                      Set {si + 1}
                    </span>
                    <input
                      type="number"
                      min="0"
                      value={set.g1}
                      onChange={(e) => {
                        const nuevo = [...setsInput];
                        nuevo[si] = {
                          ...nuevo[si],
                          g1: Number(e.target.value),
                        };
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
                        nuevo[si] = {
                          ...nuevo[si],
                          g2: Number(e.target.value),
                        };
                        setSetsInput(nuevo);
                      }}
                      className="w-16 border border-gray-200 rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                  <div className="ml-12 mt-1">
                    <button
                      type="button"
                      onClick={() => {
                        const nuevo = [...tiebreakInput];
                        nuevo[si] = {
                          ...nuevo[si],
                          activo: !nuevo[si].activo,
                          tb1: 0,
                          tb2: 0,
                        };
                        setTiebreakInput(nuevo);
                      }}
                      className={`text-xs font-semibold transition ${
                        tiebreakInput[si]?.activo
                          ? "text-orange-600"
                          : "text-gray-400 hover:text-gray-600"
                      }`}
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
                            const nuevo = [...tiebreakInput];
                            nuevo[si] = {
                              ...nuevo[si],
                              tb1: Number(e.target.value),
                            };
                            setTiebreakInput(nuevo);
                          }}
                          className="w-16 border border-orange-200 rounded-lg px-3 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-orange-400"
                        />
                        <span className="text-gray-400">-</span>
                        <input
                          type="number"
                          min="0"
                          value={tiebreakInput[si].tb2}
                          onChange={(e) => {
                            const nuevo = [...tiebreakInput];
                            nuevo[si] = {
                              ...nuevo[si],
                              tb2: Number(e.target.value),
                            };
                            setTiebreakInput(nuevo);
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

      {bracketGenerado && (
        <button
          onClick={() => {
            if (
              window.confirm(
                "¿Regenerar el bracket? Se perderán todos los resultados de eliminación.",
              )
            ) {
              setBracketGenerado(false);
              setRondas([]);
            }
          }}
          className="text-sm text-red-400 hover:text-red-600 transition text-center"
        >
          Regenerar bracket desde cero
        </button>
      )}
    </div>
  );
}
