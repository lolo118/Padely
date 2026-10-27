import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { AlertTriangle, ArrowRight, Check, Info, Lock, MessageCircle, Pencil, Plus, RefreshCw, X } from "lucide-react";
import {
  getParejas,
  getGrupos,
  guardarGrupos,
  actualizarGrupo,
} from "../../services/torneoService";
import { generarFixtureRoundRobin, generarPartidos, validarSets } from "../../utils/fixture";
import { notificarPartidoListo, notificarResultadoCargado } from "../../services/notificationService";
import {
  calcularTabla,
  getGanador,
  cuadrosDeTorneo,
  parejasDeCuadro,
  parejasSinCuadro,
  canchasDelTorneo,
  etiquetaProgramacion,
  partidoProgramado,
} from "../../utils/torneo";
import { formatDiaCorto } from "../../utils/formatDate";
import { toast } from "../../components/Toast";
import { confirmar } from "../../components/ConfirmDialog";
import { Button, Card, Field, Input, MatchCard, Pills, Select, Standings } from "../../components/ui";

// Nombre para mostrar: "Pérez / Gómez" (nombrePareja se guarda como "Pérez-Gómez")
const nombreDePareja = (p) =>
  p?.nombrePareja ? p.nombrePareja.replace("-", " / ") : `${p?.jugador1} / ${p?.jugador2}`;

// "1" → "Cancha 1"; un texto libre ("Central") va tal cual
const textoCancha = (cancha) => {
  const texto = String(cancha ?? "").trim();
  if (!texto) return undefined;
  return /^\d+$/.test(texto) ? `Cancha ${texto}` : texto;
};

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
  lineas.push(`⏰ Hora: ${p.hora}`, `📍 Cancha: ${textoCancha(p.cancha) || ""}`, "", nombre1, "vs", nombre2, "", "¡Nos vemos en la cancha!");
  return lineas.join("\n");
}

// Partidos de una liga agrupados por fecha, en orden: [["1", [...]], ["2", [...]]]
function partidosPorFecha(partidos) {
  const fechasMap = {};
  partidos.forEach((p) => {
    const f = p.fecha || 1;
    if (!fechasMap[f]) fechasMap[f] = [];
    fechasMap[f].push(p);
  });
  return Object.entries(fechasMap).sort(([a], [b]) => Number(a) - Number(b));
}

// Standings muestra todas las columnas en escritorio y las compactas en teléfonos
const QUERY_ESCRITORIO = "(min-width: 768px)";
function suscribirEscritorio(callback) {
  const mq = window.matchMedia(QUERY_ESCRITORIO);
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}
function leerEscritorio() {
  return window.matchMedia(QUERY_ESCRITORIO).matches;
}
function useEsEscritorio() {
  return useSyncExternalStore(suscribirEscritorio, leerEscritorio, () => true);
}

const icono = (componente) => {
  const Icono = componente;
  return <Icono className="pd-icon" size={20} aria-hidden="true" />;
};

