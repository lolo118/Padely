import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Copy, Link2, MessageCircle, Trophy } from "lucide-react";
import { entrarAnonimo } from "../lib/firebase";
import { useAuthStore } from "../store/authStore";
import { actualizarMiniTorneo, borrarMiniTorneo, escucharMiniTorneo, guardarResultados, leerClaveEdicion, renovarClaveEdicion, soyEditorPorLink, sumarmeComoEditor } from "../services/miniTorneoService";
import { getGanador, nombreRonda } from "../utils/torneo";
import { linkWhatsApp } from "../utils/cuentas";
import { formatDiaCorto } from "../utils/formatDate";
import { rangoHoras } from "../utils/reservas";
import {
  FORMATOS,
  aplicarResultado,
  avanzanPorGrupo,
  gamesDe,
  mensajeMini,
  permiteEmpate,
  podio as calcularPodio,
  progreso,
  rondasDeLlave,
  resultadoDe,
  tablaAmericano,
  tablaParejas,
  tercerPuestoDe,
  textoPartidoA,
  urlMini,
  validarResultado,
} from "../utils/miniTorneo";
import Dialogo from "../components/Dialogo";
import { confirmar } from "../components/ConfirmDialog";
import { toast } from "../components/Toast";
import { Alert, Badge, Button, Card, ChampionCard, Field, Input, MatchCard, Standings, Tabs } from "../components/ui";

