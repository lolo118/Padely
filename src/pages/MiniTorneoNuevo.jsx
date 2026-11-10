import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Plus, Shuffle, Trophy, X } from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuthStore } from "../store/authStore";
import { cargarFlags } from "../services/flagsService";
import { crearMiniTorneo } from "../services/miniTorneoService";
import { NIVELES } from "../utils/categorias";
import { formatDiaCorto, getTodayLocal } from "../utils/formatDate";
import { normalizarReserva, rangoHoras } from "../utils/reservas";
import {
  FORMATOS,
  MAX_CANCHAS,
  MAX_JUGADORES,
  MAX_PARTIDOS_REY,
  MIN_CALENTAMIENTO,
  MIN_JUGADORES,
  admiteTercerPuesto,
  armarMiniTorneo,
  armarParejas,
  conocidosDelTurno,
  evaluarFormato,
  formatosPosibles,
  hayNiveles,
  jugadoresPublicos,
  minutosDelTurno,
  nombreDelCreador,
  nombresCortos,
  opcionesDeFormato,
  prepararJugadores,
  textoContador,
  textoPartidoA,
} from "../utils/miniTorneo";
import { toast } from "../components/Toast";
import { Alert, Badge, Button, Card, Field, Input, Pills, Select } from "../components/ui";

// Armar un mini torneo para una reserva (/mini/nuevo/:clubId/:grupoId): quien reservó o alguien de la cuenta del
// turno suma a los que juegan (sugerencias del turno + nombres sueltos), y se arman parejas fijas: en automático la app
// elige el formato y sortea las parejas (al azar o equilibradas por nivel); en manual se elige el formato, la duración
// y quién juega con quién. Cada formato muestra su estimación contra la duración del turno. Detrás de flags.miniTorneo.
let siguienteClave = 1;
const nuevaClave = () => `x${siguienteClave++}`;
const nuevaSemilla = () => Date.now() % 1000000007;
const plural = (k, uno, varios) => (k === 1 ? uno : varios);

export default function MiniTorneoNuevo() {
  const { clubId, grupoId } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const perfil = useAuthStore((s) => s.perfil);
  const [carga, setCarga] = useState({ listo: false, flag: false, reserva: null, cuenta: null, clubNombre: "" });

  useEffect(() => {
    if (!user || !clubId || !grupoId) return undefined;
    let vivo = true;
    (async () => {
      const flags = await cargarFlags();
      const [reservaSnap, cuentaSnap, clubSnap] = await Promise.all([
        getDoc(doc(db, "clubs", clubId, "reservas", grupoId)).catch(() => null),
        getDoc(doc(db, "clubs", clubId, "cuentas", grupoId)).catch(() => null),
        getDoc(doc(db, "clubs", clubId)).catch(() => null),
      ]);
      if (!vivo) return;
      setCarga({
        listo: true,
        flag: flags?.miniTorneo === true,
        reserva: reservaSnap?.exists() ? normalizarReserva({ id: reservaSnap.id, ...reservaSnap.data() }) : null,
        cuenta: cuentaSnap?.exists() ? { id: cuentaSnap.id, ...cuentaSnap.data() } : null,
        clubNombre: clubSnap?.exists() ? clubSnap.data().nombre || "" : "",
      });
    })();
    return () => {
      vivo = false;
    };
  }, [user, clubId, grupoId]);

  const { reserva, cuenta } = carga;
  const esTitular = !!reserva && !!user && reserva.jugadorUid === user.uid;
  const esParticipante = !!cuenta && !!user && (cuenta.participantesUids || []).includes(user.uid);
  const vigente = !!reserva && reserva.status === "confirmada" && String(reserva.fecha || "") >= getTodayLocal();

  const volver = (
    <Link to="/mis-reservas" className="body-sm text-ink-2 inline-flex items-center gap-1 hover:underline self-start">
      <ArrowLeft className="pd-icon" size={16} aria-hidden="true" /> Mis reservas
    </Link>
  );

  if (!carga.listo) {
    return (
      <div className="max-w-2xl mx-auto flex flex-col gap-4" aria-busy="true" aria-label="Cargando">
        {volver}
        <div className="pd-skeleton h-8 w-48" />
        <div className="pd-skeleton h-60 rounded-lg" />
      </div>
    );
  }
  let problema = "";
  if (!carga.flag) problema = "Los mini torneos todavía no están disponibles.";
  else if (!reserva) problema = "No encontramos esa reserva.";
  else if (!esTitular && !esParticipante) problema = "Solo quien reservó o las personas sumadas a la cuenta del turno pueden armar un mini torneo.";
  else if (!vigente) problema = "La reserva tiene que estar confirmada y no haber pasado.";
  if (problema) {
    return (
      <div className="max-w-2xl mx-auto flex flex-col gap-4">
        {volver}
        <Card className="text-center">
          <Trophy className="pd-icon-lg mx-auto mb-3 text-ink-3" size={24} aria-hidden="true" />
          <p className="heading-sm">No se puede armar el mini torneo</p>
          <p className="body-sm text-ink-2 mt-1">{problema}</p>
        </Card>
      </div>
    );
  }
  return <Formulario clubId={clubId} grupoId={grupoId} reserva={reserva} cuenta={cuenta} clubNombre={carga.clubNombre} user={user} perfil={perfil} volver={volver} onCreado={(id) => navigate(`/mini/${clubId}/${id}`)} />;
}