// principal: el botón de confirmar es el primary de la pantalla mientras no haya una vista previa
function ManualGroupBuilder({ parejas, parejasXGrupo, onConfirm, principal = true }) {
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
    <div className="mt-2 flex flex-col gap-4">
      {sinAsignar.length > 0 && (
        <div>
          <p className="heading-sm mb-2">
            Parejas sin asignar <span className="pd-count font-medium pd-ink-3">{sinAsignar.length}</span>
          </p>
          <ul className="flex flex-col gap-2">
            {sinAsignar.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-sunken px-3 py-2"
              >
                <span className="body-md">{nombreDePareja(p)}</span>
                <span className="pd-btn-group" role="group" aria-label={`Asignar a ${nombreDePareja(p)}`}>
                  {gruposManuales.map((g, gi) => (
                    <Button
                      key={gi}
                      size="sm"
                      icon={icono(ArrowRight)}
                      onClick={() => asignar(p, gi)}
                      disabled={g.parejas.length >= parejasXGrupo}
                      aria-label={`Asignar al ${g.nombre}`}
                    >
                      {g.nombre.replace("Grupo ", "")}
                    </Button>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {gruposManuales.map((g, gi) => (
        <div key={gi}>
          <p className="heading-sm mb-2">
            {g.nombre}{" "}
            <span className="pd-count font-medium pd-ink-3 pd-tnum">
              {g.parejas.length}/{parejasXGrupo}
            </span>
          </p>
          {g.parejas.length === 0 ? (
            <p className="rounded-md bg-surface-sunken px-3 py-2 text-center body-sm pd-ink-3">Sin parejas asignadas</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {g.parejas.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 rounded-md bg-surface-sunken px-3 py-2">
                  <span className="body-md">{nombreDePareja(p)}</span>
                  <Button size="sm" variant="ghost" icon={icono(X)} onClick={() => desasignar(p, gi)}>
                    Quitar
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
      <div>
        <Button
          variant={principal ? "primary" : "secondary"}
          onClick={() => onConfirm(gruposManuales)}
          disabled={sinAsignar.length > 0}
        >
          {sinAsignar.length === 0
            ? "Generar grupos manuales"
            : `Faltan ${sinAsignar.length} pareja${sinAsignar.length !== 1 ? "s" : ""} por asignar`}
        </Button>
      </div>
    </div>
  );
}

// `cuadro` ({ id, label }): el cuadro (categoría) de esta pestaña. Todo lo que pasa acá (generar, guardar,
// resultados) es solo de ese cuadro; sin la prop se usa el primer cuadro del torneo.
// onGruposChange (opcional): recibe los grupos de este cuadro tal como quedaron guardados, para que el padre
// actualice el stepper y la tarjeta de cuadros sin recargar.
export default function TabGrupos({ torneoId, torneo, modoLiga = false, cuadro, onGruposChange }) {
  const cuadrosTorneo = cuadrosDeTorneo(torneo);
  const cuadroActual = cuadro || cuadrosTorneo[0];
  const variosCuadros = cuadrosTorneo.length > 1;
  const primerCuadroId = cuadrosTorneo[0].id;
  const [todasParejas, setTodasParejas] = useState([]);
  // Solo las parejas de este cuadro juegan acá; las que no tienen cuadro se avisan arriba
  const parejas = parejasDeCuadro(todasParejas, cuadroActual.id, torneo);
  const sinCuadro = parejasSinCuadro(todasParejas, torneo);
  const [grupos, setGrupos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [parejasXGrupo, setParejasXGrupo] = useState(2);
  const [modoGeneracion, setModoGeneracion] = useState("aleatorio");
  // Opciones de "parejas por grupo" según el modo de generación
  const opcionesParejasXGrupo = (modo) => (modo === "aleatorio" ? [2, 4, 6] : [2, 3, 4, 5, 6]);
  const cambiarModoGeneracion = (modo) => {
    setModoGeneracion(modo);
    const opciones = opcionesParejasXGrupo(modo);
    // Si el valor actual no existe en el nuevo modo, el select mostraría otra cosa que el estado
    if (!opciones.includes(parejasXGrupo)) setParejasXGrupo(opciones[0]);
  };
  const [gruposGenerados, setGruposGenerados] = useState(false);
  const [editandoResultado, setEditandoResultado] = useState(null);
  const [setsInput, setSetsInput] = useState([]);
  const [tiebreakInput, setTiebreakInput] = useState([]);
  const [errorModal, setErrorModal] = useState("");
  const escritorio = useEsEscritorio();
  const dialogoRef = useRef(null);
  const tituloDialogoId = useId();

  useEffect(() => {
    const cargar = async () => {
      try {
        const [parejasData, gruposData] = await Promise.all([
          getParejas(torneoId),
          getGrupos(torneoId),
        ]);
        setTodasParejas(parejasData);
        // Grupos de este cuadro (los grupos viejos sin campo `cuadro` cuentan para el primer cuadro)
        const delCuadro = gruposData.filter((g) => (g.cuadro || primerCuadroId) === cuadroActual.id);
        if (delCuadro.length > 0) {
          setGrupos(delCuadro.sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "")));
          setGruposGenerados(true);
        }
      } catch (err) {
        console.error("Error al cargar datos:", err);
      }
      setLoading(false);
    };
    cargar();
  }, [torneoId, cuadroActual.id, primerCuadroId]);

  // El foco entra al diálogo de resultado al abrirlo (también al pasar al siguiente partido)
  useEffect(() => {
    if (editandoResultado) dialogoRef.current?.focus();
  }, [editandoResultado]);

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
      const ids = await guardarGrupos(torneoId, grupos, cuadroActual.id);
      const guardados = grupos.map((g, i) => ({ ...g, id: ids[i], cuadro: cuadroActual.id }));
      setGrupos(guardados);
      setGruposGenerados(true);
      onGruposChange?.(guardados);
      toast.success(modoLiga ? "Fixture confirmado" : "Grupos confirmados");
    } catch (err) {
      console.error("Error al guardar grupos:", err);
      toast.error("No pudimos guardar los grupos. Intentá de nuevo.");
    }
  };

  // cambios: campos de programación a guardar en una sola escritura ({ dia } | { hora, dia? } | { cancha, canchaId, dia? })
  const actualizarPartidoInfo = async (grupoIdx, partidoIdx, cambios) => {
    const partidoOriginal = grupos[grupoIdx]?.partidos?.[partidoIdx];
    // Los partidos de antes del día (hora + cancha) ya fueron avisados: no se vuelve a notificar
    const yaEstabaProgramado =
      partidoProgramado(partidoOriginal) || !!(partidoOriginal?.hora && partidoOriginal?.cancha);

    const nuevosGrupos = [...grupos];
    const grupo = { ...nuevosGrupos[grupoIdx] };
    const partidos = [...grupo.partidos];
    partidos[partidoIdx] = { ...partidos[partidoIdx], ...cambios };
    grupo.partidos = partidos;
    nuevosGrupos[grupoIdx] = grupo;
    setGrupos(nuevosGrupos);
    if (grupo.id) {
      try {
        await actualizarGrupo(torneoId, grupo.id, { partidos });
        onGruposChange?.(nuevosGrupos);
      } catch (err) {
        console.error("Error al actualizar partido:", err);
      }
    }

    // Avisar a los jugadores cuando el partido queda programado (día, hora y cancha) por primera vez
    const partidoActualizado = partidos[partidoIdx];
    if (!yaEstabaProgramado && partidoProgramado(partidoActualizado)) {
      try {
        const torneoNombre = torneo.nombre || "torneo";
        const { dia, hora, cancha } = partidoActualizado;
        const p1 = partidoActualizado.pareja1;
        const p2 = partidoActualizado.pareja2;
        const nombreP1 = p1.nombrePareja || `${p1.jugador1} / ${p1.jugador2}`;
        const nombreP2 = p2.nombrePareja || `${p2.jugador1} / ${p2.jugador2}`;
        if (p1.jugador1Uid) notificarPartidoListo(p1.jugador1Uid, torneoNombre, torneoId, hora, cancha, nombreP2, dia);
        if (p1.jugador2Uid) notificarPartidoListo(p1.jugador2Uid, torneoNombre, torneoId, hora, cancha, nombreP2, dia);
        if (p2.jugador1Uid) notificarPartidoListo(p2.jugador1Uid, torneoNombre, torneoId, hora, cancha, nombreP1, dia);
        if (p2.jugador2Uid) notificarPartidoListo(p2.jugador2Uid, torneoNombre, torneoId, hora, cancha, nombreP1, dia);
      } catch (err) { console.error("Error notificando partido listo:", err); }
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

  const cerrarEditarResultado = () => {
    setEditandoResultado(null);
    setSetsInput([]);
    setTiebreakInput([]);
    setErrorModal("");
  };

  // P3-11: la validación vive en utils/fixture (validarSets, con tests): además exige que alguien gane el partido
  const validarResultado = () =>
    validarSets(setsInput, tiebreakInput, { gamesPorSet: Number(torneo.gamesPorSet) || 6, cantSets: Number(torneo.sets) || 1 });

  const guardarResultado = async (keepOpen = false) => {
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
        toast.success("Resultado guardado");
        onGruposChange?.(nuevosGrupos);
      } catch (e) {
        console.error("Error al guardar resultado:", e);
        toast.error("No pudimos guardar el resultado. Intentá de nuevo.");
      }
    }

    setGrupos(nuevosGrupos);

    // Notify players about result
    try {
      const p1 = partidos[partidoIdx].pareja1;
      const p2 = partidos[partidoIdx].pareja2;
      const torneoNombre = torneo.nombre || "torneo";
      if (p1.jugador1Uid) notificarResultadoCargado(p1.jugador1Uid, torneoNombre, torneoId);
      if (p1.jugador2Uid) notificarResultadoCargado(p1.jugador2Uid, torneoNombre, torneoId);
      if (p2.jugador1Uid) notificarResultadoCargado(p2.jugador1Uid, torneoNombre, torneoId);
      if (p2.jugador2Uid) notificarResultadoCargado(p2.jugador2Uid, torneoNombre, torneoId);
    } catch (err) { console.error("Error notificando resultado:", err); }

    if (!keepOpen) {
      cerrarEditarResultado();
    }
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
      <div className="flex flex-col gap-4" aria-busy="true" aria-label="Cargando grupos">
        <div className="pd-skeleton h-12" />
        <div className="pd-skeleton h-56" />
        <div className="pd-skeleton h-56" />
      </div>
    );

  // Parejas sin categoría: no entran en ningún cuadro hasta que el organizador les asigne una
  const avisoSinCuadro = sinCuadro.length > 0 ? (
    <p className="flex items-center gap-2 rounded-md bg-warning-soft px-3 py-2 body-sm text-warning" role="status">
      {icono(AlertTriangle)}
      <span>
        {sinCuadro.length} pareja{sinCuadro.length !== 1 ? "s" : ""} sin categoría — asignales una en la pestaña Parejas
      </span>
    </p>
  ) : null;

  if (parejas.length < 3) {
    return (
      <div className="flex flex-col gap-4">
        {avisoSinCuadro}
        <Card as="section">
          <div className="py-6 text-center">
            <span className="pd-ball block! mx-auto mb-3" aria-hidden="true" />
            <p className="heading-md">
              Necesitás al menos 3 parejas inscriptas{variosCuadros ? ` en ${cuadroActual.label}` : ""}
            </p>
            <p className="mt-1 body-sm pd-ink-2">
              Actualmente hay {parejas.length} pareja
              {parejas.length !== 1 ? "s" : ""}
            </p>
          </div>
        </Card>
      </div>
    );
  }

  const partido = editandoResultado
    ? grupos[editandoResultado.grupoIdx].partidos[editandoResultado.partidoIdx]
    : null;

  const parejasQueAvanzan = Number(torneo.parejasQueAvanzan) || 2;
  const tieneResultados = grupos.some((g) => (g.partidos || []).some((p) => p.resultado));
  const hayVistaPrevia = grupos.length > 0 && !gruposGenerados;
  const columnasTabla = escritorio ? "completa" : "compacta";
  const ayudaDesempate = "Desempate: partidos ganados, diferencia de sets y después de games.";
  const cuadroLabel = variosCuadros ? cuadroActual.label : undefined;
  // Canchas del torneo (las del club o las tipeadas); sin ninguna, la cancha se escribe a mano
  const canchas = canchasDelTorneo(torneo);
  // Con un club que todavía no confirmó la sede, los partidos no bloquean turnos hasta que acepte
  const clubSinConfirmar = !!torneo?.club && torneo.club.estado !== "aceptado";

  // Siguiente partido sin resultado (en este grupo o en los que siguen) para "Guardar y cargar siguiente"
  let siguiente = null;
  if (editandoResultado) {
    const { grupoIdx, partidoIdx } = editandoResultado;
    const partidosGrupo = grupos[grupoIdx]?.partidos || [];
    const siguienteIdx = partidosGrupo.findIndex((p, i) => i > partidoIdx && !p.resultado);
    if (siguienteIdx !== -1) {
      siguiente = { grupoIdx, partidoIdx: siguienteIdx };
    } else {
      for (let gi = grupoIdx + 1; gi < grupos.length; gi++) {
        const pi = (grupos[gi]?.partidos || []).findIndex((p) => !p.resultado);
        if (pi !== -1) { siguiente = { grupoIdx: gi, partidoIdx: pi }; break; }
      }
    }
  }

  const guardarYCargarSiguiente = async () => {
    const err = validarResultado();
    if (err) { setErrorModal(err); return; }
    await guardarResultado(true);
    if (siguiente) abrirEditarResultado(siguiente.grupoIdx, siguiente.partidoIdx);
  };

  // Un partido confirmado: la tarjeta (tocarla abre la carga del resultado) y debajo horario y cancha
  const renderPartido = (grupoIdx, partidoIdx, p, ronda) => {
    const ganador = getGanador(p.resultado);
    const sets = p.resultado?.sets || [];
    const puedeCargar = torneo.status === "en_curso" || torneo.status === "finalizado";
    const editable = !!p.resultado || puedeCargar;
    const tiebreaks = sets
      .map((s, i) =>
        s.tb1 !== undefined && s.tb2 !== undefined
          ? `tie break ${s.tb1}–${s.tb2}${sets.length > 1 ? ` en el set ${i + 1}` : ""}`
          : null,
      )
      .filter(Boolean);
    let foot, footIcon;
    if (p.resultado) {
      foot = tiebreaks.length > 0 ? `Resultado cargado · ${tiebreaks.join(" · ")}` : "Resultado cargado · tocá para editar";
      footIcon = Check;
    } else if (puedeCargar) {
      foot = "Tocá para cargar el resultado";
      footIcon = Pencil;
    } else {
      foot = "Iniciá el torneo primero";
      footIcon = Lock;
    }
    const abrir = () => abrirEditarResultado(grupoIdx, partidoIdx);
    const mensajeWhatsApp = mensajePartidoListo(
      torneo,
      p,
      p.pareja1.nombrePareja || `${p.pareja1.jugador1} / ${p.pareja1.jugador2}`,
      p.pareja2.nombrePareja || `${p.pareja2.jugador1} / ${p.pareja2.jugador2}`,
    );
    // "sáb 18 oct · 20:00 · Cancha 2" (el MatchCard une cancha y hora en ese orden; el formato del sistema pone
    // el día primero y la cancha al final, así que va armado en una sola pieza)
    const programacion = etiquetaProgramacion({ ...p, cancha: textoCancha(p.cancha) }, formatDiaCorto);
    const cambiarCancha = (valor) =>
      actualizarPartidoInfo(grupoIdx, partidoIdx, conDiaPorDefecto(p, cambiosDeCancha(valor, canchas, !!torneo?.club?.id), torneo));

    return (
      <li key={partidoIdx} className="flex w-full max-w-[360px] flex-col gap-2">
        <MatchCard
          ronda={ronda}
          cuadro={cuadroLabel}
          hora={programacion || undefined}
          parejas={[
            { nombre: nombreDePareja(p.pareja1), sets: sets.map((s) => s.g1) },
            { nombre: nombreDePareja(p.pareja2), sets: sets.map((s) => s.g2) },
          ]}
          ganador={ganador === 1 ? 0 : ganador === 2 ? 1 : null}
          foot={foot}
          footIcon={footIcon}
          onClick={editable ? abrir : undefined}
          role={editable ? "button" : undefined}
          tabIndex={editable ? 0 : undefined}
          onKeyDown={
            editable
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
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Día" className="min-w-[140px] flex-1">
            <Input
              type="date"
              value={p.dia || ""}
              min={torneo.fechaInicio || undefined}
              max={torneo.fechaFin || undefined}
              onChange={(e) => actualizarPartidoInfo(grupoIdx, partidoIdx, { dia: e.target.value })}
            />
          </Field>
          <Field label="Hora" className="min-w-[140px] flex-1">
            <Input
              type="time"
              value={p.hora || ""}
              onChange={(e) =>
                actualizarPartidoInfo(grupoIdx, partidoIdx, conDiaPorDefecto(p, { hora: e.target.value }, torneo))
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
                  <option value={p.cancha}>{textoCancha(p.cancha)}</option>
                )}
              </Select>
            ) : (
              <Input
                type="text"
                value={p.cancha || ""}
                placeholder="Ej.: 1"
                onChange={(e) => cambiarCancha(e.target.value)}
              />
            )}
          </Field>
          {p.hora && p.cancha && (
            <a
              href={`https://wa.me/?text=${encodeURIComponent(mensajeWhatsApp)}`}
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
      </li>
    );
  };

  const filasTabla = (tabla, clasifica) =>
    tabla.map((row, ri) => ({ ...row, nombre: nombreDePareja(row), clasifica: clasifica(row, ri) }));

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {avisoSinCuadro}

      {/* Regenerar arriba */}
      {gruposGenerados && (
        <div className="flex justify-end">
          {tieneResultados ? (
            <p className="body-sm pd-ink-2">No podés regenerar grupos después de cargar resultados</p>
          ) : (
            <Button
              icon={icono(RefreshCw)}
              onClick={async () => {
                const ok = await confirmar({
                  titulo: "Regenerar grupos",
                  mensaje: "Se perderán los grupos actuales.",
                  confirmText: "Regenerar",
                  danger: true,
                });
                if (ok) {
                  setGruposGenerados(false);
                  setGrupos([]);
                }
              }}
            >
              Regenerar grupos desde cero
            </Button>
          )}
        </div>
      )}

      {/* Tip */}
      {gruposGenerados && !modoLiga && (
        <p className="flex gap-2 body-sm pd-ink-2">
          {icono(Info)}
          <span>
            Asigná horario y cancha a cada partido tocando los campos debajo de cada enfrentamiento. Cargá los
            resultados tocando cada partido.
          </span>
        </p>
      )}
      {gruposGenerados && modoLiga && (
        <p className="flex gap-2 body-sm pd-ink-2">
          {icono(Info)}
          <span>
            Asigná horario y cancha a cada partido de cada fecha. La tabla de posiciones se actualiza
            automáticamente al cargar resultados.
          </span>
        </p>
      )}
      {gruposGenerados && clubSinConfirmar && (
        <p className="pd-help -mt-2 md:-mt-4">Los turnos del club se bloquean cuando el club confirme la sede.</p>
      )}

      {!gruposGenerados && modoLiga && (
        <Card as="section">
          <Card.Title as="h2">Generar fixture{variosCuadros ? ` — ${cuadroActual.label}` : ""}</Card.Title>
          <Card.Meta>
            Se generará un fixture round-robin donde todas las {parejas.length} parejas juegan entre sí.
            Total de partidos: {parejas.length * (parejas.length - 1) / 2} · Fechas: {parejas.length % 2 === 0 ? parejas.length - 1 : parejas.length}
          </Card.Meta>
          <Card.Foot>
            <Button
              variant={hayVistaPrevia ? "secondary" : "primary"}
              onClick={() => {
                const fechas = generarFixtureRoundRobin(parejas);
                const allMatches = fechas.flat();
                setGrupos([{ nombre: "Liga", parejas: parejas, partidos: allMatches }]);
              }}
            >
              Generar fixture automático
            </Button>
          </Card.Foot>
        </Card>
      )}

      {!gruposGenerados && !modoLiga && (
        <Card as="section">
          <Card.Title as="h2">Generar grupos{variosCuadros ? ` — ${cuadroActual.label}` : ""}</Card.Title>
          <div className="mt-4 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Field label="Parejas por grupo">
                <Select
                  value={parejasXGrupo}
                  onChange={(e) => setParejasXGrupo(Number(e.target.value))}
                >
                  {opcionesParejasXGrupo(modoGeneracion).map((n) => (
                    <option key={n} value={n}>
                      {n} parejas por grupo · {Math.ceil(parejas.length / n)} grupos
                    </option>
                  ))}
                </Select>
              </Field>
              {modoGeneracion === "aleatorio" && parejas.length % parejasXGrupo !== 0 && (
                <p className="flex gap-2 body-sm text-warning">
                  {icono(AlertTriangle)}
                  <span>
                    {parejas.length} parejas no se dividen exactamente en grupos de {parejasXGrupo}. El último grupo tendrá {parejas.length % parejasXGrupo} pareja{parejas.length % parejasXGrupo !== 1 ? "s" : ""}.
                  </span>
                </p>
              )}
            </div>
            <Field as="div" label="Modo">
              <Pills
                ariaLabel="Modo de generación"
                items={[
                  { value: "aleatorio", label: "Aleatorio" },
                  { value: "manual", label: "Manual" },
                ]}
                value={modoGeneracion}
                onChange={cambiarModoGeneracion}
              />
            </Field>
            {modoGeneracion === "aleatorio" && (
              <div>
                <Button variant={hayVistaPrevia ? "secondary" : "primary"} onClick={generarGruposAleatorio}>
                  Generar grupos aleatorios
                </Button>
              </div>
            )}
            {modoGeneracion === "manual" && (
              <ManualGroupBuilder
                parejas={parejas}
                parejasXGrupo={parejasXGrupo}
                principal={!hayVistaPrevia}
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
        </Card>
      )}

      {grupos.length > 0 && !gruposGenerados && modoLiga && (
        <Card as="section">
          <Card.Row className="flex-wrap">
            <Card.Title as="h2">Vista previa del fixture</Card.Title>
            <span className="pd-btn-group">
              <Button size="sm" onClick={() => setGrupos([])}>
                Regenerar
              </Button>
              <Button size="sm" variant="primary" onClick={guardarGruposEnFirebase}>
                Confirmar fixture
              </Button>
            </span>
          </Card.Row>
          <div className="mt-4 flex flex-col gap-4">
            {partidosPorFecha(grupos[0]?.partidos || []).map(([fecha, matches]) => (
              <div key={fecha}>
                <p className="heading-sm mb-2">Fecha {fecha}</p>
                <ul className="flex flex-col gap-2">
                  {matches.map((m, mi) => (
                    <li key={mi} className="rounded-md bg-surface-sunken px-3 py-2 body-md">
                      {nombreDePareja(m.pareja1)}
                      <span className="pd-ink-3"> vs </span>
                      {nombreDePareja(m.pareja2)}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>
      )}

      {grupos.length > 0 && !gruposGenerados && !modoLiga && (
        <Card as="section">
          <Card.Row className="flex-wrap">
            <Card.Title as="h2">
              Vista previa{" "}
              <span className="pd-count body-md font-medium! pd-ink-3">
                {grupos.length} {grupos.length === 1 ? "grupo" : "grupos"}
              </span>
            </Card.Title>
            <span className="pd-btn-group">
              {modoGeneracion === "aleatorio" && (
                <Button size="sm" onClick={generarGruposAleatorio}>
                  Regenerar
                </Button>
              )}
              <Button size="sm" variant="primary" onClick={guardarGruposEnFirebase}>
                Confirmar grupos
              </Button>
            </span>
          </Card.Row>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {grupos.map((g, gi) => (
              <div key={gi}>
                <p className="heading-sm mb-2">{g.nombre}</p>
                <ul className="flex flex-col gap-2">
                  {g.parejas.map((p, pi) => (
                    <li key={pi} className="rounded-md bg-surface-sunken px-3 py-2 body-md">
                      {nombreDePareja(p)}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Liga confirmada */}
      {gruposGenerados && modoLiga && grupos.length > 0 && (() => {
        const grupo = grupos[0];
        const tabla = calcularTabla(grupo);
        const partidos = grupo.partidos || [];
        const fechasOrdenadas = partidosPorFecha(partidos);

        return (
          <>
            {/* Position table: la pelota marca al puntero cuando ya ganó algún partido */}
            <Standings
              grupo="Tabla de posiciones"
              cuadroLabel={cuadroLabel}
              columnas={columnasTabla}
              rows={filasTabla(tabla, (row, ri) => ri === 0 && tabla[0].pg > 0)}
              help={ayudaDesempate}
            />

            {/* Matches by fecha */}
            {fechasOrdenadas.map(([fecha, matches]) => (
              <section key={fecha} className="flex flex-col gap-3">
                <h3 className="heading-sm">Fecha {fecha}</h3>
                <ul className="grid gap-4 sm:grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
                  {matches.map((p) => renderPartido(0, partidos.indexOf(p), p, `Fecha ${fecha}`))}
                </ul>
              </section>
            ))}
          </>
        );
      })()}

      {/* Grupos confirmados */}
      {gruposGenerados && !modoLiga &&
        grupos.map((grupo, gi) => {
          const tabla = calcularTabla(grupo);
          return (
            <section key={grupo.id || gi} className="flex flex-col gap-4">
              <Standings
                grupo={grupo.nombre}
                cuadroLabel={cuadroLabel}
                columnas={columnasTabla}
                rows={filasTabla(tabla, (row, ri) => ri < parejasQueAvanzan)}
                help={ayudaDesempate}
              />
              <h3 className="pd-eyebrow">Partidos</h3>
              <ul className="grid gap-4 sm:grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
                {(grupo.partidos || []).map((p, pi) => renderPartido(gi, pi, p, grupo.nombre))}
              </ul>
            </section>
          );
        })}

      {/* Modal cargar resultado */}
      {editandoResultado && partido && (
        <div className="pd-backdrop z-50">
          <div
            ref={dialogoRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby={tituloDialogoId}
            className="pd-dialog max-h-full overflow-y-auto outline-none"
          >
            <h2 className="pd-dialog-title" id={tituloDialogoId}>
              Cargar resultado
            </h2>
            {partido.resultado && (
              <p className="pd-help mb-2">Editar un resultado no vuelve a otorgar puntos.</p>
            )}
            <p className="pd-dialog-body">
              <span className="font-semibold text-ink">{nombreDePareja(partido.pareja1)}</span>
              <span className="pd-ink-3"> vs </span>
              <span className="font-semibold text-ink">{nombreDePareja(partido.pareja2)}</span>
            </p>

            {errorModal && (
              <p className="pd-error mt-3" role="alert">
                {errorModal}
              </p>
            )}

            <div className="mt-4 flex flex-col gap-3">
              <div className="flex items-center gap-3" aria-hidden="true">
                <span className="label w-16 truncate text-center pd-ink-3">
                  {partido.pareja1.jugador1?.split(" ").pop() ||
                    partido.pareja1.jugador1}
                </span>
                <span className="w-4" />
                <span className="label w-16 truncate text-center pd-ink-3">
                  {partido.pareja2.jugador1?.split(" ").pop() ||
                    partido.pareja2.jugador1}
                </span>
              </div>
              {setsInput.slice(0, setsVisibles()).map((set, si) => (
                <div key={si} className="flex flex-col gap-2">
                  <Field as="div" label={`Set ${si + 1}`}>
                    <div className="flex items-center gap-3">
                      <Input
                        type="number"
                        min="0"
                        inputMode="numeric"
                        className="w-16! text-center"
                        aria-label={`Set ${si + 1}, games de ${nombreDePareja(partido.pareja1)}`}
                        value={set.g1}
                        onChange={(e) => {
                          const n = [...setsInput];
                          n[si] = { ...n[si], g1: Number(e.target.value) };
                          setSetsInput(n);
                        }}
                      />
                      <span className="w-4 text-center pd-ink-3" aria-hidden="true">–</span>
                      <Input
                        type="number"
                        min="0"
                        inputMode="numeric"
                        className="w-16! text-center"
                        aria-label={`Set ${si + 1}, games de ${nombreDePareja(partido.pareja2)}`}
                        value={set.g2}
                        onChange={(e) => {
                          const n = [...setsInput];
                          n[si] = { ...n[si], g2: Number(e.target.value) };
                          setSetsInput(n);
                        }}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-pressed={!!tiebreakInput[si]?.activo}
                        icon={icono(tiebreakInput[si]?.activo ? Check : Plus)}
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
                  </Field>
                  {tiebreakInput[si]?.activo && (
                    <div className="flex items-center gap-3">
                      <Input
                        type="number"
                        min="0"
                        inputMode="numeric"
                        className="w-16! text-center"
                        aria-label={`Tie break del set ${si + 1}, puntos de ${nombreDePareja(partido.pareja1)}`}
                        value={tiebreakInput[si].tb1}
                        onChange={(e) => {
                          const n = [...tiebreakInput];
                          n[si] = { ...n[si], tb1: Number(e.target.value) };
                          setTiebreakInput(n);
                        }}
                      />
                      <span className="w-4 text-center pd-ink-3" aria-hidden="true">–</span>
                      <Input
                        type="number"
                        min="0"
                        inputMode="numeric"
                        className="w-16! text-center"
                        aria-label={`Tie break del set ${si + 1}, puntos de ${nombreDePareja(partido.pareja2)}`}
                        value={tiebreakInput[si].tb2}
                        onChange={(e) => {
                          const n = [...tiebreakInput];
                          n[si] = { ...n[si], tb2: Number(e.target.value) };
                          setTiebreakInput(n);
                        }}
                      />
                      <span className="caption text-warning">Tie break</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="pd-dialog-actions">
              <Button onClick={cerrarEditarResultado}>Cancelar</Button>
              {siguiente && (
                <Button onClick={guardarYCargarSiguiente}>Guardar y cargar siguiente</Button>
              )}
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
