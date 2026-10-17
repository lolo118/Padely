import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Check,
  Info,
  Lock,
  MessageCircle,
  Pencil,
  Plus,
  RotateCcw,
} from "lucide-react";
import {
  getGrupos,
  getParejas,
  guardarBracket,
  getBracket,
} from "../../services/torneoService";
import { notificarPartidoListo, notificarResultadoCargado } from "../../services/notificationService";
import {
  calcularTabla,
  getGanador,
  getNombrePareja,
  cuadrosDeTorneo,
  parejasDeCuadro,
  canchasDelTorneo,
  etiquetaProgramacion,
  partidoProgramado,
} from "../../utils/torneo";
import { formatDiaCorto } from "../../utils/formatDate";
import { toast } from "../../components/Toast";
import { confirmar } from "../../components/ConfirmDialog";
import { Button, Card, ChampionCard, Field, Input, MatchCard, Pills, Select } from "../../components/ui";

function getNombreRonda(totalRondas, rondaIdx) {
  const faltantes = totalRondas - rondaIdx;
  if (faltantes === 1) return "Final";
  if (faltantes === 2) return "Semifinales";
  if (faltantes === 3) return "Cuartos de final";
  if (faltantes === 4) return "Octavos de final";
  if (faltantes === 5) return "16avos de final";
  return `Ronda ${rondaIdx + 1}`;
}

// Nombre corto de la ronda para el eyebrow del MatchCard ("Cuartos 2 · 6ta Masculino")
function nombreCortoRonda(totalRondas, rondaIdx) {
  const faltantes = totalRondas - rondaIdx;
  if (faltantes === 1) return "Final";
  if (faltantes === 2) return "Semifinal";
  if (faltantes === 3) return "Cuartos";
  if (faltantes === 4) return "Octavos";
  if (faltantes === 5) return "16avos";
  return `Ronda ${rondaIdx + 1}`;
}

// "2026-10-18" -> "18 oct 2026" (la fecha corta del design system; formatDate.js todavía no tiene una)
function fechaCorta(fechaStr) {
  if (!fechaStr || typeof fechaStr !== "string") return "";
  const [y, m, d] = fechaStr.split("-").map(Number);
  if (!y || !m || !d) return fechaStr;
  return new Date(y, m - 1, d)
    .toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" })
    .replace(/\./g, "");
}

// "1" -> "Cancha 1"; un nombre ("Central") se muestra tal cual
function etiquetaCancha(cancha) {
  const texto = String(cancha ?? "").trim();
  if (!texto) return undefined;
  return /^\d+$/.test(texto) ? `Cancha ${texto}` : texto;
}

// ===== Programación de un partido (día, hora y cancha) =====
// Los partidos guardan cancha (nombre) y canchaId (id de la cancha del torneo, o null en texto libre).

// Cambios a guardar al elegir una cancha: una del torneo guarda nombre + id; cualquier otro valor es texto libre
// canchaId solo existe con un club vinculado (es el id real de la cancha del club); sin club queda null
function cambiosDeCancha(valor, canchas, conClub) {
  const cancha = canchas.find((c) => c.id === valor);
  if (cancha) return { cancha: cancha.nombre, canchaId: conClub ? cancha.id : null };
  return { cancha: String(valor ?? ""), canchaId: null };
}

// Valor del select de cancha: el id guardado, el de la cancha con ese nombre (datos viejos) o el texto tal cual
function valorDeCancha(partido, canchas) {
  if (partido?.canchaId && canchas.some((c) => c.id === partido.canchaId)) return partido.canchaId;
  const porNombre = canchas.find((c) => c.nombre === partido?.cancha);
  return porNombre ? porNombre.id : partido?.cancha || "";
}

// Un partido sin día que recibe hora o cancha toma el primer día del torneo en la misma escritura
function conDiaPorDefecto(partido, cambios, torneo) {
  if (partido?.dia || !torneo?.fechaInicio) return cambios;
  const programa = Boolean(cambios.hora) || Boolean(cambios.cancha);
  return programa ? { ...cambios, dia: torneo.fechaInicio } : cambios;
}

