import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Plus, Shuffle, Trophy, X } from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuthStore } from "../store/authStore";
import { cargarFlags } from "../services/flagsService";
import { crearMiniTorneo } from "../services/miniTorneoService";
import { participantesActivos } from "../utils/cuentas";
import { NIVELES } from "../utils/categorias";
import { formatDiaCorto, getTodayLocal } from "../utils/formatDate";
import { normalizarReserva, rangoHoras } from "../utils/reservas";
import {
  FORMATOS,
  MAX_CANCHAS,
  MAX_JUGADORES,
  MIN_CALENTAMIENTO,
  MIN_JUGADORES,
  armarMiniTorneo,
  armarParejas,
  esDeParejas,
  formatosPosibles,
  hayNiveles,
  jugadoresPublicos,
  nombresCortos,
  partidosPorJugadorAmericano,
  prepararJugadores,
  rondasAmericanoCompleto,
  textoPartidoA,
} from "../utils/miniTorneo";
import { toast } from "../components/Toast";
import { Alert, Badge, Button, Card, Field, Input, Pills, Select } from "../components/ui";

// Armar un mini torneo para una reserva (/mini/nuevo/:clubId/:grupoId): quien reservó o alguien de la cuenta del
// turno elige quiénes juegan (los de la cuenta + nombres sueltos), el modo (automático: la app arma parejas y formato;
// manual: los elige) y ve la estimación de tiempo contra la duración del turno. Detrás de flags.miniTorneo.
let siguienteClave = 1;
const nuevaClave = () => `x${siguienteClave++}`;

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

function jugadoresIniciales({ cuenta, reserva, user, perfil }) {
  const lista = [];
  const vistos = new Set();
  participantesActivos(cuenta || {}).forEach((p) => {
    if (p.uid && vistos.has(p.uid)) return;
    if (p.uid) vistos.add(p.uid);
    lista.push({ clave: nuevaClave(), nombre: p.nombre || "Jugador", uid: p.uid || null, nivel: p.uid === user.uid ? perfil?.nivel || "" : "", incluido: true });
  });
  if (!vistos.has(user.uid)) lista.unshift({ clave: nuevaClave(), nombre: perfil?.nombre || reserva?.nombreJugador || user.displayName || "Yo", uid: user.uid, nivel: perfil?.nivel || "", incluido: true });
  return lista;
}