// Mini torneo de un turno (/mini/:clubId/:id): vista pública y en vivo (link para WhatsApp: solo nombres de pila).
// Parejas fijas (americano, liguilla, torneo común, eliminación, rey de la cancha); los mini torneos viejos de
// compañeros rotativos (formato "americano") se siguen viendo. En el rey de la cancha, el partido siguiente se arma al
// cargar el resultado (aplicarResultado).
// Cargan resultados quien lo creó, los editores (editoresUids) y, con la carga abierta, quien entra con el link de carga
// (?carga=<clave>, aun sin cuenta: sesión anónima). Tabla en vivo, cuadro y podio al final. No suma puntos.
export default function MiniTorneo() {
  const { clubId, id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const [estado, setEstado] = useState({ mini: null, cargado: false, error: false });
  const [vista, setVista] = useState("partidos");
  const [editando, setEditando] = useState(null); // partido
  const [editorPorLink, setEditorPorLink] = useState(false);
  const [claveCarga] = useState(() => params.get("carga"));

  useEffect(() => {
    if (!clubId || !id) return undefined;
    const unsub = escucharMiniTorneo(
      clubId,
      id,
      (mini) => setEstado({ mini, cargado: true, error: false }),
      (err) => {
        console.error("Error leyendo el mini torneo:", err);
        setEstado({ mini: null, cargado: true, error: true });
      },
    );
    return () => unsub();
  }, [clubId, id]);

  const { mini } = estado;
  const uid = user?.uid || null;
  useEffect(() => {
    if (!uid || !mini?.edicionAbierta) return undefined;
    let vivo = true;
    soyEditorPorLink(clubId, id, uid).then((si) => vivo && si && setEditorPorLink(true));
    return () => {
      vivo = false;
    };
  }, [clubId, id, uid, mini?.edicionAbierta]);

  const esCreador = !!uid && mini?.creadorUid === uid;
  const puedeCargar = !!uid && !!mini && (esCreador || (mini.editoresUids || []).includes(uid) || (mini.edicionAbierta && editorPorLink));

  // Link de carga (?carga=clave): se anota como editor (con la sesión que haya, o una anónima) y se limpia la URL
  const [sumandome, setSumandome] = useState(false);
  const entrarConLink = async () => {
    if (!claveCarga) return;
    setSumandome(true);
    try {
      const u = user || (await entrarAnonimo());
      await sumarmeComoEditor(clubId, id, u.uid, claveCarga);
      setEditorPorLink(true);
      setParams(
        (p) => {
          p.delete("carga");
          return p;
        },
        { replace: true },
      );
      toast.success("Listo: ya podés cargar resultados");
    } catch (err) {
      console.error("No se pudo entrar con el link de carga:", err);
      toast.error("Este link de carga ya no sirve. Pedile uno nuevo a quien armó el torneo.");
    } finally {
      setSumandome(false);
    }
  };

  const podio = useMemo(() => (mini ? calcularPodio(mini) : null), [mini]);
  const avance = useMemo(() => (mini ? progreso(mini) : { hechos: 0, total: 0 }), [mini]);

  if (!estado.cargado) {
    return (
      <div className="max-w-2xl mx-auto flex flex-col gap-4" aria-busy="true" aria-label="Cargando">
        <div className="pd-skeleton h-8 w-48" />
        <div className="pd-skeleton h-40 rounded-lg" />
      </div>
    );
  }
  if (!mini) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card className="text-center">
          <Trophy className="pd-icon-lg mx-auto mb-3 text-ink-3" size={24} aria-hidden="true" />
          <p className="heading-sm">{estado.error ? "No pudimos abrir este mini torneo" : "Este mini torneo no existe"}</p>
          <p className="body-sm text-ink-2 mt-1">Puede que lo hayan borrado. Pedí el link de nuevo.</p>
        </Card>
      </div>
    );
  }

  const nombreJugador = Object.fromEntries((mini.jugadores || []).map((j) => [j.id, j.nombre]));
  const equipo = (ids) => (ids || []).map((x) => nombreJugador[x] || "?").join(" / ");
  const nombreLado = (p, lado) => (p.equipo1 ? equipo(lado === 1 ? p.equipo1 : p.equipo2) : (lado === 1 ? p.pareja1 : p.pareja2)?.nombrePareja || "Por definir");
  const terminado = mini.estado === "finalizado";
  const hayCuadro = mini.formato === "grupos" || mini.formato === "eliminacion";
  const rondasLlave = rondasDeLlave(mini.llave);
  const tercero = tercerPuestoDe(mini);
  const esRey = mini.formato === "rey";
  const reyFaltan = esRey ? Math.max(0, (Number(mini.rondas) || 0) - (mini.partidos || []).length) : 0;
  const tarjetasCuadro = (soloConParejas) => (
    <>
      {rondasLlave.map((r, ri) => {
        const lista = soloConParejas ? r.filter((p) => p.pareja1 || p.pareja2) : r;
        if (!lista.length) return null;
        return (
          <section key={ri} className="flex flex-col gap-3">
            <h2 className="heading-md m-0">{nombreRonda(rondasLlave.length, ri)}</h2>
            {lista.map((p) => tarjetaPartido({ ...p, fase: "llave" }, nombreRonda(rondasLlave.length, ri), ri === rondasLlave.length - 1 ? "final" : ri === rondasLlave.length - 2 ? "semi" : "default"))}
          </section>
        );
      })}
      {tercero && (!soloConParejas || tercero.pareja1 || tercero.pareja2) && (
        <section className="flex flex-col gap-3">
          <h2 className="heading-md m-0">3° puesto</h2>
          {tarjetaPartido({ ...tercero, fase: "llave" }, "3° puesto")}
        </section>
      )}
    </>
  );

  const guardar = async (partido, resultado) => {
    const r = aplicarResultado(mini, partido.id, resultado);
    if (r.error) {
      toast.error(r.error);
      return false;
    }
    try {
      await guardarResultados(clubId, id, r);
      if (r.estado === "finalizado" && mini.estado !== "finalizado") toast.success("¡Terminó el mini torneo!");
      return true;
    } catch (err) {
      console.error("No se pudo guardar el resultado:", err);
      toast.error("No pudimos guardar el resultado. Probá de nuevo.");
      return false;
    }
  };

  function tarjetaPartido(p, eyebrow, variant = "default") {
    const g = gamesDe(p.resultado);
    const ganador = g ? (getGanador(p.resultado) === 1 ? 0 : getGanador(p.resultado) === 2 ? 1 : null) : null;
    const jugable = p.fase === "americano" || (p.pareja1 && p.pareja2);
    const clickable = puedeCargar && jugable;
    return (
      <MatchCard
        key={p.id}
        ronda={eyebrow}
        cancha={p.cancha ? `Cancha ${p.cancha}` : ""}
        variant={!jugable ? "pending" : variant}
        parejas={[
          { nombre: nombreLado(p, 1), sets: g ? [g.g1] : [] },
          { nombre: nombreLado(p, 2), sets: g ? [g.g2] : [] },
        ]}
        ganador={ganador}
        foot={clickable ? (g ? "Tocá para corregir" : "Tocá para cargar el resultado") : g ? (ganador === null ? "Empate" : "Jugado") : jugable ? "Por jugar" : "Esperando rivales"}
        onClick={clickable ? () => setEditando(p) : undefined}
        role={clickable ? "button" : undefined}
        tabIndex={clickable ? 0 : undefined}
        onKeyDown={clickable ? (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setEditando(p)) : undefined}
      />
    );
  }

  // Partidos de la fase de rondas (americano, todos contra todos y grupos), por ronda
  const rondas = [...new Set((mini.partidos || []).map((p) => p.ronda))].sort((a, b) => a - b);
  const descansosDe = (r) => (mini.descansos || []).find((d) => d.ronda === r)?.jugadores || [];

  const tabs = [
    { value: "partidos", label: "Partidos" },
    { value: "tabla", label: mini.formato === "eliminacion" ? null : "Tabla" },
    { value: "cuadro", label: hayCuadro ? "Cuadro" : null },
  ].filter((t) => t.label);

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-4">
      <header>
        <p className="pd-eyebrow">{formatDiaCorto(mini.fecha)}</p>
        <h1 className="display-lg">{mini.nombre || "Mini torneo"}</h1>
        <p className="body-sm text-ink-2 mt-1 pd-tnum">
          {[mini.clubNombre, mini.canchaNombre, rangoHoras(mini.horaInicio, mini.horaFin)].filter(Boolean).join(" · ")}
        </p>
        <div className="pd-badge-group mt-2">
          <Badge>{FORMATOS[mini.formato]?.label || "Mini torneo"}</Badge>
          <Badge>{textoPartidoA(mini.partidoA)}</Badge>
          {terminado ? <Badge tone="success">Terminado</Badge> : <Badge dot tone="court">En juego</Badge>}
          <Badge tone="neutral">
            {avance.hechos}/{avance.total} partidos
          </Badge>
        </div>
      </header>

      {claveCarga && !puedeCargar && mini.edicionAbierta && (
        <Alert tone="court">
          <span className="flex flex-wrap items-center justify-between gap-2 w-full">
            Te pasaron el link para cargar resultados.
            <Button size="sm" variant="primary" cargando={sumandome ? "Entrando…" : ""} onClick={entrarConLink}>
              Cargar resultados
            </Button>
          </span>
        </Alert>
      )}
      {claveCarga && !puedeCargar && !mini.edicionAbierta && <Alert tone="warning">La carga de resultados con link está cerrada. Pedile a quien armó el torneo que la abra.</Alert>}

      {terminado && podio && podio.length >= 2 && (
        <>
          <ChampionCard cuadroLabel={FORMATOS[mini.formato]?.label} campeones={podio[0].nombre} subcampeones={podio[1].nombre} torneo={mini.nombre} club={mini.clubNombre} fecha={formatDiaCorto(mini.fecha)} />
          {podio.length > 2 && (
            <p className="body-sm text-ink-2 m-0">
              3° puesto: <strong>{podio.filter((x) => x.puesto === 3).map((x) => x.nombre).join(" y ")}</strong>
            </p>
          )}
        </>
      )}

      {tabs.length > 1 && <Tabs items={tabs} value={vista} onChange={setVista} ariaLabel="Secciones del mini torneo" />}

      {vista === "partidos" && (
        <div className="flex flex-col gap-6">
          {rondas.map((r) => (
            <section key={r} aria-label={`Ronda ${r}`} className="flex flex-col gap-3">
              <h2 className="heading-md m-0">{mini.formato === "grupos" ? `Fecha ${r} de grupos` : esRey ? `Partido ${r}` : `Ronda ${r}`}</h2>
              {(mini.partidos || []).filter((p) => p.ronda === r).map((p) => tarjetaPartido(p, p.grupo ? `Grupo ${p.grupo}` : esRey ? `Partido ${r}` : `Ronda ${r}`))}
              {descansosDe(r).length > 0 && <p className="body-sm text-ink-3 m-0">Descansan: {equipo(descansosDe(r)).replace(/ \/ /g, ", ")}</p>}
            </section>
          ))}
          {esRey && !terminado && reyFaltan > 0 && (
            <p className="body-sm text-ink-3 m-0">
              {reyFaltan === 1 ? "Falta 1 partido" : `Faltan ${reyFaltan} partidos`}: el siguiente aparece cuando cargan este resultado (la pareja que gana se queda).
            </p>
          )}
          {hayCuadro && rondasLlave.length > 0 && tarjetasCuadro(true)}
          {mini.formato === "grupos" && rondasLlave.length === 0 && <p className="body-sm text-ink-3 m-0">El cuadro final aparece cuando terminan los grupos.</p>}
        </div>
      )}

      {vista === "tabla" && mini.formato === "americano" && <TablaAmericano filas={tablaAmericano(mini)} />}
      {vista === "tabla" && (mini.formato === "roundRobin" || esRey) && <Standings grupo="Posiciones" rows={tablaParejas(mini).map((r) => ({ ...r, pts: r.pg }))} help="Pts = partidos ganados. Desempata la diferencia de games." />}
      {vista === "tabla" && mini.formato === "americanoParejas" && <Standings grupo="Posiciones" rows={tablaParejas(mini)} help="Pts = games ganados. Desempatan la diferencia de games y los partidos ganados." />}
      {vista === "tabla" &&
        mini.formato === "grupos" &&
        (mini.grupos || []).map((g) => (
          <Standings
            key={g.nombre}
            grupo={`Grupo ${g.nombre}`}
            rows={tablaParejas(mini, g.nombre).map((r, i) => ({ ...r, pts: r.pg, clasifica: i < avanzanPorGrupo((mini.parejas || []).length) }))}
            help={`${avanzanPorGrupo((mini.parejas || []).length) === 1 ? "El primero pasa" : "Los dos primeros pasan"} al cuadro.`}
          />
        ))}

      {vista === "cuadro" && hayCuadro && (
        <div className="flex flex-col gap-6">
          {rondasLlave.length === 0 ? <p className="body-sm text-ink-3 m-0">El cuadro aparece cuando terminan los grupos.</p> : tarjetasCuadro(false)}
        </div>
      )}

      <Compartir mini={mini} clubId={clubId} id={id} esCreador={esCreador} onBorrado={() => navigate("/mis-reservas")} />
      <p className="body-sm text-ink-3 m-0">Mini torneo entre amigos: no suma puntos ni cuenta para rankings, torneos ni el Pase.</p>

      {editando && (
        <DialogoResultado
          partido={editando}
          mini={mini}
          nombres={[nombreLado(editando, 1), nombreLado(editando, 2)]}
          onCerrar={() => setEditando(null)}
          onGuardar={async (resultado) => (await guardar(editando, resultado)) && setEditando(null)}
        />
      )}
    </div>
  );
}