function Formulario({ clubId, grupoId, reserva, cuenta, clubNombre, user, perfil, volver, onCreado }) {
  const creadorNombre = useMemo(() => nombreDelCreador({ perfilNombre: perfil?.nombre, displayName: user.displayName, reserva, uid: user.uid }), [perfil, user, reserva]);
  // Sugerencias del turno: los participantes reales de la cuenta y quien reservó, sin el creador (nunca "Titular")
  const conocidos = useMemo(() => conocidosDelTurno({ participantes: cuenta?.participantes, reserva, creadorUid: user.uid, creadorNombre }), [cuenta, reserva, user.uid, creadorNombre]);
  const [lista, setLista] = useState(() => [{ clave: "vos", nombre: creadorNombre, uid: user.uid, nivel: perfil?.nivel || "", vos: true, origen: null }]);
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [verNiveles, setVerNiveles] = useState(false);
  const [modo, setModo] = useState("auto");
  const [canchas, setCanchas] = useState(1);
  const [formatoElegido, setFormatoElegido] = useState(null); // en automático, si lo cambió a mano
  const [verOpciones, setVerOpciones] = useState(false);
  const [formatoManual, setFormatoManual] = useState("roundRobin");
  const [criterio, setCriterio] = useState(null); // automático: "azar" | "nivel" (null: por nivel si hay niveles)
  const [partidoA, setPartidoA] = useState({ tipo: "games", valor: 4 });
  const [partidosRey, setPartidosRey] = useState("");
  const [parejasManual, setParejasManual] = useState([]); // [[claveA, claveB]]
  const [tercerPuesto, setTercerPuesto] = useState(false);
  const [seed, setSeed] = useState(nuevaSemilla);
  const [cargaJugadores, setCargaJugadores] = useState(true);
  const [nombre, setNombre] = useState(() => `Mini torneo del ${formatDiaCorto(reserva.fecha)}`);
  const [creando, setCreando] = useState(false);

  const n = lista.length;
  const lleno = n >= MAX_JUGADORES;
  const minutosTurno = minutosDelTurno(reserva.horaInicio, reserva.horaFin, reserva.turnos);
  const sugerencias = conocidos.filter((c) => !lista.some((j) => j.origen === c.clave || (c.uid && j.uid === c.uid)));

  // Clave de la UI → id del jugador (j1…): el orden de la lista
  const jugadores = useMemo(() => prepararJugadores(lista.map((j) => ({ nombre: j.nombre, nivel: j.nivel, uid: j.uid }))), [lista]);
  const idDeClave = useMemo(() => Object.fromEntries(lista.map((j, i) => [j.clave, jugadores[i]?.id])), [lista, jugadores]);
  const nombreDeClave = useMemo(() => Object.fromEntries(lista.map((j, i) => [j.clave, jugadores[i]?.nombre || j.nombre])), [lista, jugadores]);
  const parejasIds = useMemo(() => parejasManual.map(([a, b]) => [idDeClave[a], idDeClave[b]]).filter(([a, b]) => a && b), [parejasManual, idDeClave]);
  const conNiveles = hayNiveles(jugadores);
  const criterioAuto = criterio || (conNiveles ? "nivel" : "azar");
  const parejasCompletas = n >= 2 && n % 2 === 0 && parejasIds.length * 2 === n;
  const formatoPedido = modo === "manual" ? formatoManual : formatoElegido;

  const entradaActual = useMemo(
    () => ({
      jugadores,
      modo,
      formato: formatoPedido || undefined,
      parejas: modo === "manual" && parejasCompletas ? parejasIds : undefined,
      criterio: modo === "auto" ? (criterioAuto === "nivel" && !conNiveles ? "azar" : criterioAuto) : undefined,
      canchas,
      partidoA: modo === "manual" ? partidoA : undefined,
      rondas: modo === "manual" && formatoManual === "rey" && Number(partidosRey) > 0 ? Math.min(MAX_PARTIDOS_REY, Number(partidosRey)) : undefined,
      tercerPuesto,
      horaInicio: reserva.horaInicio,
      horaFin: reserva.horaFin,
      turnos: reserva.turnos,
      seed,
    }),
    [jugadores, modo, formatoPedido, parejasIds, parejasCompletas, criterioAuto, conNiveles, canchas, partidoA, formatoManual, partidosRey, tercerPuesto, reserva, seed],
  );
  const entrada = useDeferredValue(entradaActual);
  const plan = useMemo(() => {
    try {
      return { ...armarMiniTorneo(entrada), error: "" };
    } catch (err) {
      return { error: err?.message || "No se puede armar con estos datos" };
    }
  }, [entrada]);
  const opciones = useMemo(() => opcionesDeFormato({ n, canchas, minutos: minutosTurno, partidoA: modo === "manual" ? partidoA : null, tercerPuesto }), [n, canchas, minutosTurno, modo, partidoA, tercerPuesto]);
  const formatoVisible = plan.error ? formatoPedido : plan.formato;

  // ----- Jugadores -----
  const sumar = ({ nombre: nuevo, uid = null, origen = null }) => {
    const limpio = String(nuevo || "").trim().slice(0, 40);
    if (!limpio) return;
    if (lleno) {
      toast.error(`Como máximo ${MAX_JUGADORES} jugadores (${MAX_JUGADORES / 2} parejas)`);
      return;
    }
    setLista((l) => [...l, { clave: nuevaClave(), nombre: limpio, uid, nivel: "", vos: false, origen }]);
  };
  const sumarNombre = (e) => {
    e?.preventDefault?.();
    sumar({ nombre: nombreNuevo });
    setNombreNuevo("");
  };
  const sacar = (clave) => {
    setLista((l) => l.filter((x) => x.clave !== clave));
    setParejasManual((ps) => ps.map((p) => p.map((c) => (c === clave ? "" : c))));
  };
  const cambiarNivel = (clave, nivel) => setLista((l) => l.map((j) => (j.clave === clave ? { ...j, nivel } : j)));

  // ----- Parejas a mano -----
  const claveDeId = useMemo(() => Object.fromEntries(Object.entries(idDeClave).map(([k, v]) => [v, k])), [idDeClave]);
  const sortearManual = (crit) => {
    try {
      const armadas = armarParejas(jugadores, { criterio: crit, seed: nuevaSemilla() });
      setParejasManual(armadas.map((p) => p.jugadores.map((id) => claveDeId[id])));
    } catch (err) {
      toast.error(err?.message || "No se pudieron armar las parejas");
    }
  };
  const elegirEnPareja = (pi, lado, clave) =>
    setParejasManual((ps) => {
      const copia = ps.map((p) => [...p]);
      while (copia.length < Math.floor(n / 2)) copia.push(["", ""]);
      copia.forEach((p) => p.forEach((c, i) => c === clave && (p[i] = "")));
      copia[pi][lado] = clave;
      return copia;
    });
  // Al pasar a manual se arranca con lo que armó el automático (formato, duración y parejas), para retocarlo
  const cambiarModo = (nuevo) => {
    if (nuevo === "manual" && !plan.error) {
      setFormatoManual(plan.formato);
      setPartidoA(plan.partidoA);
      setParejasManual(plan.parejas.map((p) => p.jugadores.map((id) => claveDeId[id])));
    } else if (nuevo === "manual") {
      setFormatoManual(formatoElegido || formatosPosibles(n, canchas)[0] || "roundRobin");
    }
    setModo(nuevo);
  };

  // ----- Crear -----
  const ev = formatoPedido ? evaluarFormato(formatoPedido, n, canchas) : null;
  let falta = "";
  if (n < MIN_JUGADORES) falta = `Faltan ${MIN_JUGADORES - n} ${plural(MIN_JUGADORES - n, "jugador", "jugadores")}`;
  else if (n % 2 !== 0) falta = "Sumá o sacá un jugador";
  else if (ev && !ev.valido) falta = "Elegí un formato válido";
  else if (modo === "manual" && !parejasCompletas) falta = "Completá las parejas";
  else if (plan.error) falta = "Revisá los datos";
  const crear = async () => {
    if (falta || plan.error) return;
    setCreando(true);
    try {
      const uids = jugadores.map((j) => j.uid).filter(Boolean);
      const [nombreCorto] = nombresCortos([creadorNombre]);
      const datos = {
        clubNombre: clubNombre || "",
        canchaNombre: reserva.canchaName || reserva.cancha || "",
        fecha: reserva.fecha,
        horaInicio: reserva.horaInicio || "",
        horaFin: reserva.horaFin || "",
        reservaGrupoId: grupoId,
        creadorUid: user.uid,
        creadorNombre: nombreCorto,
        editoresUids: cargaJugadores ? [...new Set(uids.filter((u) => u !== user.uid))].slice(0, 16) : [],
        edicionAbierta: false,
        nombre: nombre.trim().slice(0, 60) || "Mini torneo",
        modo,
        formato: plan.formato,
        partidoA: plan.partidoA,
        canchas: plan.canchas,
        jugadores: jugadoresPublicos(jugadores),
        parejas: plan.parejas,
        grupos: plan.grupos,
        partidos: plan.partidos,
        descansos: plan.descansos,
        llave: plan.llave,
        rondas: plan.rondas ?? null,
        estimacionMin: plan.estimacionMin,
        minutosTurno: plan.minutosTurno,
        motivo: plan.motivo || "",
        // Solo cuando se pidió (así los documentos sin 3° puesto no dependen del campo nuevo en las reglas)
        ...(plan.tercerPuesto ? { tercerPuesto: true } : {}),
      };
      const id = await crearMiniTorneo(clubId, datos);
      toast.success("¡Listo! Ya pueden empezar a jugar");
      onCreado(id);
    } catch (err) {
      console.error("No se pudo crear el mini torneo:", err);
      toast.error("No pudimos crear el mini torneo. Probá de nuevo.");
      setCreando(false);
    }
  };

  const hayParejas = n >= MIN_JUGADORES && n % 2 === 0;
  const parejasAuto = modo === "auto" && !plan.error ? plan.parejas : [];
  const opcionActual = opciones.find((o) => o.formato === formatoVisible);

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-4">
      {volver}
      <header>
        <p className="pd-eyebrow">{formatDiaCorto(reserva.fecha)}</p>
        <h1 className="display-lg">Mini torneo</h1>
        <p className="body-sm text-ink-2 mt-1 pd-tnum">
          {clubNombre || "Club"} · {reserva.canchaName || reserva.cancha || "Cancha"} · {rangoHoras(reserva.horaInicio, reserva.horaFin)}
        </p>
      </header>

      <Card>
        <Card.Title as="h2">¿Quiénes juegan?</Card.Title>
        <p className="body-sm text-ink-2 mt-1">Sumá a todos los que juegan: se juega en parejas fijas, de {MIN_JUGADORES} a {MAX_JUGADORES} jugadores. En el torneo se ven solo los nombres de pila.</p>

        <form className="mt-3 flex gap-2 items-end" onSubmit={sumarNombre}>
          <Field label="Agregar jugador" className="flex-1 min-w-0">
            <Input value={nombreNuevo} onChange={(e) => setNombreNuevo(e.target.value)} maxLength={40} placeholder="Nombre (Enter para sumar)" disabled={lleno} enterKeyHint="done" autoComplete="off" />
          </Field>
          <Button type="submit" icon={<Plus className="pd-icon" size={18} aria-hidden="true" />} disabled={!nombreNuevo.trim() || lleno}>
            Agregar
          </Button>
        </form>

        {sugerencias.length > 0 && !lleno && (
          <div className="mt-3">
            <p className="pd-label m-0">Del turno</p>
            <div className="pd-pills mt-2">
              {sugerencias.map((s) => (
                <button key={s.clave} type="button" className="pd-pill" onClick={() => sumar(s)} aria-label={`Sumar a ${s.nombre}`}>
                  <Plus className="pd-icon" size={14} aria-hidden="true" />
                  {s.nombre}
                </button>
              ))}
            </div>
          </div>
        )}

        <ol className="m-0 mt-4 p-0 list-none divide-y divide-line border-t border-b border-line">
          {lista.map((j, i) => (
            <li key={j.clave} className="py-2 flex items-center gap-2 min-h-12">
              <span className="pd-avatar pd-avatar-sm pd-tnum" aria-hidden="true">
                {i + 1}
              </span>
              <span className="body-md flex-1 min-w-0 truncate">
                {j.nombre}
                {j.vos && (
                  <Badge tone="court" className="ml-2">
                    vos
                  </Badge>
                )}
              </span>
              {verNiveles && (
                <Select aria-label={`Nivel de ${j.nombre}`} value={j.nivel} onChange={(e) => cambiarNivel(j.clave, e.target.value)} className="w-28!">
                  <option value="">Sin nivel</option>
                  {NIVELES.map((nv) => (
                    <option key={nv} value={nv}>
                      {nv}
                    </option>
                  ))}
                </Select>
              )}
              {j.vos ? (
                <span className="w-9 flex-none" aria-hidden="true" />
              ) : (
                <Button variant="ghost" size="sm" iconOnly aria-label={`Sacar a ${j.nombre}`} icon={<X className="pd-icon" size={16} aria-hidden="true" />} onClick={() => sacar(j.clave)} />
              )}
            </li>
          ))}
        </ol>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className={`body-sm m-0 pd-tnum ${hayParejas ? "text-ink" : "text-ink-2"}`} aria-live="polite">
            <strong>{textoContador(n)}</strong>
          </p>
          <Button variant="ghost" size="sm" onClick={() => setVerNiveles((v) => !v)} aria-expanded={verNiveles}>
            {verNiveles ? "Ocultar niveles" : "Agregar niveles (opcional)"}
          </Button>
        </div>
        {verNiveles && <p className="pd-help mt-1 mb-0">El nivel solo sirve para sortear parejas equilibradas (el mejor con el más flojo).</p>}
      </Card>

      <Card>
        <Card.Title as="h2">Cómo se juega</Card.Title>
        <div className="mt-3 grid gap-4">
          <Field label="Modo" help={modo === "auto" ? "La app elige el formato y sortea las parejas. Podés cambiar el formato." : "Elegís el formato, la duración y quién juega con quién."} as="div">
            <Pills
              items={[
                { value: "auto", label: "Automático" },
                { value: "manual", label: "Manual" },
              ]}
              value={modo}
              onChange={cambiarModo}
              ariaLabel="Modo"
            />
          </Field>
          <Field label="Canchas" help="Si reservaron más de una cancha a la misma hora, se juega en paralelo." as="div">
            <Pills items={Array.from({ length: MAX_CANCHAS }, (_, i) => ({ value: i + 1, label: String(i + 1) }))} value={canchas} onChange={setCanchas} ariaLabel="Canchas" />
          </Field>

          <div className="grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="pd-label">Formato</span>
              {modo === "auto" && (
                <span className="pd-btn-group">
                  {formatoElegido && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setFormatoElegido(null);
                        setVerOpciones(false);
                      }}
                    >
                      Que elija la app
                    </Button>
                  )}
                  <Button size="sm" onClick={() => setVerOpciones((v) => !v)} aria-expanded={verOpciones}>
                    {verOpciones ? "Listo" : "Cambiar"}
                  </Button>
                </span>
              )}
            </div>
            {modo === "auto" && !verOpciones && (
              <OpcionFormato opcion={opcionActual} minutosTurno={minutosTurno} seleccionada etiqueta={formatoElegido ? "Elegido por vos" : "Elegido por la app"} vacio={hayParejas ? "" : "Sumá jugadores para ver qué formato conviene."} />
            )}
            {(modo === "manual" || verOpciones) && (
              <div role="radiogroup" aria-label="Formato" className="grid gap-2">
                {opciones.map((o) => (
                  <OpcionFormato
                    key={o.formato}
                    opcion={o}
                    minutosTurno={minutosTurno}
                    seleccionada={o.formato === formatoVisible}
                    onElegir={() => {
                      if (modo === "manual") setFormatoManual(o.formato);
                      else {
                        setFormatoElegido(o.formato);
                        setVerOpciones(false);
                      }
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {admiteTercerPuesto(formatoVisible, n) && (
            <label className="flex items-start gap-2 body-sm">
              <input type="checkbox" checked={tercerPuesto} onChange={(e) => setTercerPuesto(e.target.checked)} className="mt-1" />
              <span>Jugar el partido por el 3° puesto (entre quienes pierden las semis)</span>
            </label>
          )}

          {modo === "manual" && (
            <>
              <Field label="Cada partido" as="div">
                <div className="flex flex-wrap items-center gap-2">
                  <Pills
                    items={[
                      { value: "games", label: "A games" },
                      { value: "minutos", label: "Por tiempo" },
                    ]}
                    value={partidoA.tipo}
                    onChange={(tipo) => setPartidoA({ tipo, valor: tipo === "minutos" ? 15 : 4 })}
                    ariaLabel="Duración de cada partido"
                  />
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={partidoA.tipo === "minutos" ? 5 : 1}
                    max={partidoA.tipo === "minutos" ? 60 : 9}
                    value={partidoA.valor}
                    onChange={(e) => setPartidoA({ ...partidoA, valor: e.target.value })}
                    className="w-20!"
                    aria-label={partidoA.tipo === "minutos" ? "Minutos por partido" : "Games para ganar"}
                  />
                  <span className="body-sm text-ink-2">{partidoA.tipo === "minutos" ? "minutos" : "games"}</span>
                </div>
              </Field>
              {formatoManual === "rey" && (
                <Field label="Partidos" help="Vacío: los que entren en el turno.">
                  <Input type="number" inputMode="numeric" min={1} max={MAX_PARTIDOS_REY} value={partidosRey} onChange={(e) => setPartidosRey(e.target.value)} className="w-24!" />
                </Field>
              )}
            </>
          )}

          {hayParejas && (
            <div className="grid gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="pd-label">Parejas</span>
                {modo === "manual" && (
                  <span className="pd-btn-group">
                    <Button size="sm" icon={<Shuffle className="pd-icon" size={16} aria-hidden="true" />} onClick={() => sortearManual("azar")}>
                      Sortear
                    </Button>
                    {conNiveles && (
                      <Button size="sm" onClick={() => sortearManual("nivel")}>
                        Por nivel
                      </Button>
                    )}
                  </span>
                )}
              </div>
              {modo === "auto" && (
                <>
                  {conNiveles && (
                    <Pills
                      items={[
                        { value: "nivel", label: "Equilibradas por nivel" },
                        { value: "azar", label: "Al azar" },
                      ]}
                      value={criterioAuto}
                      onChange={setCriterio}
                      ariaLabel="Cómo se sortean las parejas"
                    />
                  )}
                  {parejasAuto.length > 0 && (
                    <ol className="m-0 p-0 list-none grid gap-1 body-sm">
                      {parejasAuto.map((p, i) => (
                        <li key={p.id}>
                          <span className="text-ink-3">Pareja {i + 1}:</span> <strong>{p.nombrePareja}</strong>
                          {p.grupo ? <span className="text-ink-3"> · Grupo {p.grupo}</span> : null}
                        </li>
                      ))}
                    </ol>
                  )}
                  {parejasAuto.length > 0 && (
                    <div>
                      <Button size="sm" icon={<Shuffle className="pd-icon" size={16} aria-hidden="true" />} onClick={() => setSeed(nuevaSemilla())}>
                        Sortear de nuevo
                      </Button>
                    </div>
                  )}
                </>
              )}
              {modo === "manual" && (
                <>
                  {Array.from({ length: n / 2 }, (_, pi) => (
                    <div key={pi} className="grid grid-cols-[auto_1fr_1fr] items-center gap-2">
                      <span className="body-sm text-ink-3 pd-tnum">Pareja {pi + 1}</span>
                      {[0, 1].map((lado) => (
                        <Select key={lado} aria-label={`Pareja ${pi + 1}, jugador ${lado + 1}`} value={parejasManual[pi]?.[lado] || ""} onChange={(e) => elegirEnPareja(pi, lado, e.target.value)}>
                          <option value="">Elegí</option>
                          {lista.map((j) => (
                            <option key={j.clave} value={j.clave}>
                              {nombreDeClave[j.clave]}
                            </option>
                          ))}
                        </Select>
                      ))}
                    </div>
                  ))}
                  {!parejasCompletas && <p className="pd-help m-0">Elegí quién juega con quién, o tocá Sortear y retocá.</p>}
                </>
              )}
            </div>
          )}

          <label className="flex items-start gap-2 body-sm">
            <input type="checkbox" checked={cargaJugadores} onChange={(e) => setCargaJugadores(e.target.checked)} className="mt-1" />
            <span>Que los jugadores con cuenta de Padely también puedan cargar resultados</span>
          </label>
          <Field label="Nombre">
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} />
          </Field>
        </div>
      </Card>

      <Card variant="night">
        <Card.Eyebrow>Así queda</Card.Eyebrow>
        {plan.error ? (
          <p className="body-md mt-2">{plan.error}</p>
        ) : (
          <>
            <Card.Row className="mt-2">
              <Card.Title as="h2">{FORMATOS[plan.formato].label}</Card.Title>
              <Badge tone={plan.entra ? "success" : "warning"}>{plan.entra ? "Entra en el turno" : "No entra en el turno"}</Badge>
            </Card.Row>
            <p className="body-sm mt-1">{plan.motivo || FORMATOS[plan.formato].ayuda}</p>
            <ul className="m-0 mt-3 p-0 list-none grid gap-1 body-sm pd-tnum">
              <li>
                {plan.parejas.length} parejas · {textoPartidoA(plan.partidoA)}
              </li>
              <li>
                {plan.totalPartidos} partidos
                {plan.formato === "rey" ? " en una cancha, uno atrás del otro" : ""}
                {plan.formato === "grupos" ? ` (${plan.grupos.map((g) => `grupo ${g.nombre} de ${g.parejas.length}`).join(", ")}, semis y final${plan.tercerPuesto ? " y 3° puesto" : ""})` : ""}
                {plan.formato === "eliminacion" && plan.tercerPuesto ? " (con el 3° puesto)" : ""}
              </li>
              <li>
                Estimado: <strong>{plan.estimacionMin} min</strong> de {plan.minutosTurno} min del turno (con {MIN_CALENTAMIENTO} min para calentar)
              </li>
            </ul>
            {!plan.entra && <p className="body-sm mt-3">Probá con más canchas, otro formato o el modo manual con partidos más cortos.</p>}
          </>
        )}
      </Card>

      {!plan.error && plan.formato && <Alert tone="neutral">No suma puntos ni cuenta para rankings, torneos ni el Pase. Es solo para jugar.</Alert>}
      <Button variant="primary" block disabled={!!falta} cargando={creando ? "Creando…" : ""} onClick={crear} icon={<Trophy className="pd-icon" size={20} aria-hidden="true" />}>
        {falta || "Crear mini torneo"}
      </Button>
    </div>
  );
}

// Una opción de formato: nombre, explicación de una línea y la estimación contra el turno (o por qué no se puede)
function OpcionFormato({ opcion, minutosTurno, seleccionada = false, onElegir, etiqueta = "", vacio = "" }) {
  if (!opcion) return vacio ? <p className="body-sm text-ink-3 m-0">{vacio}</p> : null;
  const contenido = (
    <>
      <span className="flex flex-wrap items-center justify-between gap-2">
        <span className="heading-sm">{opcion.label}</span>
        {opcion.valido ? (
          <Badge tone={opcion.entra ? "success" : "warning"} className="pd-tnum">
            ≈ {opcion.estimacionMin} de {minutosTurno} min
          </Badge>
        ) : (
          <Badge>{opcion.motivo}</Badge>
        )}
      </span>
      <span className="body-sm text-ink-2">{opcion.ayuda}</span>
      {etiqueta && <span className="body-sm text-ink-3">{etiqueta}</span>}
    </>
  );
  const clases = `w-full text-left rounded-md border p-3 flex flex-col gap-1 ${seleccionada ? "border-ink bg-surface-sunken" : "border-line bg-surface-raised"}`;
  if (!onElegir) return <div className={clases}>{contenido}</div>;
  return (
    <button type="button" role="radio" aria-checked={seleccionada} disabled={!opcion.valido} onClick={onElegir} className={`${clases} ${opcion.valido ? "cursor-pointer hover:bg-surface-hover" : "opacity-60 cursor-not-allowed"}`}>
      {contenido}
    </button>
  );
}