// Texto del mensaje de WhatsApp "Partido listo" (es contenido del mensaje, no UI: acá sí van emoji)
function mensajePartidoListo(torneo, p, nombre1, nombre2) {
  const lineas = ["🎾 ¡Partido listo!", "", `Torneo: ${torneo.nombre}`];
  if (p.dia) lineas.push(`📅 Día: ${formatDiaCorto(p.dia)}`);
  lineas.push(`⏰ Hora: ${p.hora}`, `📍 Cancha: ${etiquetaCancha(p.cancha) || ""}`, "", nombre1, "vs", nombre2, "", "¡Nos vemos en la cancha!");
  return lineas.join("\n");
}

// Tie breaks de un resultado para el pie del MatchCard: "TB 7–5 · 10–8"
function textoTiebreak(sets) {
  const tbs = (sets || [])
    .filter((s) => s.tb1 !== undefined && s.tb2 !== undefined)
    .map((s) => `${s.tb1}–${s.tb2}`);
  return tbs.length ? `TB ${tbs.join(" · ")}` : "";
}

// Menor potencia de 2 >= n (n parejas -> tamaño del cuadro)
function siguientePotenciaDe2(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

function nuevoPartido(pareja1, pareja2) {
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

  // Pone (o saca, con null) una pareja en el lugar `campo` de la llave `li`
  const asignar = (li, campo, pareja) => {
    setLlaves(llaves.map((x, i) => (i === li ? { ...x, [campo]: pareja } : x)));
  };

  return (
    <div className="flex flex-col gap-5 mt-4">
      {sinAsignar.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="heading-sm m-0">
            Parejas clasificadas sin asignar{" "}
            <span className="pd-count text-ink-3 font-medium pd-tnum">{sinAsignar.length}</span>
          </h3>
          {sinAsignar.map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-surface-sunken px-4 py-3"
            >
              <div className="min-w-0">
                <span className="body-md font-medium!">{getNombrePareja(p)}</span>
                {p.grupo && (
                  <span className="body-sm text-ink-3 ml-2">
                    {p.grupo} · {p.posGrupo}°
                  </span>
                )}
              </div>
              <div className="pd-btn-group">
                {llaves.map((l, li) => (
                  <span key={li} className="flex gap-1">
                    {!l.pareja1 && (
                      <Button
                        size="sm"
                        icon={<ArrowUp className="pd-icon" size={20} aria-hidden="true" />}
                        aria-label={`Llave ${li + 1}, lugar de arriba`}
                        onClick={() => asignar(li, "pareja1", p)}
                      >
                        L{li + 1}
                      </Button>
                    )}
                    {!l.pareja2 && (
                      <Button
                        size="sm"
                        icon={<ArrowDown className="pd-icon" size={20} aria-hidden="true" />}
                        aria-label={`Llave ${li + 1}, lugar de abajo`}
                        onClick={() => asignar(li, "pareja2", p)}
                      >
                        L{li + 1}
                      </Button>
                    )}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}
      <section className="flex flex-col gap-2">
        <h3 className="heading-sm m-0">Llaves</h3>
        <p className="body-sm text-ink-2 m-0">
          Si una llave queda con una sola pareja, esa pareja pasa directo (bye).
        </p>
        <div className="grid gap-4 sm:grid-cols-[repeat(auto-fill,minmax(280px,1fr))] mt-2">
          {llaves.map((l, li) => (
            <Card key={li} className="p-4!">
              <Card.Eyebrow>Llave {li + 1}</Card.Eyebrow>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className={l.pareja1 ? "body-md font-medium" : "body-md text-ink-3 italic"}>
                  {l.pareja1 ? getNombrePareja(l.pareja1) : "Vacío"}
                </span>
                {l.pareja1 && (
                  <Button size="sm" variant="ghost" onClick={() => asignar(li, "pareja1", null)}>
                    Quitar
                  </Button>
                )}
              </div>
              <p className="caption text-ink-3 my-1">vs</p>
              <div className="flex items-center justify-between gap-2">
                <span className={l.pareja2 ? "body-md font-medium" : "body-md text-ink-3 italic"}>
                  {l.pareja2 ? getNombrePareja(l.pareja2) : "Vacío"}
                </span>
                {l.pareja2 && (
                  <Button size="sm" variant="ghost" onClick={() => asignar(li, "pareja2", null)}>
                    Quitar
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      </section>
      <div>
        <Button variant="primary" onClick={() => onConfirm(llaves)} disabled={sinAsignar.length > 0}>
          {sinAsignar.length === 0
            ? "Generar bracket manual"
            : `Faltan ${sinAsignar.length} pareja${sinAsignar.length !== 1 ? "s" : ""} por asignar`}
        </Button>
      </div>
    </div>
  );
}

// `cuadro` ({ id, label }): el cuadro (categoría) de esta pestaña: sus grupos, su bracket
// (tournaments/{tid}/cuadros/{cuadroId}) y sus campeones. Sin la prop se usa el primer cuadro del torneo.
// onBracketChange (opcional): recibe las rondas de este cuadro tal como quedaron guardadas, para que el padre
// actualice el stepper y la tarjeta de cuadros sin recargar.
export default function TabBracket({ torneoId, torneo, cuadro, onBracketChange }) {
  const cuadrosTorneo = cuadrosDeTorneo(torneo);
  const cuadroActual = cuadro || cuadrosTorneo[0];
  const variosCuadros = cuadrosTorneo.length > 1;
  const primerCuadroId = cuadrosTorneo[0].id;
  const [grupos, setGrupos] = useState([]);
  const [todasParejas, setTodasParejas] = useState([]);
  // Eliminación directa: al cuadro entran solo las parejas de esta categoría
  const parejas = parejasDeCuadro(todasParejas, cuadroActual.id, torneo);
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
          getBracket(torneoId, cuadroActual.id),
          torneo.formato === "eliminacion" ? getParejas(torneoId) : Promise.resolve([]),
        ]);
        // Grupos de este cuadro (los grupos viejos sin campo `cuadro` cuentan para el primer cuadro)
        setGrupos(gruposData.filter((g) => (g.cuadro || primerCuadroId) === cuadroActual.id));
        setTodasParejas(parejasData);
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
  }, [torneoId, torneo.formato, cuadroActual.id, primerCuadroId]);

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
      await guardarBracket(torneoId, cuadroActual.id, { rondas }, cuadroActual.label);
      setBracketGenerado(true);
      toast.success("Bracket confirmado");
      onBracketChange?.(rondas);
    } catch (err) {
      console.error("Error al guardar bracket:", err);
      toast.error("No pudimos guardar el bracket. Intentá de nuevo.");
    }
  };

  // cambios: campos de programación a guardar en una sola escritura ({ dia } | { hora, dia? } | { cancha, canchaId, dia? })
  const actualizarPartidoBracket = async (rondaIdx, partidoIdx, cambios) => {
    const partidoOriginal = rondas[rondaIdx]?.[partidoIdx];
    // Los partidos de antes del día (hora + cancha) ya fueron avisados: no se vuelve a notificar
    const yaEstabaProgramado =
      partidoProgramado(partidoOriginal) || !!(partidoOriginal?.hora && partidoOriginal?.cancha);

    const nuevasRondas = rondas.map((r) => r.map((p) => ({ ...p })));
    nuevasRondas[rondaIdx][partidoIdx] = {
      ...nuevasRondas[rondaIdx][partidoIdx],
      ...cambios,
    };
    setRondas(nuevasRondas);
    try {
      await guardarBracket(torneoId, cuadroActual.id, { rondas: nuevasRondas }, cuadroActual.label);
      onBracketChange?.(nuevasRondas);
    } catch (err) {
      console.error("Error al actualizar:", err);
    }

    // Avisar a los jugadores cuando el partido queda programado (día, hora y cancha) por primera vez
    const partidoActualizado = nuevasRondas[rondaIdx][partidoIdx];
    if (!yaEstabaProgramado && partidoProgramado(partidoActualizado)) {
      try {
        const torneoNombre = torneo.nombre || "torneo";
        const { dia, hora, cancha } = partidoActualizado;
        const p1 = partidoActualizado.pareja1;
        const p2 = partidoActualizado.pareja2;
        if (!p1 || !p2) return;
        const nombreP1 = p1.nombrePareja || `${p1.jugador1} / ${p1.jugador2}`;
        const nombreP2 = p2.nombrePareja || `${p2.jugador1} / ${p2.jugador2}`;
        if (p1.jugador1Uid) notificarPartidoListo(p1.jugador1Uid, torneoNombre, torneoId, hora, cancha, nombreP2, dia);
        if (p1.jugador2Uid) notificarPartidoListo(p1.jugador2Uid, torneoNombre, torneoId, hora, cancha, nombreP2, dia);
        if (p2.jugador1Uid) notificarPartidoListo(p2.jugador1Uid, torneoNombre, torneoId, hora, cancha, nombreP1, dia);
        if (p2.jugador2Uid) notificarPartidoListo(p2.jugador2Uid, torneoNombre, torneoId, hora, cancha, nombreP1, dia);
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
      await guardarBracket(torneoId, cuadroActual.id, { rondas: rondasActualizadas }, cuadroActual.label);
      toast.success("Resultado guardado");
      onBracketChange?.(rondasActualizadas);
    } catch (e) {
      console.error("Error al guardar resultado:", e);
      toast.error("No pudimos guardar el resultado. Intentá de nuevo.");
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
      <div className="flex flex-col gap-4" role="status" aria-busy="true" aria-label="Cargando bracket">
        <div className="pd-skeleton h-7 w-40" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="pd-skeleton h-32 rounded-md!" />
          ))}
        </div>
      </div>
    );

  if (!esEliminacionDirecta && grupos.length === 0) {
    return (
      <Card className="text-center py-12!">
        <span className="pd-ball mx-auto mb-3 block!" aria-hidden="true" />
        <p className="heading-sm m-0">
          Primero generá los grupos{variosCuadros ? ` de ${cuadroActual.label}` : ""}.
        </p>
        <p className="body-sm text-ink-2 mt-1 mb-0">
          Necesitás tener grupos confirmados con resultados cargados.
        </p>
      </Card>
    );
  }

  if (esEliminacionDirecta && parejas.length < 2 && rondas.length === 0) {
    return (
      <Card className="text-center py-12!">
        <span className="pd-ball mx-auto mb-3 block!" aria-hidden="true" />
        <p className="heading-sm m-0">
          Necesitás al menos 2 parejas inscriptas{variosCuadros ? ` en ${cuadroActual.label}` : ""}.
        </p>
        <p className="body-sm text-ink-2 mt-1 mb-0">
          Actualmente hay {parejas.length} pareja{parejas.length !== 1 ? "s" : ""}.
        </p>
      </Card>
    );
  }

  const campeonData = obtenerCampeonYSub(rondas);
  const partido = editandoResultado
    ? rondas[editandoResultado.rondaIdx][editandoResultado.partidoIdx]
    : null;
  const tieneResultados = rondas.some((r) => (r || []).some((p) => p && p.resultado));
  const puedeCargarResultados = torneo.status === "en_curso" || torneo.status === "finalizado";
  const cuadroLabel = variosCuadros ? cuadroActual.label : undefined;
  // Canchas del torneo (las del club o las tipeadas); sin ninguna, la cancha se escribe a mano
  const canchas = canchasDelTorneo(torneo);
  // Con un club que todavía no confirmó la sede, los partidos no bloquean turnos hasta que acepte
  const clubSinConfirmar = !!torneo?.club && torneo.club.estado !== "aceptado";
  const apellido1 = partido?.pareja1?.jugador1?.split(" ").pop() || "P1";
  const apellido2 = partido?.pareja2?.jugador1?.split(" ").pop() || "P2";

  const cerrarResultado = () => {
    setEditandoResultado(null);
    setSetsInput([]);
    setTiebreakInput([]);
    setErrorModal("");
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Regenerar arriba */}
      {bracketGenerado && (
        <div className="flex justify-end">
          {tieneResultados ? (
            <p className="body-sm text-ink-3 m-0">No podés regenerar el bracket después de cargar resultados</p>
          ) : (
            <Button
              icon={<RotateCcw className="pd-icon" size={20} aria-hidden="true" />}
              onClick={async () => {
                const ok = await confirmar({
                  titulo: "Regenerar bracket",
                  mensaje: "Se descarta el cuadro actual y se arma uno nuevo.",
                  confirmText: "Regenerar",
                  danger: true,
                });
                if (ok) {
                  setBracketGenerado(false);
                  setRondas([]);
                }
              }}
            >
              Regenerar bracket desde cero
            </Button>
          )}
        </div>
      )}

      {/* Tip */}
      {bracketGenerado && !campeonData && (
        <p className="flex items-start gap-2 body-sm text-ink-2 m-0">
          <Info className="pd-icon text-court" size={20} aria-hidden="true" />
          <span>
            Asigná horario y cancha a cada partido. Cargá los resultados y los ganadores avanzarán
            automáticamente a la siguiente ronda.
          </span>
        </p>
      )}
      {bracketGenerado && clubSinConfirmar && (
        <p className="pd-help -mt-4">Los turnos del club se bloquean cuando el club confirme la sede.</p>
      )}

      {/* Campeones */}
      {bracketGenerado && campeonData && (
        <ChampionCard
          cuadroLabel={cuadroLabel}
          campeones={getNombrePareja(campeonData.campeon)}
          subcampeones={getNombrePareja(campeonData.subcampeon)}
          torneo={torneo.nombre}
          club={torneo.sede}
          fecha={fechaCorta(torneo.fechaFin || torneo.fechaInicio)}
        />
      )}

      {/* Generar bracket */}
      {!bracketGenerado && rondas.length === 0 && (
        <Card>
          <Card.Title as="h2">Generar bracket eliminatorio</Card.Title>
          <p className="body-sm text-ink-2 mt-1 mb-4">
            {esEliminacionDirecta
              ? `Entran las ${parejas.length} parejas inscriptas; si no son potencia de 2, algunas pasan directo (bye)`
              : `Avanzan ${parejasQueAvanzan} pareja${parejasQueAvanzan !== 1 ? "s" : ""} de cada grupo`}
          </p>
          <Pills
            ariaLabel="Modo de generación"
            value={modoGeneracion}
            onChange={setModoGeneracion}
            items={[
              { value: "automatico", label: esEliminacionDirecta ? "Automático (sorteo)" : "Automático (cruzado)" },
              { value: "manual", label: "Manual" },
            ]}
          />
          {modoGeneracion === "automatico" && (
            <Card.Foot>
              <Button variant="primary" onClick={generarBracketAutomatico}>
                {esEliminacionDirecta ? "Sortear cruces" : "Generar cruces automáticos"}
              </Button>
            </Card.Foot>
          )}
          {modoGeneracion === "manual" && (
            <ManualBracketBuilder
              key={clasificados.length}
              clasificados={clasificados}
              onConfirm={(llaves) => setRondas(avanzarGanadores(generarRondas(llaves)))}
            />
          )}
        </Card>
      )}

      {/* Rondas */}
      {rondas.length > 0 && (
        <div className="flex flex-col gap-6">
          {!bracketGenerado && (
            <div className="pd-btn-group justify-end">
              <Button onClick={() => setRondas([])}>Descartar</Button>
              <Button variant="primary" onClick={confirmarBracket}>
                Confirmar bracket
              </Button>
            </div>
          )}

          {rondas.map((ronda, ri) => {
            const esFinal = ri === rondas.length - 1;
            const esSemi = ri === rondas.length - 2;
            const corto = nombreCortoRonda(rondas.length, ri);
            return (
              <section key={ri} className="flex flex-col gap-4">
                <h2 className="heading-md m-0">{getNombreRonda(rondas.length, ri)}</h2>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {ronda.map((p, pi) => {
                    const g = getGanador(p.resultado);
                    const ganador = g === 1 ? 0 : g === 2 ? 1 : null;
                    const ambas = !!(p.pareja1 && p.pareja2);
                    const bye = esBye(rondas, ri, pi);
                    const sets = p.resultado?.sets || [];
                    // Vestido de la tarjeta: sin rivales definidos es "pending"; con rivales, la ronda manda
                    const variant = !ambas ? "pending" : esFinal ? "final" : esSemi ? "semi" : "default";
                    // Tocar la tarjeta abre la carga del resultado (editar siempre; cargar solo con el torneo iniciado)
                    const abrir =
                      bracketGenerado && ambas && (p.resultado || puedeCargarResultados)
                        ? () => abrirEditarResultado(ri, pi)
                        : undefined;
                    let foot;
                    let footIcon;
                    if (p.resultado) {
                      const tb = textoTiebreak(sets);
                      foot = tb ? `Resultado cargado · ${tb}` : "Resultado cargado";
                      footIcon = Check;
                    } else if (bye) {
                      foot = "Pasa directo (bye)";
                      footIcon = ArrowRight;
                    } else if (ambas && bracketGenerado) {
                      foot = puedeCargarResultados ? "Tocá para cargar el resultado" : "Iniciá el torneo primero";
                      footIcon = puedeCargarResultados ? Pencil : Lock;
                    }
                    // "sáb 18 oct · 20:00 · Cancha 2" (el MatchCard une cancha y hora en ese orden; el formato del
                    // sistema pone el día primero y la cancha al final, así que va armado en una sola pieza)
                    const programacion = etiquetaProgramacion({ ...p, cancha: etiquetaCancha(p.cancha) }, formatDiaCorto);
                    const cambiarCancha = (valor) =>
                      actualizarPartidoBracket(ri, pi, conDiaPorDefecto(p, cambiosDeCancha(valor, canchas, !!torneo?.club?.id), torneo));
                    return (
                      <div key={pi} className="flex w-full max-w-[360px] flex-col gap-2">
                        <MatchCard
                          ronda={ronda.length > 1 ? `${corto} ${pi + 1}` : corto}
                          cuadro={cuadroLabel}
                          hora={programacion || undefined}
                          parejas={[
                            { nombre: p.pareja1 ? getNombrePareja(p.pareja1) : "", sets: sets.map((s) => s.g1) },
                            { nombre: p.pareja2 ? getNombrePareja(p.pareja2) : "", sets: sets.map((s) => s.g2) },
                          ]}
                          ganador={ganador}
                          variant={variant}
                          foot={foot}
                          footIcon={footIcon}
                          onClick={abrir}
                          role={abrir ? "button" : undefined}
                          tabIndex={abrir ? 0 : undefined}
                          onKeyDown={
                            abrir
                              ? (e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    abrir();
                                  }
                                }
                              : undefined
                          }
                        />
                        {/* Programación: día, hora y cancha */}
                        {bracketGenerado && ambas && (
                          <div className="flex flex-wrap items-end gap-2">
                            <Field label="Día" className="min-w-[140px] flex-1">
                              <Input
                                type="date"
                                value={p.dia || ""}
                                min={torneo.fechaInicio || undefined}
                                max={torneo.fechaFin || undefined}
                                onChange={(e) => actualizarPartidoBracket(ri, pi, { dia: e.target.value })}
                              />
                            </Field>
                            <Field label="Hora" className="min-w-[140px] flex-1">
                              <Input
                                type="time"
                                value={p.hora || ""}
                                onChange={(e) =>
                                  actualizarPartidoBracket(ri, pi, conDiaPorDefecto(p, { hora: e.target.value }, torneo))
                                }
                              />
                            </Field>
                            <Field label="Cancha" className="min-w-[140px] flex-1">
                              {canchas.length > 0 ? (
                                <Select value={valorDeCancha(p, canchas)} onChange={(e) => cambiarCancha(e.target.value)}>
                                  <option value="">Sin cancha</option>
                                  {canchas.map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.nombre}
                                    </option>
                                  ))}
                                  {/* Cancha cargada antes de definir las canchas del torneo (datos viejos) */}
                                  {p.cancha && !canchas.some((c) => c.id === p.canchaId || c.nombre === p.cancha) && (
                                    <option value={p.cancha}>{etiquetaCancha(p.cancha)}</option>
                                  )}
                                </Select>
                              ) : (
                                <Input
                                  type="text"
                                  value={p.cancha || ""}
                                  placeholder="Cancha (ej: 1)"
                                  onChange={(e) => cambiarCancha(e.target.value)}
                                />
                              )}
                            </Field>
                            {p.hora && p.cancha && (
                              <a
                                href={`https://wa.me/?text=${encodeURIComponent(
                                  mensajePartidoListo(
                                    torneo,
                                    p,
                                    p.pareja1?.nombrePareja || "Pareja 1",
                                    p.pareja2?.nombrePareja || "Pareja 2",
                                  ),
                                )}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="pd-btn pd-btn-icon"
                                aria-label="Enviar por WhatsApp"
                                title="Enviar por WhatsApp"
                              >
                                <MessageCircle className="pd-icon" size={20} aria-hidden="true" />
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Diálogo cargar resultado */}
      {editandoResultado && partido && (
        <div className="pd-backdrop z-50">
          <div className="pd-dialog" role="dialog" aria-modal="true" aria-labelledby="bracket-resultado-titulo">
            <h2 className="pd-dialog-title" id="bracket-resultado-titulo">
              Cargar resultado
            </h2>
            {partido.resultado && (
              <p className="body-sm text-ink-3 m-0 mb-2">Editar un resultado no vuelve a otorgar puntos.</p>
            )}
            <div className="pd-dialog-body mb-4!">
              <p className="heading-sm text-ink m-0">{getNombrePareja(partido.pareja1)}</p>
              <p className="caption text-ink-3 m-0">vs</p>
              <p className="heading-sm text-ink m-0">{getNombrePareja(partido.pareja2)}</p>
            </div>

            {errorModal && (
              <p className="pd-error mb-3" role="alert">
                {errorModal}
              </p>
            )}

            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-[48px_64px_16px_64px] items-center gap-x-3">
                <span />
                <span className="label text-ink-3 text-center truncate">{apellido1}</span>
                <span />
                <span className="label text-ink-3 text-center truncate">{apellido2}</span>
              </div>
              {setsInput.slice(0, setsVisibles()).map((set, si) => (
                <div key={si} className="grid grid-cols-[48px_64px_16px_64px] items-center gap-x-3 gap-y-1">
                  <span className="body-sm text-ink-2">Set {si + 1}</span>
                  <Input
                    type="number"
                    min="0"
                    inputMode="numeric"
                    value={set.g1}
                    onChange={(e) => {
                      const n = [...setsInput];
                      n[si] = { ...n[si], g1: Number(e.target.value) };
                      setSetsInput(n);
                    }}
                    className="text-center pd-tnum"
                    aria-label={`Set ${si + 1}, games de ${apellido1}`}
                  />
                  <span className="text-ink-3 text-center" aria-hidden="true">
                    –
                  </span>
                  <Input
                    type="number"
                    min="0"
                    inputMode="numeric"
                    value={set.g2}
                    onChange={(e) => {
                      const n = [...setsInput];
                      n[si] = { ...n[si], g2: Number(e.target.value) };
                      setSetsInput(n);
                    }}
                    className="text-center pd-tnum"
                    aria-label={`Set ${si + 1}, games de ${apellido2}`}
                  />
                  <div className="col-span-4">
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-pressed={!!tiebreakInput[si]?.activo}
                      icon={
                        tiebreakInput[si]?.activo ? (
                          <Check className="pd-icon" size={20} aria-hidden="true" />
                        ) : (
                          <Plus className="pd-icon" size={20} aria-hidden="true" />
                        )
                      }
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
                    >
                      Tie break
                    </Button>
                  </div>
                  {tiebreakInput[si]?.activo && (
                    <>
                      <span className="body-sm text-warning">TB</span>
                      <Input
                        type="number"
                        min="0"
                        inputMode="numeric"
                        value={tiebreakInput[si].tb1}
                        onChange={(e) => {
                          const n = [...tiebreakInput];
                          n[si] = { ...n[si], tb1: Number(e.target.value) };
                          setTiebreakInput(n);
                        }}
                        className="text-center pd-tnum"
                        aria-label={`Tie break del set ${si + 1}, puntos de ${apellido1}`}
                      />
                      <span className="text-ink-3 text-center" aria-hidden="true">
                        –
                      </span>
                      <Input
                        type="number"
                        min="0"
                        inputMode="numeric"
                        value={tiebreakInput[si].tb2}
                        onChange={(e) => {
                          const n = [...tiebreakInput];
                          n[si] = { ...n[si], tb2: Number(e.target.value) };
                          setTiebreakInput(n);
                        }}
                        className="text-center pd-tnum"
                        aria-label={`Tie break del set ${si + 1}, puntos de ${apellido2}`}
                      />
                    </>
                  )}
                </div>
              ))}
            </div>
            <div className="pd-dialog-actions">
              <Button onClick={cerrarResultado}>Cancelar</Button>
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
                  <Button
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
                  >
                    Guardar y cargar siguiente
                  </Button>
                );
              })()}
              <Button variant="primary" onClick={() => guardarResultado(false)}>
                Guardar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