function TablaAmericano({ filas }) {
  return (
    <div className="pd-table-wrap">
      <div className="pd-table-head">
        <h3>Posiciones</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="pd-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Jugador</th>
              <th className="num">PJ</th>
              <th className="num">PG</th>
              <th className="num">Dif</th>
              <th className="num">Pts</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={f.id} className={i < 3 && f.pj > 0 ? "pd-qualifies" : undefined}>
                <td className="pos">{i + 1}</td>
                <td>{f.nombre}</td>
                <td className="num">{f.pj}</td>
                <td className="num">{f.pg}</td>
                <td className="num">{f.gf - f.gc > 0 ? `+${f.gf - f.gc}` : f.gf - f.gc}</td>
                <td className="num pts">{f.pts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="pd-help px-4 py-3 border-t border-line">Pts = games ganados. Desempatan la diferencia de games y los partidos ganados.</p>
    </div>
  );
}

function DialogoResultado({ partido, mini, nombres, onCerrar, onGuardar }) {
  const previo = gamesDe(partido.resultado);
  const [g1, setG1] = useState(previo ? String(previo.g1) : "");
  const [g2, setG2] = useState(previo ? String(previo.g2) : "");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const enviar = async (e) => {
    e?.preventDefault?.();
    const err = validarResultado({ g1, g2 }, mini.partidoA, { permiteEmpate: permiteEmpate(mini, partido) });
    if (err) {
      setError(err);
      return;
    }
    setGuardando(true);
    await onGuardar(resultadoDe(g1, g2));
    setGuardando(false);
  };
  const borrar = async () => {
    setGuardando(true);
    await onGuardar(null);
    setGuardando(false);
  };
  return (
    <Dialogo
      titulo="Resultado"
      descripcion={textoPartidoA(mini.partidoA)}
      onCerrar={onCerrar}
      onSubmit={enviar}
      acciones={
        <>
          {previo && (
            <Button variant="ghost" onClick={borrar} disabled={guardando}>
              Borrar
            </Button>
          )}
          <Button onClick={onCerrar}>Cancelar</Button>
          <Button type="submit" variant="primary" cargando={guardando ? "Guardando…" : ""}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="mt-4 grid grid-cols-2 gap-4">
        <Field label={nombres[0]}>
          <Input type="number" inputMode="numeric" min={0} max={99} value={g1} onChange={(e) => setG1(e.target.value)} data-autofocus aria-label={`Games de ${nombres[0]}`} />
        </Field>
        <Field label={nombres[1]}>
          <Input type="number" inputMode="numeric" min={0} max={99} value={g2} onChange={(e) => setG2(e.target.value)} aria-label={`Games de ${nombres[1]}`} />
        </Field>
      </div>
      {error && (
        <p className="pd-error mt-2" role="alert">
          {error}
        </p>
      )}
    </Dialogo>
  );
}

// Compartir (todos) y, para quien lo creó, la carga de resultados con link y borrar
function Compartir({ mini, clubId, id, esCreador, onBorrado }) {
  const [clave, setClave] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    if (!esCreador || !mini.edicionAbierta) return undefined;
    let vivo = true;
    leerClaveEdicion(clubId, id)
      .then((c) => vivo && setClave(c))
      .catch((err) => console.error("No se pudo leer la clave de carga:", err));
    return () => {
      vivo = false;
    };
  }, [esCreador, mini.edicionAbierta, clubId, id]);

  const url = urlMini(clubId, id);
  const urlCarga = clave ? `${url}?carga=${clave}` : "";
  const mensaje = mensajeMini({ nombre: mini.nombre, fechaTexto: formatDiaCorto(mini.fecha), hora: mini.horaInicio || "", clubNombre: mini.clubNombre || "el club", url });
  const copiar = async (texto) => {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success("Link copiado");
    } catch {
      toast.error("No se pudo copiar. Seleccioná el link y copialo a mano.");
    }
  };
  const cambiarCarga = async (abrir) => {
    setOcupado(true);
    try {
      await actualizarMiniTorneo(clubId, id, { edicionAbierta: abrir });
      if (!abrir) setClave(null);
    } catch (err) {
      console.error("No se pudo cambiar la carga:", err);
      toast.error("No pudimos guardar el cambio.");
    } finally {
      setOcupado(false);
    }
  };
  const nuevoLink = async () => {
    const ok = await confirmar({ titulo: "¿Cambiar el link de carga?", mensaje: "El link anterior deja de servir para sumarse. Quienes ya entraron siguen pudiendo cargar mientras la carga esté abierta.", confirmText: "Cambiar link" });
    if (!ok) return;
    try {
      setClave(await renovarClaveEdicion(clubId, id));
    } catch (err) {
      console.error("No se pudo cambiar el link:", err);
      toast.error("No pudimos cambiar el link.");
    }
  };
  const borrar = async () => {
    const ok = await confirmar({ titulo: "¿Borrar el mini torneo?", mensaje: "Se borran los partidos y los resultados para todos. No se puede deshacer.", confirmText: "Borrar", danger: true });
    if (!ok) return;
    try {
      await borrarMiniTorneo(clubId, id);
      toast.success("Mini torneo borrado");
      onBorrado?.();
    } catch (err) {
      console.error("No se pudo borrar:", err);
      toast.error("No pudimos borrarlo.");
    }
  };

  return (
    <Card>
      <Card.Title as="h2">Compartir</Card.Title>
      <p className="body-sm text-ink-2 mt-1">El link muestra los partidos, la tabla y el cuadro en vivo (solo nombres de pila). Para ver, no hace falta cuenta.</p>
      <div className="pd-btn-group mt-3">
        <Button variant="primary" icon={<MessageCircle className="pd-icon" size={20} aria-hidden="true" />} onClick={() => window.open(linkWhatsApp("", mensaje), "_blank", "noopener")}>
          Compartir por WhatsApp
        </Button>
        <Button icon={<Copy className="pd-icon" size={20} aria-hidden="true" />} onClick={() => copiar(url)}>
          Copiar link
        </Button>
      </div>
      {esCreador && (
        <div className="mt-4 pt-4 border-t border-line flex flex-col gap-3">
          <Card.Row>
            <span className="heading-sm">Carga de resultados con link</span>
            {mini.edicionAbierta ? <Badge dot tone="success">Abierta</Badge> : <Badge>Cerrada</Badge>}
          </Card.Row>
          <p className="body-sm text-ink-2 m-0">
            {mini.edicionAbierta
              ? "Cualquiera con este link (aun sin cuenta) puede cargar resultados. Al cerrarla, solo vos y los jugadores que habilitaste."
              : `Hoy cargan resultados vos${(mini.editoresUids || []).length ? ` y ${mini.editoresUids.length} ${mini.editoresUids.length === 1 ? "jugador" : "jugadores"} con cuenta` : ""}. Abrila para que cargue cualquiera con el link.`}
          </p>
          {mini.edicionAbierta && urlCarga && (
            <>
              <div className="pd-btn-group">
                <Button icon={<MessageCircle className="pd-icon" size={20} aria-hidden="true" />} onClick={() => window.open(linkWhatsApp("", `Cargá los resultados del ${mini.nombre || "mini torneo"} acá: ${urlCarga}`), "_blank", "noopener")}>
                  Mandar link de carga
                </Button>
                <Button icon={<Copy className="pd-icon" size={20} aria-hidden="true" />} onClick={() => copiar(urlCarga)}>
                  Copiar
                </Button>
                <Button variant="ghost" icon={<Link2 className="pd-icon" size={20} aria-hidden="true" />} onClick={nuevoLink}>
                  Cambiar link
                </Button>
              </div>
              <p className="body-sm text-ink-3 m-0 break-all">{urlCarga}</p>
            </>
          )}
          <div className="pd-btn-group">
            <Button size="sm" cargando={ocupado ? "Guardando…" : ""} onClick={() => cambiarCarga(!mini.edicionAbierta)}>
              {mini.edicionAbierta ? "Cerrar la carga con link" : "Abrir la carga con link"}
            </Button>
            <Button size="sm" variant="ghost" onClick={borrar}>
              Borrar mini torneo
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