function Formulario({ clubId, grupoId, reserva, cuenta, clubNombre, user, perfil, volver, onCreado }) {
  const [lista, setLista] = useState(() => jugadoresIniciales({ cuenta, reserva, user, perfil }));
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [modo, setModo] = useState("auto");
  const [canchas, setCanchas] = useState(1);
  const [formato, setFormato] = useState("americano");
  const [partidoA, setPartidoA] = useState({ tipo: "games", valor: 4 });
  const [rondas, setRondas] = useState("");
  const [parejasManual, setParejasManual] = useState([]); // [[claveA, claveB]]
  const [seed, setSeed] = useState(() => Date.now() % 1000000007);
  const [cargaJugadores, setCargaJugadores] = useState(true);
  const [nombre, setNombre] = useState(() => `Mini torneo del ${formatDiaCorto(reserva.fecha)}`);
  const [creando, setCreando] = useState(false);

  const incluidos = useMemo(() => lista.filter((j) => j.incluido), [lista]);
  const n = incluidos.length;
  const posibles = formatosPosibles(n);
  const formatoManual = posibles.includes(formato) ? formato : "americano";

  // Clave de la UI → id del jugador (j1…): el orden de los incluidos
  const jugadores = useMemo(() => prepararJugadores(incluidos.map((j) => ({ nombre: j.nombre, nivel: j.nivel, uid: j.uid }))), [incluidos]);
  const idDeClave = useMemo(() => Object.fromEntries(incluidos.map((j, i) => [j.clave, jugadores[i]?.id])), [incluidos, jugadores]);
  const parejasIds = useMemo(() => parejasManual.map(([a, b]) => [idDeClave[a], idDeClave[b]]).filter(([a, b]) => a && b), [parejasManual, idDeClave]);
  const parejasCompletas = esDeParejas(formatoManual) && parejasIds.length * 2 === n;

  // El americano de 12 a 16 jugadores tarda unos cientos de ms en armarse: el cálculo va diferido
  const entradaActual = useMemo(
    () => ({
      jugadores,
      modo,
      formato: modo === "manual" ? formatoManual : undefined,
      parejas: modo === "manual" && parejasCompletas ? parejasIds : undefined,
      canchas,
      partidoA: modo === "manual" ? partidoA : undefined,
      rondas: modo === "manual" && formatoManual === "americano" && Number(rondas) > 0 ? Number(rondas) : undefined,
      horaInicio: reserva.horaInicio,
      horaFin: reserva.horaFin,
      turnos: reserva.turnos,
      seed,
    }),
    [jugadores, modo, formatoManual, parejasIds, parejasCompletas, canchas, partidoA, rondas, reserva, seed],
  );
  const entrada = useDeferredValue(entradaActual);
  const plan = useMemo(() => {
    try {
      return { ...armarMiniTorneo(entrada), error: "" };
    } catch (err) {
      return { error: err?.message || "No se puede armar con estos datos" };
    }
  }, [entrada]);

  const cambiar = (clave, cambios) => setLista((l) => l.map((j) => (j.clave === clave ? { ...j, ...cambios } : j)));
  const sumarNombre = (e) => {
    e?.preventDefault?.();
    const limpio = nombreNuevo.trim().slice(0, 40);
    if (!limpio) return;
    if (n >= MAX_JUGADORES) {
      toast.error(`Como máximo ${MAX_JUGADORES} jugadores`);
      return;
    }
    setLista((l) => [...l, { clave: nuevaClave(), nombre: limpio, uid: null, nivel: "", incluido: true }]);
    setNombreNuevo("");
  };
  const armarParejasManual = (criterio) => {
    try {
      const armadas = armarParejas(jugadores, { criterio, seed: Date.now() % 1000000007 });
      const claveDeId = Object.fromEntries(Object.entries(idDeClave).map(([k, v]) => [v, k]));
      setParejasManual(armadas.map((p) => p.jugadores.map((id) => claveDeId[id])));
    } catch (err) {
      toast.error(err?.message || "No se pudieron armar las parejas");
    }
  };
  const elegirEnPareja = (pi, lado, clave) =>
    setParejasManual((ps) => {
      const copia = ps.map((p) => [...p]);
      while (copia.length < n / 2) copia.push(["", ""]);
      copia.forEach((p) => p.forEach((c, i) => c === clave && (p[i] = "")));
      copia[pi][lado] = clave;
      return copia;
    });

  const crear = async () => {
    if (plan.error) return;
    setCreando(true);
    try {
      const uids = jugadores.map((j) => j.uid).filter(Boolean);
      const [creadorNombre] = nombresCortos([perfil?.nombre || user.displayName || "Jugador"]);
      const datos = {
        clubNombre: clubNombre || "",
        canchaNombre: reserva.canchaName || reserva.cancha || "",
        fecha: reserva.fecha,
        horaInicio: reserva.horaInicio || "",
        horaFin: reserva.horaFin || "",
        reservaGrupoId: grupoId,
        creadorUid: user.uid,
        creadorNombre,
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

  const pj = plan.formato === "americano" && !plan.error ? partidosPorJugadorAmericano(n, plan.canchas, plan.rondas) : null;
  const parejasVista = !plan.error && esDeParejas(plan.formato) ? plan.parejas : [];

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
        <p className="body-sm text-ink-2 mt-1">
          De {MIN_JUGADORES} a {MAX_JUGADORES}. En el torneo se ven solo los nombres de pila. El nivel es opcional: sirve para armar parejas parejas.
        </p>
        <ul className="m-0 mt-3 p-0 list-none divide-y divide-line">
          {lista.map((j) => (
            <li key={j.clave} className="py-2 flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 min-w-0 flex-1 body-sm">
                <input type="checkbox" checked={j.incluido} disabled={j.uid === user.uid} onChange={(e) => cambiar(j.clave, { incluido: e.target.checked })} />
                <span className="truncate">
                  {j.nombre}
                  {j.uid === user.uid ? " (vos)" : ""}
                </span>
                {j.uid && j.uid !== user.uid && <Badge>Padely</Badge>}
              </label>
              <Select aria-label={`Nivel de ${j.nombre}`} value={j.nivel} onChange={(e) => cambiar(j.clave, { nivel: e.target.value })} className="w-auto!">
                <option value="">Sin nivel</option>
                {NIVELES.map((nv) => (
                  <option key={nv} value={nv}>
                    {nv}
                  </option>
                ))}
              </Select>
              {!j.uid && (
                <Button variant="ghost" size="sm" iconOnly aria-label={`Sacar a ${j.nombre}`} icon={<X className="pd-icon" size={16} aria-hidden="true" />} onClick={() => setLista((l) => l.filter((x) => x.clave !== j.clave))} />
              )}
            </li>
          ))}
        </ul>
        <form className="mt-3 flex gap-2 items-end" onSubmit={sumarNombre}>
          <Field label="Sumar a alguien por nombre" className="flex-1">
            <Input value={nombreNuevo} onChange={(e) => setNombreNuevo(e.target.value)} maxLength={40} placeholder="Ej.: Fede" />
          </Field>
          <Button type="submit" icon={<Plus className="pd-icon" size={18} aria-hidden="true" />} disabled={!nombreNuevo.trim()}>
            Sumar
          </Button>
        </form>
        <p className="body-sm text-ink-3 mt-2 pd-tnum">{n} {n === 1 ? "jugador" : "jugadores"}</p>
      </Card>

      <Card>
        <Card.Title as="h2">Cómo se juega</Card.Title>
        <div className="mt-3 grid gap-4">
          <Field label="Modo" as="div">
            <Pills
              items={[
                { value: "auto", label: "Automático" },
                { value: "manual", label: "Manual" },
              ]}
              value={modo}
              onChange={setModo}
              ariaLabel="Modo"
            />
          </Field>
          <Field label="Canchas" help="Si reservaron más de una cancha a la misma hora, se juega en paralelo." as="div">
            <Pills items={Array.from({ length: MAX_CANCHAS }, (_, i) => ({ value: i + 1, label: String(i + 1) }))} value={canchas} onChange={setCanchas} ariaLabel="Canchas" />
          </Field>
          {modo === "manual" && (
            <>
              <Field label="Formato" help={FORMATOS[formatoManual]?.ayuda}>
                <Select value={formatoManual} onChange={(e) => setFormato(e.target.value)}>
                  {posibles.map((f) => (
                    <option key={f} value={f}>
                      {FORMATOS[f].label}
                    </option>
                  ))}
                </Select>
              </Field>
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
                    className="w-24!"
                    aria-label={partidoA.tipo === "minutos" ? "Minutos por partido" : "Games para ganar"}
                  />
                  <span className="body-sm text-ink-2">{partidoA.tipo === "minutos" ? "minutos" : "games"}</span>
                </div>
              </Field>
              {formatoManual === "americano" && n >= MIN_JUGADORES && (
                <Field label="Rondas" help={`Con ${rondasAmericanoCompleto(n, canchas)} todos juegan con todos. Vacío: lo que entre en el turno.`}>
                  <Input type="number" inputMode="numeric" min={1} max={60} value={rondas} onChange={(e) => setRondas(e.target.value)} className="w-24!" />
                </Field>
              )}
              {esDeParejas(formatoManual) && (
                <div className="grid gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="pd-label">Parejas</span>
                    <span className="pd-btn-group">
                      <Button size="sm" icon={<Shuffle className="pd-icon" size={16} aria-hidden="true" />} onClick={() => armarParejasManual("azar")}>
                        Al azar
                      </Button>
                      <Button size="sm" disabled={!hayNiveles(jugadores)} onClick={() => armarParejasManual("nivel")}>
                        Por nivel
                      </Button>
                    </span>
                  </div>
                  {Array.from({ length: Math.floor(n / 2) }, (_, pi) => (
                    <div key={pi} className="flex items-center gap-2">
                      <span className="body-sm text-ink-3 w-6 pd-tnum">{pi + 1}</span>
                      {[0, 1].map((lado) => (
                        <Select key={lado} aria-label={`Pareja ${pi + 1}, jugador ${lado + 1}`} value={parejasManual[pi]?.[lado] || ""} onChange={(e) => elegirEnPareja(pi, lado, e.target.value)}>
                          <option value="">Elegí</option>
                          {incluidos.map((j) => (
                            <option key={j.clave} value={j.clave}>
                              {jugadores[incluidos.indexOf(j)]?.nombre || j.nombre}
                            </option>
                          ))}
                        </Select>
                      ))}
                    </div>
                  ))}
                  {!parejasCompletas && <p className="pd-help m-0">Si no completás las parejas, la app las arma {hayNiveles(jugadores) ? "por nivel" : "al azar"}.</p>}
                </div>
              )}
            </>
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
            {plan.motivo && <p className="body-sm mt-1">{plan.motivo}</p>}
            <ul className="m-0 mt-3 p-0 list-none grid gap-1 body-sm pd-tnum">
              <li>{textoPartidoA(plan.partidoA)}</li>
              <li>
                {plan.partidos.length + (plan.llave ? plan.llave.rondas.reduce((a, r) => a + r.partidos.length, 0) : 0)} partidos
                {plan.formato === "americano" ? ` en ${plan.rondas} rondas` : ""}
                {pj ? ` · cada uno juega ${pj.min === pj.max ? pj.min : `${pj.min} o ${pj.max}`}` : ""}
              </li>
              <li>
                Estimado: <strong>{plan.estimacionMin} min</strong> de {plan.minutosTurno} min del turno (con {MIN_CALENTAMIENTO} min para calentar)
              </li>
            </ul>
            {parejasVista.length > 0 && (
              <ul className="m-0 mt-3 p-0 list-none flex flex-wrap gap-2">
                {parejasVista.map((p) => (
                  <li key={p.id}>
                    <Badge tone="night">
                      {p.grupo ? `${p.grupo} · ` : ""}
                      {p.nombrePareja}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
            {!plan.entra && <p className="body-sm mt-3">Probá con más canchas, menos jugadores o el modo manual con partidos más cortos.</p>}
          </>
        )}
      </Card>

      {!plan.error && plan.formato && (
        <Alert tone="neutral">No suma puntos ni cuenta para rankings, torneos ni el Pase. Es solo para jugar.</Alert>
      )}
      <div className="pd-btn-group">
        <Button variant="primary" disabled={!!plan.error} cargando={creando ? "Creando…" : ""} onClick={crear} icon={<Trophy className="pd-icon" size={20} aria-hidden="true" />}>
          Crear mini torneo
        </Button>
        <Button icon={<Shuffle className="pd-icon" size={20} aria-hidden="true" />} onClick={() => setSeed(Date.now() % 1000000007)}>
          Sortear de nuevo
        </Button>
      </div>
    </div>
  );
}
