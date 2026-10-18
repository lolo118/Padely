import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  Check,
  CircleDot,
  Coins,
  Copy,
  ExternalLink,
  Eye,
  Info,
  Link as LinkIcon,
  List,
  MapPin,
  MessageCircle,
  Pencil,
  Trophy,
  Zap,
} from "lucide-react";
import { getTorneoById, actualizarTorneo, getParejas, getGrupos, getCuadros } from "../../services/torneoService";
import { getClubesPublicos, getCanchasDeClub, getClubConfig, getClubByOwner } from "../../services/canchaService";
import { notificarSolicitudSede } from "../../services/notificationService";
import { useAuthStore } from "../../store/authStore";
import {
  cuadrosDeTorneo,
  parejasDeCuadro,
  parejasSinCuadro,
  cuadroDeGrupo,
  canchasDelTorneo,
  canchasDesdeTexto,
  textoDeCanchas,
  sedeDeTorneo,
  etiquetaProgramacion,
} from "../../utils/torneo";
import { toast } from "../../components/Toast";
import { confirmar } from "../../components/ConfirmDialog";

import TabGrupos from "./TabGrupos";
import TabBracket from "./TabBracket";
import TabParejas from "./TabParejas";
import TabReclamos from "./TabReclamos";
import { formatFecha, formatDiaCorto } from "../../utils/formatDate";
import { CATEGORIAS_TORNEO } from "../../utils/categorias";
import { formatPrecio, ubicacionCorta } from "../../utils/format";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  MarcaCategoria,
  Pills,
  SearchInput,
  Select,
  Tabs,
  Textarea,
} from "../../components/ui";

// Tono del badge de estado del torneo
const estadoTone = {
  inscripcion: "court",
  en_curso: "lime",
  finalizado: "neutral",
  cancelado: "danger",
};

const estadoLabel = {
  inscripcion: "Inscripción abierta",
  en_curso: "En curso",
  finalizado: "Finalizado",
  cancelado: "Cancelado",
};

const formatoLabel = {
  mini: "Mini torneo",
  normal: "Torneo normal",
  liga: "Liga",
  eliminacion: "Eliminación directa",
};

const formatoDesc = {
  mini: "Fase de grupos con pocas parejas, ideal para eventos rápidos.",
  normal: "Fase de grupos seguida de un bracket de eliminación.",
  liga: "Todos contra todos, se acumulan puntos por partido.",
  eliminacion: "Bracket de eliminación directa desde la primera ronda.",
};

// Tono del badge de estado de un cuadro (tarjeta "Cuadros")
const tonoEstadoCuadro = {
  "Sin parejas": "neutral",
  Inscripción: "court",
  Finalizado: "neutral",
  Bracket: "lime",
  Liga: "lime",
  Grupos: "lime",
};

const provinciasArgentina = [
  "Buenos Aires",
  "CABA",
  "Catamarca",
  "Chaco",
  "Chubut",
  "Córdoba",
  "Corrientes",
  "Entre Ríos",
  "Formosa",
  "Jujuy",
  "La Pampa",
  "La Rioja",
  "Mendoza",
  "Misiones",
  "Neuquén",
  "Río Negro",
  "Salta",
  "San Juan",
  "San Luis",
  "Santa Cruz",
  "Santa Fe",
  "Santiago del Estero",
  "Tierra del Fuego",
  "Tucumán",
];

// Dónde se juega: en un club de Padely (vínculo + canchas reales del club) o en otra sede (texto libre)
const tiposSede = [
  { value: "club", label: "Club de Padely" },
  { value: "otra", label: "Otra sede" },
];

// Sección "Sede" del modo edición (misma que en CrearTorneo): pastillas club / otra sede, buscador + selector de
// club y las canchas del club como badges conmutables. Los campos de "Otra sede" llegan como children.
function SeccionSede({
  tipoSede,
  onTipoSede,
  clubes,
  clubPropio,
  clubId,
  onClubId,
  busqueda,
  onBusqueda,
  canchasClub,
  cargandoCanchas,
  canchasSel,
  onToggleCancha,
  errorCanchas,
  children,
}) {
  const bloqueado = !!clubPropio;
  const texto = busqueda.trim().toLowerCase();
  const opciones = clubes.filter(
    (c) => c.id === clubId || !texto || `${c.nombre} ${c.ciudad}`.toLowerCase().includes(texto),
  );
  if (clubPropio && !opciones.some((c) => c.id === clubPropio.id)) {
    opciones.unshift({ id: clubPropio.id, nombre: clubPropio.nombre || "", ciudad: clubPropio.ciudad || "" });
  }
  const esDueno = !!clubPropio && clubId === clubPropio.id;

  return (
    <>
      <Field label="Dónde se juega" as="div">
        <Pills items={tiposSede} value={tipoSede} onChange={onTipoSede} ariaLabel="Tipo de sede" />
      </Field>

      {tipoSede === "club" ? (
        <>
          <Field label="Club" as="div" help={bloqueado ? "Tu torneo se juega en tu club" : undefined}>
            <div className="flex flex-col gap-2">
              {!bloqueado && (
                <SearchInput
                  placeholder="Buscar por nombre o ciudad"
                  aria-label="Buscar club"
                  value={busqueda}
                  onChange={(e) => onBusqueda(e.target.value)}
                />
              )}
              <Select aria-label="Club" value={clubId} onChange={(e) => onClubId(e.target.value)} disabled={bloqueado}>
                <option value="">Elegí un club</option>
                {opciones.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                    {c.ciudad ? ` · ${c.ciudad}` : ""}
                  </option>
                ))}
              </Select>
            </div>
          </Field>

          <Field
            label="Canchas del torneo"
            as="div"
            error={errorCanchas}
            help="Los partidos programados bloquean estos turnos en el club"
          >
            {canchasClub.length > 0 ? (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Canchas del torneo">
                {canchasClub.map((c) => {
                  const elegida = canchasSel.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className={`pd-badge border-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${elegida ? "pd-badge-lime" : ""}`}
                      aria-pressed={elegida}
                      onClick={() => onToggleCancha(c.id)}
                    >
                      {c.nombre}
                    </button>
                  );
                })}
              </div>
            ) : cargandoCanchas ? (
              <div className="flex flex-wrap gap-2" aria-busy="true" aria-label="Cargando canchas">
                <span className="pd-skeleton h-6 w-20 rounded-pill!" />
                <span className="pd-skeleton h-6 w-20 rounded-pill!" />
                <span className="pd-skeleton h-6 w-20 rounded-pill!" />
              </div>
            ) : (
              <p className="body-sm text-ink-3">
                {clubId ? "Este club todavía no cargó canchas." : "Elegí un club para ver sus canchas."}
              </p>
            )}
          </Field>
          {clubId && !esDueno && (
            <p className="pd-help">
              El club tiene que aceptar la sede. Podés crear el torneo y abrir la inscripción mientras tanto; los
              turnos se bloquean cuando acepte.
            </p>
          )}
        </>
      ) : (
        children
      )}
    </>
  );
}

const getTabs = (formato) => {
  if (formato === "liga") return ["Info", "Parejas", "Liga", "Reclamos"];
  if (formato === "eliminacion") return ["Info", "Parejas", "Bracket", "Reclamos"];
  return ["Info", "Parejas", "Grupos", "Bracket", "Reclamos"];
};

// Estado de UN cuadro para el stepper, las acciones pendientes y los diálogos de iniciar/finalizar.
// datos: { parejas, grupos, rondas } del cuadro. Devuelve { idx, acciones, terminado, motivo }:
// idx = paso del stepper, acciones = pendientes en minúscula (se prefijan con el cuadro si hay varios),
// terminado = el cuadro ya tiene su campeón, motivo = por qué no está terminado.
function estadoDeCuadro(torneo, datos) {
  const formato = torneo.formato;
  const parejas = datos.parejas || [];
  const grupos = datos.grupos || [];
  const rondas = Array.isArray(datos.rondas) ? datos.rondas : null;
  const minParejas = formato === "eliminacion" ? 2 : 3;
  const tieneBracket = !!rondas && rondas.length > 0;
  const bracketConResultados = tieneBracket && rondas.some((r) => (r || []).some((p) => p && p.resultado));
  const finalConResultado = tieneBracket && !!rondas[rondas.length - 1]?.[0]?.resultado;
  const bracketPendientes = tieneBracket
    ? rondas.reduce((acc, r) => acc + (r || []).filter((p) => p && p.pareja1 && p.pareja2 && !p.resultado).length, 0)
    : 0;
  const totalPartidos = grupos.reduce((acc, g) => acc + (g.partidos || []).length, 0);
  const completados = grupos.reduce((acc, g) => acc + (g.partidos || []).filter((p) => p.resultado).length, 0);
  const sinResultado = totalPartidos - completados;

  let idx = 0;
  const acciones = [];
  let terminado = false;
  let motivo = "";

  if (torneo.status === "inscripcion") {
    if (parejas.length === 0) acciones.push("agregá parejas para comenzar");
    else if (parejas.length < minParejas) acciones.push(`necesitás al menos ${minParejas} parejas (tenés ${parejas.length})`);
    else acciones.push(`${parejas.length} parejas inscriptas — podés iniciar el torneo`);
  }

  if (formato === "liga") {
    if (torneo.status === "en_curso") idx = grupos.length > 0 ? 2 : 1;
    else if (torneo.status === "finalizado") idx = 3;
    terminado = grupos.length > 0 && totalPartidos > 0 && sinResultado === 0;
    motivo = grupos.length === 0 ? "sin fixture" : `${sinResultado} partido${sinResultado !== 1 ? "s" : ""} sin resultado`;
    if (torneo.status === "en_curso") {
      if (grupos.length === 0) acciones.push("generá el fixture en la pestaña Liga");
      else if (sinResultado > 0) acciones.push(`${completados}/${totalPartidos} partidos completados`);
      else acciones.push("todos los partidos completados — podés finalizar el torneo");
    }
  } else if (formato === "eliminacion") {
    if (torneo.status === "en_curso") idx = bracketConResultados ? 2 : 1;
    else if (torneo.status === "finalizado") idx = 3;
    terminado = finalConResultado;
    motivo = !tieneBracket ? "sin bracket" : "final sin resultado";
    if (torneo.status === "en_curso") {
      if (!tieneBracket) acciones.push("generá el bracket en la pestaña Bracket");
      else if (bracketPendientes > 0) acciones.push(`${bracketPendientes} partido(s) sin resultado en bracket`);
      else if (!finalConResultado) acciones.push("cargá el resultado de la final");
      else acciones.push("bracket completo — podés finalizar el torneo");
    }
  } else {
    if (torneo.status === "en_curso") idx = bracketConResultados ? 3 : 2;
    else if (torneo.status === "finalizado") idx = 4;
    terminado = finalConResultado;
    motivo = grupos.length === 0 ? "sin grupos" : !tieneBracket ? "sin bracket" : "final sin resultado";
    if (torneo.status === "en_curso") {
      if (grupos.length === 0) {
        acciones.push("generá los grupos en la pestaña Grupos");
      } else {
        if (sinResultado > 0) acciones.push(`${sinResultado} partido(s) sin resultado en grupos`);
        if (sinResultado === 0 && !tieneBracket) acciones.push("todos los grupos completos — generá el bracket");
        if (tieneBracket && bracketPendientes > 0) acciones.push(`${bracketPendientes} partido(s) sin resultado en bracket`);
        if (tieneBracket && bracketPendientes === 0 && finalConResultado) acciones.push("bracket completo — podés finalizar el torneo");
      }
    }
  }

  return { idx, acciones, terminado, motivo };
}

// Etiqueta de estado de un cuadro para la tarjeta "Cuadros" de la pestaña Info
function etiquetaEstadoCuadro(torneo, datos) {
  if ((datos.parejas || []).length === 0) return "Sin parejas";
  if (torneo.status === "inscripcion") return "Inscripción";
  const estado = estadoDeCuadro(torneo, datos);
  if (torneo.status === "finalizado" || estado.terminado) return "Finalizado";
  if (Array.isArray(datos.rondas) && datos.rondas.length > 0) return "Bracket";
  if (torneo.formato === "eliminacion") return "Bracket";
  if (torneo.formato === "liga") return "Liga";
  return "Grupos";
}

function capitalizar(texto) {
  return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : texto;
}

// Un consejo de la tarjeta "¿Sabías que...?": ícono Lucide + texto
function Tip({ icon, children }) {
  const Icono = icon;
  return (
    <li className="flex items-start gap-2 body-sm text-ink-2">
      <Icono className="pd-icon text-ink-3" size={20} aria-hidden="true" />
      <p>{children}</p>
    </li>
  );
}

// Una nota contextual de la pestaña Info (tip, aviso): ícono Lucide + texto sobre surface-sunken
function Nota({ icon, children }) {
  const Icono = icon;
  return (
    <p className="flex items-start gap-2 rounded-md bg-surface-sunken px-4 py-3 body-sm text-ink-2">
      <Icono className="pd-icon text-ink-3" size={20} aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

// Stepper por cuadro: el paso actual es el del cuadro menos avanzado entre los que tienen parejas;
// las acciones pendientes se listan por cuadro (con su nombre cuando hay más de uno).
// Un cuadro sin parejas no se juega y no cuenta acá.
function TournamentStepper({ torneo, cuadros, datosPorCuadro, parejasSinCuadro: sinCuadro }) {
  const steps = torneo.formato === "liga"
    ? [
        { key: "inscripcion", label: "Inscripción" },
        { key: "fixture", label: "Fixture" },
        { key: "en_curso", label: "En curso" },
        { key: "finalizado", label: "Finalizado" },
      ]
    : torneo.formato === "eliminacion"
    ? [
        { key: "inscripcion", label: "Inscripción" },
        { key: "en_curso", label: "En curso" },
        { key: "bracket", label: "Bracket" },
        { key: "finalizado", label: "Finalizado" },
      ]
    : [
        { key: "inscripcion", label: "Inscripción" },
        { key: "grupos", label: "Grupos" },
        { key: "en_curso", label: "En curso" },
        { key: "bracket", label: "Bracket" },
        { key: "finalizado", label: "Finalizado" },
      ];

  const variosCuadros = cuadros.length > 1;
  const estados = cuadros
    .filter((c) => (datosPorCuadro[c.id]?.parejas || []).length > 0)
    .map((c) => ({ cuadro: c, ...estadoDeCuadro(torneo, datosPorCuadro[c.id]) }));

  const currentIdx = estados.length > 0
    ? Math.min(...estados.map((e) => e.idx))
    : estadoDeCuadro(torneo, { parejas: [], grupos: [], rondas: null }).idx;

  const pendingActions = [];
  if (estados.length === 0 && torneo.status === "inscripcion") pendingActions.push("Agregá parejas para comenzar");
  estados.forEach((e) => {
    e.acciones.forEach((a) => {
      // Con varios cuadros, "podés iniciar" se decide abajo mirando todos los cuadros
      const texto = variosCuadros ? a.replace(" — podés iniciar el torneo", "") : capitalizar(a);
      pendingActions.push(variosCuadros ? `${e.cuadro.label}: ${texto}` : texto);
    });
  });
  if (variosCuadros && torneo.status === "inscripcion" && estados.length > 0) {
    const minParejas = torneo.formato === "eliminacion" ? 2 : 3;
    const listo = sinCuadro === 0 && estados.every((e) => datosPorCuadro[e.cuadro.id].parejas.length >= minParejas);
    if (listo) pendingActions.push("Todos los cuadros tienen parejas suficientes — podés iniciar el torneo");
  }
  if (sinCuadro > 0 && (torneo.status === "inscripcion" || torneo.status === "en_curso")) {
    pendingActions.push(`${sinCuadro} pareja${sinCuadro !== 1 ? "s" : ""} sin categoría — asignales una en la pestaña Parejas`);
  }

  return (
    <Card className="mb-4">
      <ol className="flex flex-wrap gap-2" aria-label="Etapas del torneo">
        {steps.map((step, i) => (
          <li key={step.key} aria-current={i === currentIdx ? "step" : undefined}>
            <Badge tone={i < currentIdx ? "success" : i === currentIdx ? "lime" : "neutral"}>{step.label}</Badge>
          </li>
        ))}
      </ol>
      {pendingActions.length > 0 && (
        <ul className="flex flex-col gap-2 mt-4">
          {pendingActions.map((action, i) => (
            <li key={i} className="flex items-start gap-2 rounded-md bg-surface-sunken px-3 py-2 body-sm text-ink-2">
              <Info className="pd-icon text-ink-3" size={20} aria-hidden="true" />
              <span>{action}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function DetalleTorneo() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [torneo, setTorneo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("Info");
  const [editando, setEditando] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [guardandoEdit, setGuardandoEdit] = useState(false);
  const [mostrarNotificar, setMostrarNotificar] = useState(false);
  const [mostrarAyuda, setMostrarAyuda] = useState(true);
  const [parejasStepper, setParejasStepper] = useState([]);
  const [gruposStepper, setGruposStepper] = useState([]);
  // { [cuadroId]: { label, rondas } } — el bracket de cada cuadro (tournaments/{tid}/cuadros)
  const [cuadrosStepper, setCuadrosStepper] = useState({});
  // Cuadro elegido en las pestañas Grupos / Liga / Bracket (por defecto, el primero con parejas)
  const [cuadroSel, setCuadroSel] = useState(null);
  const [cuadroElegido, setCuadroElegido] = useState(false);
  const { user } = useAuthStore();
  // Documento público del club sede (dirección, dueño) cuando el torneo está vinculado a un club
  const [clubDoc, setClubDoc] = useState(null);
  // Sede en el modo edición: club de Padely (vínculo + canchas del club) u otra sede (texto libre)
  const [tipoSedeEdit, setTipoSedeEdit] = useState("otra");
  const [clubes, setClubes] = useState([]);
  const [clubPropio, setClubPropio] = useState(null);
  const [clubIdEdit, setClubIdEdit] = useState("");
  const [busquedaClub, setBusquedaClub] = useState("");
  const [canchasClubEdit, setCanchasClubEdit] = useState([]);
  const [cargandoCanchas, setCargandoCanchas] = useState(false);
  const [canchasSelEdit, setCanchasSelEdit] = useState([]);
  const [errorCanchas, setErrorCanchas] = useState("");
  const [canchasTextoEdit, setCanchasTextoEdit] = useState("");

  useEffect(() => {
    const cargar = async () => {
      try {
        const [torneoData, parejasData, gruposData, cuadrosData] = await Promise.all([
          getTorneoById(id),
          getParejas(id),
          getGrupos(id),
          getCuadros(id),
        ]);
        setTorneo(torneoData);
        setParejasStepper(parejasData);
        setGruposStepper(gruposData);
        setCuadrosStepper(cuadrosData || {});
        // Dirección y dueño del club sede (documento público)
        if (torneoData?.club?.id) {
          try {
            setClubDoc(await getClubConfig(torneoData.club.id));
          } catch (err) {
            console.error("Error al cargar el club sede:", err);
          }
        }
      } catch (err) {
        console.error("Error al cargar torneo:", err);
      }
      setLoading(false);
    };
    cargar();
  }, [id]);

  // Canchas del club elegido en el modo edición: se conservan las ya elegidas del torneo; si no queda ninguna
  // (club nuevo o torneo viejo sin canchas), el torneo usa todas
  useEffect(() => {
    if (!editando || !clubIdEdit) return;
    let activo = true;
    getCanchasDeClub(clubIdEdit)
      .then((lista) => {
        if (!activo) return;
        setCanchasClubEdit(lista);
        setCanchasSelEdit((prev) => {
          const ids = lista.map((c) => c.id);
          const conservadas = prev.filter((cid) => ids.includes(cid));
          return conservadas.length > 0 ? conservadas : ids;
        });
      })
      .catch((err) => console.error("Error cargando las canchas del club:", err))
      .finally(() => {
        if (activo) setCargandoCanchas(false);
      });
    return () => {
      activo = false;
    };
  }, [editando, clubIdEdit]);

  const cambiarEstado = async (nuevoEstado) => {
    try {
      await actualizarTorneo(id, { status: nuevoEstado });
    } catch (err) {
      console.error("Error al cambiar el estado:", err);
      toast.error("No pudimos cambiar el estado del torneo. Intentá de nuevo.");
      return;
    }
    setTorneo({ ...torneo, status: nuevoEstado });
    const etiqueta = { en_curso: "Torneo iniciado", finalizado: "Torneo finalizado", cancelado: "Torneo cancelado" };
    toast.success(etiqueta[nuevoEstado] || "Estado actualizado");

    // Los puntos y el bonus de campeón/subcampeón de la liga los otorgan las Cloud Functions al finalizar.
  };

  const iniciarEdicion = async () => {
    setEditForm({ ...torneo });
    // Sede actual: club vinculado (con las canchas elegidas) u otra sede (las canchas como texto)
    const clubActual = torneo.club?.id ? torneo.club : null;
    setTipoSedeEdit(clubActual ? "club" : "otra");
    setClubIdEdit(clubActual ? clubActual.id : "");
    setBusquedaClub("");
    setCanchasClubEdit([]);
    setCanchasSelEdit(clubActual ? canchasDelTorneo(torneo).map((c) => c.id) : []);
    setCanchasTextoEdit(clubActual ? "" : textoDeCanchas(torneo.canchas));
    setCargandoCanchas(!!clubActual);
    setErrorCanchas("");
    setEditando(true);
    try {
      const [lista, propio] = await Promise.all([getClubesPublicos(), user ? getClubByOwner(user.uid) : null]);
      setClubes(lista);
      setClubPropio(propio);
    } catch (err) {
      console.error("Error cargando los clubes:", err);
    }
  };

  const cancelarEdicion = () => {
    setEditando(false);
    setEditForm(null);
  };

  const elegirClubEdit = (clubId) => {
    setClubIdEdit(clubId);
    setCanchasClubEdit([]);
    setCanchasSelEdit([]);
    setErrorCanchas("");
    setCargandoCanchas(!!clubId);
  };

  const toggleCanchaEdit = (canchaId) => {
    setErrorCanchas("");
    setCanchasSelEdit((prev) => (prev.includes(canchaId) ? prev.filter((c) => c !== canchaId) : [...prev, canchaId]));
  };

  const cambiarTipoSedeEdit = (tipo) => {
    setTipoSedeEdit(tipo);
    setErrorCanchas("");
    if (tipo === "club" && clubPropio && !clubIdEdit) elegirClubEdit(clubPropio.id);
  };

  const guardarEdicion = async () => {
    const conClub = tipoSedeEdit === "club";
    if (conClub && !clubIdEdit) {
      toast.error("Elegí el club donde se juega el torneo.");
      return;
    }
    if (conClub && canchasSelEdit.length === 0) {
      setErrorCanchas("Elegí al menos una cancha");
      return;
    }
    setGuardandoEdit(true);
    try {
      const {
        id: _,
        createdAt: _ca,
        status: _st,
        organizerId: _oi,
        conflictos: _cf,
        ...datosActualizar
      } = editForm;
      // Sede: si el club cambió, el vínculo nace aceptado (club propio) o pendiente y se avisa al club; si es el
      // mismo club, conserva su estado. Con "Otra sede" el vínculo se borra. Los conflictos los escribe la Function.
      let avisar = null;
      let clubNuevo = null;
      if (conClub) {
        clubNuevo = await getClubConfig(clubIdEdit);
        if (!clubNuevo) throw new Error("El club elegido ya no existe");
        const mismoClub = torneo.club?.id === clubNuevo.id;
        const estado = mismoClub
          ? torneo.club.estado || "pendiente"
          : clubNuevo.ownerUid === user?.uid
            ? "aceptado"
            : "pendiente";
        if (mismoClub) {
          // El vínculo no se reescribe: el estado lo decide el club y pudo cambiar desde que se abrió la página
          delete datosActualizar.club;
        } else {
          datosActualizar.club = {
            id: clubNuevo.id,
            nombre: clubNuevo.nombre || "",
            ciudad: clubNuevo.ciudad || "",
            estado,
          };
        }
        if (canchasClubEdit.length === 0) {
          if (!mismoClub) {
            toast.error("Todavía estamos cargando las canchas del club. Probá de nuevo en un momento.");
            setGuardandoEdit(false);
            return;
          }
          // Las canchas del club no cargaron: se conservan las del torneo
          delete datosActualizar.canchas;
        } else {
          datosActualizar.canchas = canchasClubEdit
            .filter((c) => canchasSelEdit.includes(c.id))
            .map((c) => ({ id: c.id, nombre: c.nombre }));
        }
        datosActualizar.sede = clubNuevo.nombre || "";
        datosActualizar.ciudad = clubNuevo.ciudad || "";
        datosActualizar.provincia = clubNuevo.provincia || "";
        datosActualizar.direccionSede = clubNuevo.direccion || "";
        if (!mismoClub && estado === "pendiente") {
          avisar = () =>
            notificarSolicitudSede(clubNuevo.ownerUid, datosActualizar.nombre, torneo.organizadorNombre, id);
        }
      } else {
        datosActualizar.club = null;
        datosActualizar.canchas = canchasDesdeTexto(canchasTextoEdit);
      }
      await actualizarTorneo(id, datosActualizar);
      if (avisar) avisar().catch((err) => console.error("Error avisando al club:", err));
      setClubDoc(conClub ? clubNuevo : null);
      setTorneo({ ...torneo, ...datosActualizar });
      setEditando(false);
      setEditForm(null);
      toast.success("Cambios guardados");
    } catch (err) {
      console.error("Error al guardar:", err);
      toast.error("No pudimos guardar los cambios. Intentá de nuevo.");
    }
    setGuardandoEdit(false);
  };

  const setEdit = (field) => (e) => {
    const val =
      e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setEditForm({ ...editForm, [field]: val });
  };

  const toggleGeneroEdit = (genero) => {
    const current = editForm.categoriaGenero || [];
    let updated;
    if (current.includes(genero)) {
      updated = current.filter((g) => g !== genero);
      const newConfig = { ...editForm.categoriasConfig };
      delete newConfig[genero];
      setEditForm({
        ...editForm,
        categoriaGenero: updated,
        categoriasConfig: newConfig,
      });
    } else {
      if (current.length >= 3) return;
      updated = [...current, genero];
      setEditForm({
        ...editForm,
        categoriaGenero: updated,
        categoriasConfig: {
          ...(editForm.categoriasConfig || {}),
          [genero]: [],
        },
      });
    }
  };

  const toggleNivelEdit = (genero, nivel) => {
    const current = (editForm.categoriasConfig || {})[genero] || [];
    let updated;
    if (current.includes(nivel)) {
      updated = current.filter((n) => n !== nivel);
    } else {
      updated = [...current, nivel];
    }
    setEditForm({
      ...editForm,
      categoriasConfig: {
        ...(editForm.categoriasConfig || {}),
        [genero]: updated,
      },
    });
  };

  if (loading)
    return (
      <div className="max-w-3xl mx-auto flex flex-col gap-4" aria-busy="true" aria-label="Cargando torneo">
        <div className="pd-skeleton h-16" />
        <div className="pd-skeleton h-28" />
        <div className="pd-skeleton h-64" />
      </div>
    );

  if (!torneo)
    return (
      <Card className="max-w-md mx-auto text-center py-12!">
        <div className="mb-3">
          <span className="pd-ball" aria-hidden="true" />
        </div>
        <p className="heading-sm">Torneo no encontrado</p>
      </Card>
    );

  // Sede (club vinculado u otra sede), canchas del torneo y turnos en conflicto (los anota la Function).
  // Los torneos viejos no tienen club ni canchas: todo tolera que falten.
  const sede = sedeDeTorneo(torneo);
  const direccionSede = (sede.clubId && clubDoc?.direccion) || sede.direccion || "";
  const ciudadSede = ubicacionCorta({ ciudad: sede.ciudad, provincia: (sede.clubId && clubDoc?.provincia) || sede.provincia });
  const canchasTorneo = canchasDelTorneo(torneo);
  const conflictos = Array.isArray(torneo.conflictos) ? torneo.conflictos : [];

  // Cuadros del torneo con sus parejas, grupos y bracket
  const cuadros = cuadrosDeTorneo(torneo);
  const variosCuadros = cuadros.length > 1;
  const datosPorCuadro = {};
  cuadros.forEach((c) => {
    datosPorCuadro[c.id] = {
      parejas: parejasDeCuadro(parejasStepper, c.id, torneo),
      grupos: gruposStepper.filter((g) => cuadroDeGrupo(g, torneo) === c.id),
      rondas: cuadrosStepper[c.id]?.rondas || null,
    };
  });
  const sinCuadro = parejasSinCuadro(parejasStepper, torneo);
  const primerConParejas = cuadros.find((c) => datosPorCuadro[c.id].parejas.length > 0) || cuadros[0];
  const cuadroActual = (cuadroElegido && cuadros.find((c) => c.id === cuadroSel)) || primerConParejas;
  // Con grupos o un bracket generados ya no se pueden cambiar las categorías
  const bloqueoCategorias = gruposStepper.length > 0 || Object.keys(cuadrosStepper).length > 0;

  // Las pestañas avisan lo que guardan para que el stepper, la tarjeta "Cuadros" y el bloqueo de categorías
  // reflejen el estado real sin recargar
  const onGruposDelCuadro = (gruposCuadro) =>
    setGruposStepper((prev) => [
      ...prev.filter((g) => cuadroDeGrupo(g, torneo) !== cuadroActual.id),
      ...gruposCuadro.map((g) => ({ ...g, cuadro: cuadroActual.id })),
    ]);
  const onBracketDelCuadro = (rondas) =>
    setCuadrosStepper((prev) => ({ ...prev, [cuadroActual.id]: { label: cuadroActual.label, rondas } }));

  // Link público del torneo (el que copia "Copiar link")
  const linkPublico = `${window.location.origin}/torneos/${id}`;

  const selectorCuadros = variosCuadros ? (
    <div className="pd-pills mb-4" role="tablist" aria-label="Cuadro">
      {cuadros.map((c) => {
        const n = datosPorCuadro[c.id].parejas.length;
        const activo = c.id === cuadroActual.id;
        return (
          <button
            key={c.id}
            type="button"
            role="tab"
            className="pd-pill"
            aria-selected={activo}
            onClick={() => {
              setCuadroSel(c.id);
              setCuadroElegido(true);
            }}
          >
            <MarcaCategoria cat={c.nivel} size={20} />
            {c.label}
            <span className="pd-count">{n}</span>
          </button>
        );
      })}
    </div>
  ) : null;

  const tabsItems = getTabs(torneo?.formato || "normal").map((t) => ({
    value: t,
    label: t,
    count: t === "Parejas" ? parejasStepper.length : undefined,
  }));

  // Chips de categoría de un género en el modo edición (bloqueadas cuando ya hay un cuadro generado)
  const chipsNivelEdit = (genero) => (
    <div className="pd-pills" role="group" aria-label={`Categorías ${genero}`}>
      {CATEGORIAS_TORNEO.map((nivel) => (
        <button
          key={nivel}
          type="button"
          className="pd-pill disabled:opacity-50 disabled:cursor-not-allowed!"
          disabled={bloqueoCategorias}
          aria-pressed={((editForm.categoriasConfig || {})[genero] || []).includes(nivel)}
          onClick={() => toggleNivelEdit(genero, nivel)}
        >
          <MarcaCategoria cat={nivel} size={20} />
          {nivel}
        </button>
      ))}
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-start gap-3 mb-6">
        <Button
          variant="ghost"
          iconOnly
          aria-label="Volver"
          icon={<ArrowLeft className="pd-icon" size={20} aria-hidden="true" />}
          onClick={() => navigate(-1)}
        />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="heading-lg">{torneo.nombre}</h1>
            <Badge tone={estadoTone[torneo.status]} dot>
              {estadoLabel[torneo.status]}
            </Badge>
            {sede.estado === "pendiente" && (
              <Badge tone="warning" dot className="whitespace-normal! h-auto! py-1!">
                Esperando confirmación de {sede.nombre}
              </Badge>
            )}
            {sede.estado === "rechazado" && (
              <Badge tone="danger" dot>
                Sede rechazada
              </Badge>
            )}
          </div>
          <p className="body-sm text-ink-2">
            {torneo.sede} — {ubicacionCorta(torneo)}
          </p>
        </div>

        {/* Notificar */}
        {mostrarNotificar && (
          <div className="fixed inset-0 z-10" aria-hidden="true" onClick={() => setMostrarNotificar(false)} />
        )}
        <div
          className="relative"
          onKeyDown={(e) => {
            if (e.key === "Escape" && mostrarNotificar) setMostrarNotificar(false);
          }}
        >
          <Button
            iconOnly
            aria-label="Enviar mensaje por WhatsApp"
            aria-haspopup="menu"
            aria-expanded={mostrarNotificar}
            icon={<MessageCircle className="pd-icon" size={20} aria-hidden="true" />}
            onClick={() => setMostrarNotificar(!mostrarNotificar)}
          />
          {mostrarNotificar && (
            <div
              className="pd-card absolute right-0 top-12 z-20 w-72 p-3!"
              role="menu"
              aria-label="Enviar mensaje por WhatsApp"
              style={{ boxShadow: "var(--shadow-overlay)" }}
            >
              <p className="pd-eyebrow mb-2!">Enviar mensaje por WhatsApp</p>
              <div className="flex flex-col gap-1">
                {torneo.status === "en_curso" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    block
                    role="menuitem"
                    className="justify-start!"
                    onClick={() => {
                      const msg = encodeURIComponent(`¡Los grupos del torneo "${torneo.nombre}" ya fueron publicados! Consultá tus partidos acá: ${window.location.origin}/torneos/${id}`);
                      window.open(`https://wa.me/?text=${msg}`, "_blank");
                      setMostrarNotificar(false);
                    }}
                  >
                    Grupos publicados — compartir link
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  block
                  role="menuitem"
                  className="justify-start!"
                  onClick={() => {
                    const msg = encodeURIComponent(`📢 Información del torneo "${torneo.nombre}"\n📍 Sede: ${torneo.sede}\n📅 Fecha: ${formatFecha(torneo.fechaInicio)}\n🔗 Más info: ${window.location.origin}/torneos/${id}`);
                    window.open(`https://wa.me/?text=${msg}`, "_blank");
                    setMostrarNotificar(false);
                  }}
                >
                  Info general del torneo
                </Button>
                {torneo.status === "inscripcion" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    block
                    role="menuitem"
                    className="justify-start!"
                    onClick={() => {
                      const cats = torneo.categoriasConfig ? Object.values(torneo.categoriasConfig).flat().join(", ") : "";
                      const msg = encodeURIComponent(`🏆 ¡Inscripciones abiertas!\n\nTorneo: ${torneo.nombre}\n📍 ${torneo.sede}, ${torneo.ciudad}\n📅 ${formatFecha(torneo.fechaInicio)}\n🎾 Categorías: ${cats}\n💰 Inscripción: ${torneo.inscripcion > 0 ? formatPrecio(torneo.inscripcion) : "Gratis"}\n\n✍️ Inscribite acá: ${window.location.origin}/torneos/${id}`);
                      window.open(`https://wa.me/?text=${msg}`, "_blank");
                      setMostrarNotificar(false);
                    }}
                  >
                    Invitar a inscribirse
                  </Button>
                )}
                {torneo.status === "finalizado" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    block
                    role="menuitem"
                    className="justify-start!"
                    onClick={() => {
                      const msg = encodeURIComponent(`🏆 ¡Finalizó el torneo "${torneo.nombre}"!\n\nMirá los resultados acá: ${window.location.origin}/torneos/${id}`);
                      window.open(`https://wa.me/?text=${msg}`, "_blank");
                      setMostrarNotificar(false);
                    }}
                  >
                    Compartir resultados finales
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <TournamentStepper torneo={torneo} cuadros={cuadros} datosPorCuadro={datosPorCuadro} parejasSinCuadro={sinCuadro.length} />

      {mostrarAyuda && (
        <Card className="mb-4">
          <Card.Row>
            <span className="flex items-center gap-2 heading-sm">
              <Info className="pd-icon text-ink-3" size={20} aria-hidden="true" />
              ¿Sabías que...?
            </span>
            <Button variant="ghost" size="sm" onClick={() => setMostrarAyuda(false)}>
              Ocultar
            </Button>
          </Card.Row>
          <ul className="flex flex-col gap-2 mt-3">
            {torneo.status === "inscripcion" && (
              <>
                <Tip icon={Bell}>Cuando un jugador se inscribe, recibís una <strong>notificación automática</strong> en la campana de la app.</Tip>
                <Tip icon={LinkIcon}>Podés <strong>vincular jugadores a sus parejas</strong> desde la pestaña Parejas. Cada jugador recibe un link único para asociar su cuenta.</Tip>
                <Tip icon={MessageCircle}>Usá el botón de <strong>WhatsApp</strong> para compartir la info del torneo e invitar jugadores a inscribirse.</Tip>
              </>
            )}
            {torneo.status === "en_curso" && (
              <>
                <Tip icon={CircleDot}>Cuando asignás <strong>horario y cancha</strong> a un partido, los jugadores vinculados reciben una notificación automática.</Tip>
                <Tip icon={Coins}>Al cargar un resultado, los <strong>puntos se calculan automáticamente</strong> y los jugadores reciben notificación.</Tip>
                <Tip icon={Zap}>Usá <strong>"Guardar y cargar siguiente"</strong> en el modal de resultados para cargar varios partidos en secuencia.</Tip>
                {torneo.formato === "liga" && (
                  <Tip icon={List}>En formato <strong>Liga</strong>, todas las parejas juegan entre sí. Los partidos están organizados por <strong>fechas</strong>. El líder de la tabla al finalizar es el campeón.</Tip>
                )}
                {torneo.habilitarReclamos && (
                  <Tip icon={AlertTriangle}>Los jugadores vinculados pueden <strong>abrir reclamos</strong>. Revisalos en la pestaña Reclamos.</Tip>
                )}
              </>
            )}
            {torneo.status === "finalizado" && (
              <>
                <Tip icon={Trophy}>Los <strong>puntos de campeón y subcampeón</strong> ya fueron asignados automáticamente a los jugadores vinculados.</Tip>
                <Tip icon={MessageCircle}>Compartí los resultados finales por WhatsApp con el botón de <strong>WhatsApp</strong>.</Tip>
              </>
            )}
          </ul>
        </Card>
      )}

      <Tabs items={tabsItems} value={tab} onChange={setTab} ariaLabel="Secciones del torneo" className="mb-6" />

      {tab === "Info" && !editando && (
        <div className="flex flex-col gap-4">
          {/* Turnos del club que ya estaban reservados cuando se programó un partido (los anota la Function) */}
          {conflictos.length > 0 && (
            <Card className="border-danger!">
              <Card.Title as="h2" className="mb-2! flex items-center gap-2">
                <AlertTriangle className="pd-icon text-danger" size={20} aria-hidden="true" />
                {conflictos.length === 1
                  ? "1 turno ya reservado en el club"
                  : `${conflictos.length} turnos ya reservados en el club`}
              </Card.Title>
              <ul className="flex flex-col gap-1">
                {conflictos.map((c, i) => (
                  <li key={i} className="body-md pd-tnum">
                    {etiquetaProgramacion({ dia: c.dia, hora: c.hora, cancha: c.canchaNombre }, formatDiaCorto)}
                  </li>
                ))}
              </ul>
              <p className="pd-help mt-3">Cambiá el horario o pedile al club que libere el turno</p>
            </Card>
          )}

          <Card>
            <Card.Row className="mb-3">
              <Card.Title as="h2">Detalles del torneo</Card.Title>
              <Button
                variant="ghost"
                size="sm"
                icon={<Pencil className="pd-icon" size={20} aria-hidden="true" />}
                onClick={iniciarEdicion}
              >
                Editar
              </Button>
            </Card.Row>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <dt className="body-sm text-ink-3">Formato</dt>
                <dd className="body-md font-medium!">{formatoLabel[torneo.formato]}</dd>
                {formatoDesc[torneo.formato] && (
                  <dd className="body-sm text-ink-3 mt-0.5">{formatoDesc[torneo.formato]}</dd>
                )}
              </div>
              <div>
                <dt className="body-sm text-ink-3">Categoría género</dt>
                <dd className="body-md font-medium! capitalize">
                  {Array.isArray(torneo.categoriaGenero)
                    ? torneo.categoriaGenero.join(", ")
                    : torneo.categoria || "—"}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="body-sm text-ink-3">Categoría nivel</dt>
                <dd className="body-md font-medium!">
                  {torneo.categoriasConfig ? (
                    <div className="flex flex-col gap-1">
                      {Object.entries(torneo.categoriasConfig).map(([genero, niveles]) => (
                        <div key={genero} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span>{capitalizar(genero)}:</span>
                          {(Array.isArray(niveles) ? niveles : []).map((nivel) => (
                            <span key={nivel} className="inline-flex items-center gap-1 font-normal">
                              <MarcaCategoria cat={nivel} size={20} />
                              {nivel}
                            </span>
                          ))}
                        </div>
                      ))}
                    </div>
                  ) : (
                    torneo.nivel || "—"
                  )}
                </dd>
              </div>
              <div>
                <dt className="body-sm text-ink-3">Máx. parejas</dt>
                <dd className="body-md font-medium! pd-tnum">{torneo.maxParejas}</dd>
              </div>
              <div>
                <dt className="body-sm text-ink-3">Sets por partido</dt>
                <dd className="body-md font-medium!">
                  {torneo.sets} set{torneo.sets > 1 ? "s" : ""}
                </dd>
              </div>
              <div>
                <dt className="body-sm text-ink-3">Games por set</dt>
                <dd className="body-md font-medium!">{torneo.gamesPorSet} games</dd>
              </div>
              <div>
                <dt className="body-sm text-ink-3">Inscripción</dt>
                <dd className="body-md font-medium! pd-tnum">
                  {torneo.inscripcion > 0
                    ? formatPrecio(torneo.inscripcion)
                    : "Gratuita"}
                </dd>
              </div>
              <div>
                <dt className="body-sm text-ink-3">Super tiebreak</dt>
                <dd className="body-md font-medium!">{torneo.superTiebreak ? "Sí" : "No"}</dd>
              </div>
              <div>
                <dt className="body-sm text-ink-3">Fecha inicio</dt>
                <dd className="body-md font-medium! pd-tnum">{formatFecha(torneo.fechaInicio)}</dd>
              </div>
              <div>
                <dt className="body-sm text-ink-3">Fecha fin</dt>
                <dd className="body-md font-medium! pd-tnum">{formatFecha(torneo.fechaFin)}</dd>
              </div>
            </dl>

            {/* Redes organizador */}
            {(torneo.instagramOrganizador ||
              torneo.facebookOrganizador ||
              torneo.whatsappOrganizador) && (
              <div className="mt-4 pt-4 border-t border-line">
                <p className="pd-eyebrow mb-2!">Redes del organizador</p>
                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {torneo.instagramOrganizador && (
                    <div>
                      <dt className="body-sm text-ink-3">Instagram</dt>
                      <dd className="body-md font-medium!">{torneo.instagramOrganizador}</dd>
                    </div>
                  )}
                  {torneo.facebookOrganizador && (
                    <div>
                      <dt className="body-sm text-ink-3">Facebook</dt>
                      <dd className="body-md font-medium!">{torneo.facebookOrganizador}</dd>
                    </div>
                  )}
                  {torneo.whatsappOrganizador && (
                    <div>
                      <dt className="body-sm text-ink-3">WhatsApp</dt>
                      <dd className="body-md font-medium! pd-tnum">{torneo.whatsappOrganizador}</dd>
                    </div>
                  )}
                </dl>
              </div>
            )}

            {/* Descripción */}
            {torneo.descripcion && (
              <div className="mt-4 pt-4 border-t border-line">
                <p className="pd-eyebrow mb-1!">Descripción</p>
                <p className="body-md">{torneo.descripcion}</p>
              </div>
            )}

            {/* Reglamento */}
            {torneo.reglamento && (
              <div className="mt-4 pt-4 border-t border-line">
                <p className="pd-eyebrow mb-1!">Reglamento</p>
                <p className="body-md whitespace-pre-line">{torneo.reglamento}</p>
              </div>
            )}
          </Card>

          {/* Sede: club de Padely vinculado (con sus canchas) u otra sede en texto */}
          <Card>
            <Card.Row className="mb-3">
              <Card.Title as="h2">Sede</Card.Title>
              {sede.estado === "pendiente" && (
                <Badge tone="warning" dot className="whitespace-normal! h-auto! py-1!">
                  Esperando confirmación de {sede.nombre}
                </Badge>
              )}
              {sede.estado === "rechazado" && (
                <Badge tone="danger" dot>
                  Sede rechazada
                </Badge>
              )}
            </Card.Row>
            <div className="flex flex-col gap-2">
              {sede.clubId ? (
                <Link
                  to={`/club/${sede.clubId}`}
                  className="inline-flex items-center gap-2 self-start body-md font-medium! text-court hover:underline"
                >
                  {sede.nombre || "Club"}
                  <ExternalLink className="pd-icon" size={20} aria-hidden="true" />
                </Link>
              ) : (
                <p className="body-md font-medium!">{sede.nombre || "—"}</p>
              )}
              {sede.estado === "rechazado" && <p className="body-sm text-ink-2">Elegí otra sede</p>}
              {(direccionSede || ciudadSede) && (
                <p className="flex items-start gap-2 body-sm text-ink-2">
                  <MapPin className="pd-icon text-ink-3" size={20} aria-hidden="true" />
                  <span>{[direccionSede, ciudadSede].filter(Boolean).join(" · ")}</span>
                </p>
              )}
              {(torneo.instagramSede || torneo.facebookSede) && (
                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {torneo.instagramSede && (
                    <div>
                      <dt className="body-sm text-ink-3">Instagram sede</dt>
                      <dd className="body-md font-medium!">{torneo.instagramSede}</dd>
                    </div>
                  )}
                  {torneo.facebookSede && (
                    <div>
                      <dt className="body-sm text-ink-3">Facebook sede</dt>
                      <dd className="body-md font-medium!">{torneo.facebookSede}</dd>
                    </div>
                  )}
                </dl>
              )}
              <div className="mt-2">
                <p className="pd-eyebrow mb-2!">Canchas</p>
                {canchasTorneo.length > 0 ? (
                  <ul className="flex flex-wrap gap-2">
                    {canchasTorneo.map((c) => (
                      <li key={c.id}>
                        <Badge>{c.nombre}</Badge>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="body-sm text-ink-3">Sin canchas cargadas</p>
                )}
              </div>
              {sede.estado === "pendiente" && (
                <p className="pd-help">Los turnos del club se bloquean cuando el club confirme la sede.</p>
              )}
            </div>
          </Card>

          {/* Cuadros: un sorteo por categoría */}
          <Card>
            <Card.Title as="h2" className="mb-1!">
              Cuadros
            </Card.Title>
            <p className="body-sm text-ink-2 mb-3">
              Cada categoría se juega como un cuadro independiente, con sus propios grupos, bracket y campeones.
            </p>
            <ul className="flex flex-col gap-2">
              {cuadros.map((c) => {
                const datos = datosPorCuadro[c.id];
                const n = datos.parejas.length;
                const etiqueta = etiquetaEstadoCuadro(torneo, datos);
                return (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-3 rounded-md bg-surface-sunken px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="heading-sm flex items-center gap-2">
                        <MarcaCategoria cat={c.nivel} size={20} />
                        {c.label}
                      </p>
                      <p className="body-sm text-ink-3">
                        {n} pareja{n !== 1 ? "s" : ""}{n === 0 ? " — sin parejas, no se juega" : ""}
                      </p>
                    </div>
                    <Badge tone={tonoEstadoCuadro[etiqueta] || "neutral"}>{etiqueta}</Badge>
                  </li>
                );
              })}
            </ul>
            {sinCuadro.length > 0 && (
              <p className="flex items-start gap-2 body-sm text-warning mt-3">
                <AlertTriangle className="pd-icon" size={20} aria-hidden="true" />
                <span>
                  {sinCuadro.length} pareja{sinCuadro.length !== 1 ? "s" : ""} sin categoría — asignales una en la pestaña Parejas
                </span>
              </p>
            )}
          </Card>

          {/* Acciones del torneo */}
          <Card>
            <Card.Title as="h2" className="mb-4!">
              Acciones
            </Card.Title>
            <div className="flex flex-col gap-3">
              {/* Acción principal según estado */}
              {torneo.status === "inscripcion" && (
                <Button
                  variant="primary"
                  block
                  onClick={async () => {
                    // Cada cuadro con parejas necesita el mínimo (3; 2 en eliminación directa) y ninguna pareja puede
                    // quedar sin cuadro
                    const minParejas = torneo.formato === "eliminacion" ? 2 : 3;
                    const problemas = [];
                    const conParejas = cuadros.filter((c) => datosPorCuadro[c.id].parejas.length > 0);
                    if (parejasStepper.length === 0) problemas.push("No hay parejas inscriptas.");
                    conParejas.forEach((c) => {
                      const n = datosPorCuadro[c.id].parejas.length;
                      if (n < minParejas) {
                        problemas.push(
                          variosCuadros
                            ? `${c.label} tiene ${n} pareja${n !== 1 ? "s" : ""}; necesita ${minParejas}. Reasignalas o quitá la categoría.`
                            : `Necesitás al menos ${minParejas} parejas (tenés ${n}).`,
                        );
                      }
                    });
                    if (sinCuadro.length > 0) {
                      problemas.push(
                        `${sinCuadro.length} pareja${sinCuadro.length !== 1 ? "s" : ""} sin categoría: asignales una en la pestaña Parejas antes de iniciar.`,
                      );
                    }
                    if (problemas.length > 0) {
                      await confirmar({
                        titulo: "No se puede iniciar el torneo",
                        mensaje: problemas.join("\n"),
                        confirmText: "Entendido",
                        cancelText: "Cerrar",
                      });
                      return;
                    }
                    const ok = await confirmar({
                      titulo: "Iniciar torneo",
                      mensaje: "¿Cerrar inscripciones y comenzar el torneo?",
                      confirmText: "Iniciar",
                    });
                    if (!ok) return;
                    const seguro = await confirmar({
                      titulo: "¿Estás seguro?",
                      mensaje: "Una vez iniciado, no se pueden modificar las inscripciones.",
                      confirmText: "Sí, iniciar",
                      danger: true,
                    });
                    if (seguro) cambiarEstado("en_curso");
                  }}
                >
                  Iniciar torneo
                </Button>
              )}
              {torneo.status === "en_curso" && (
                <Button
                  variant="primary"
                  block
                  onClick={async () => {
                    // Avisa qué cuadros no están terminados, pero deja finalizar igual
                    const sinTerminar = cuadros
                      .filter((c) => datosPorCuadro[c.id].parejas.length > 0)
                      .map((c) => ({ cuadro: c, estado: estadoDeCuadro(torneo, datosPorCuadro[c.id]) }))
                      .filter((x) => !x.estado.terminado);
                    const aviso = sinTerminar.length === 0
                      ? ""
                      : variosCuadros
                        ? `Cuadros sin terminar: ${sinTerminar.map((x) => `${x.cuadro.label} (${x.estado.motivo})`).join(", ")}.\n`
                        : `El torneo no está terminado (${sinTerminar[0].estado.motivo}).\n`;
                    const ok = await confirmar({
                      titulo: "Finalizar torneo",
                      mensaje: `${aviso}¿Finalizar el torneo${aviso ? " de todos modos" : ""}?`,
                      confirmText: "Finalizar",
                    });
                    if (!ok) return;
                    const seguro = await confirmar({
                      titulo: "¿Estás seguro?",
                      mensaje: "Esta acción no se puede deshacer. Se asignarán los puntos finales.",
                      confirmText: "Sí, finalizar",
                      danger: true,
                    });
                    if (seguro) cambiarEstado("finalizado");
                  }}
                >
                  Finalizar torneo
                </Button>
              )}
              {torneo.status === "finalizado" && (
                <p className="body-sm text-ink-3 text-center rounded-md bg-surface-sunken py-2">Torneo finalizado</p>
              )}

              {/* Compartir */}
              <Field label="Link público" as="div">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input readOnly value={linkPublico} aria-label="Link público del torneo" className="flex-1" />
                  <Button
                    icon={<Copy className="pd-icon" size={20} aria-hidden="true" />}
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/torneos/${id}`);
                    }}
                  >
                    Copiar link
                  </Button>
                </div>
              </Field>
              <div className="pd-btn-group">
                <Button
                  icon={<Eye className="pd-icon" size={20} aria-hidden="true" />}
                  onClick={() => window.open(`/torneos/${id}`, "_blank")}
                >
                  Ver como jugador
                </Button>
                <Button
                  icon={<MessageCircle className="pd-icon" size={20} aria-hidden="true" />}
                  onClick={() => {
                    const url = `https://wa.me/?text=${encodeURIComponent(`¡Inscribite al torneo ${torneo.nombre}! ${window.location.origin}/torneos/${id}`)}`;
                    window.open(url, "_blank");
                  }}
                >
                  WhatsApp
                </Button>
              </div>

              {/* Cancelar */}
              {torneo.status !== "cancelado" && torneo.status !== "finalizado" && (
                <Button
                  variant="ghost"
                  block
                  className="text-danger!"
                  onClick={async () => {
                    const ok = await confirmar({
                      titulo: "Cancelar torneo",
                      mensaje: "¿Cancelar el torneo? Esta acción no se puede deshacer.",
                      confirmText: "Cancelar torneo",
                      cancelText: "Volver",
                      danger: true,
                    });
                    if (ok) cambiarEstado("cancelado");
                  }}
                >
                  Cancelar torneo
                </Button>
              )}
            </div>
          </Card>

          {/* Tip contextual */}
          {torneo.status === "inscripcion" && (
            <Nota icon={Info}>
              <strong>Tip:</strong> Podés iniciar el torneo cuando hayas confirmado todas las parejas. Las inscripciones se cerrarán automáticamente.
            </Nota>
          )}
          {torneo.status === "en_curso" && (
            <Nota icon={Info}>
              <strong>Tip:</strong> Cargá los resultados desde la pestaña Grupos o Bracket. Al finalizar, se otorgarán puntos automáticamente.
            </Nota>
          )}
          {torneo.status === "finalizado" && (
            <Nota icon={Check}>El torneo ha finalizado. Podés revisar los reclamos desde la pestaña correspondiente.</Nota>
          )}

          {/* Premios */}
          {torneo.premios && (
            <Card>
              <Card.Title as="h2" className="mb-2!">
                Premios
              </Card.Title>
              <p className="body-md text-ink-2 whitespace-pre-line">{torneo.premios}</p>
            </Card>
          )}

          {/* Qué incluye la inscripción */}
          {torneo.inscripcionIncluye && (
            <Card>
              <Card.Title as="h2" className="mb-2!">
                Incluye la inscripción
              </Card.Title>
              <p className="body-md text-ink-2 whitespace-pre-line">{torneo.inscripcionIncluye}</p>
            </Card>
          )}

          {/* Administradores */}
          {torneo.administradores && torneo.administradores.length > 0 && (
            <Card>
              <Card.Title as="h2" className="mb-3!">
                Administradores
              </Card.Title>
              <ul className="flex flex-col gap-2">
                {torneo.administradores.map((admin, i) => (
                  <li key={i} className="flex items-center gap-3">
                    <span
                      className="flex h-8 w-8 flex-none items-center justify-center rounded-pill bg-surface-sunken caption text-ink"
                      aria-hidden="true"
                    >
                      {(admin.nombre || admin.email || "A").charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="body-md font-medium!">{admin.nombre || admin.email}</p>
                      {admin.nombre && <p className="body-sm text-ink-3">{admin.email}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      {/* MODO EDICIÓN */}
      {tab === "Info" && editando && (
        <div className="flex flex-col gap-4">
          <Card>
            <Card.Row className="mb-4">
              <Card.Title as="h2">Editando torneo</Card.Title>
              <div className="pd-btn-group">
                <Button variant="ghost" onClick={cancelarEdicion}>
                  Cancelar
                </Button>
                <Button variant="primary" onClick={guardarEdicion} cargando={guardandoEdit ? "Guardando…" : ""}>
                  Guardar
                </Button>
              </div>
            </Card.Row>

            <div className="flex flex-col gap-4">
              <Field label="Nombre del torneo">
                <Input type="text" value={editForm.nombre} onChange={setEdit("nombre")} />
              </Field>

              <Field label="Descripción">
                <Textarea value={editForm.descripcion || ""} onChange={setEdit("descripcion")} rows={3} />
              </Field>

              {/* Categoría Género */}
              <Field
                label="Categoría género"
                as="div"
                help={bloqueoCategorias ? "No se pueden cambiar las categorías después de generar un cuadro" : undefined}
              >
                <div className="pd-pills" role="group" aria-label="Categoría género">
                  {["masculino", "femenino", "mixto"].map((g) => (
                    <button
                      key={g}
                      type="button"
                      className="pd-pill disabled:opacity-50 disabled:cursor-not-allowed!"
                      disabled={bloqueoCategorias}
                      aria-pressed={(editForm.categoriaGenero || []).includes(g)}
                      onClick={() => toggleGeneroEdit(g)}
                    >
                      {capitalizar(g)}
                    </button>
                  ))}
                </div>
              </Field>

              {/* Categoría Nivel por género */}
              {(editForm.categoriaGenero || []).map((genero) => (
                <Field key={genero} label={`Categoría nivel — ${capitalizar(genero)}`} as="div">
                  {chipsNivelEdit(genero)}
                </Field>
              ))}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Formato">
                  <Select value={editForm.formato} onChange={setEdit("formato")}>
                    <option value="mini">Mini torneo</option>
                    <option value="normal">Torneo normal</option>
                    <option value="liga">Liga</option>
                    <option value="eliminacion">Eliminación directa</option>
                  </Select>
                </Field>
                <Field label="Máx. parejas">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min="4"
                    max="256"
                    value={editForm.maxParejas}
                    onChange={setEdit("maxParejas")}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Sets por partido">
                  <Select value={editForm.sets} onChange={setEdit("sets")}>
                    <option value={1}>1 set</option>
                    <option value={3}>3 sets</option>
                  </Select>
                </Field>
                <Field label="Games por set">
                  <Select value={editForm.gamesPorSet} onChange={setEdit("gamesPorSet")}>
                    <option value={4}>4 games</option>
                    <option value={6}>6 games</option>
                  </Select>
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Inscripción ($)">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    value={editForm.inscripcion}
                    onChange={setEdit("inscripcion")}
                  />
                </Field>
                <label className="flex items-center gap-3 body-md md:self-end md:pb-3">
                  <input
                    type="checkbox"
                    checked={editForm.superTiebreak || false}
                    onChange={setEdit("superTiebreak")}
                    className="h-5 w-5 accent-ink"
                  />
                  Super tiebreak
                </label>
              </div>

              <SeccionSede
                tipoSede={tipoSedeEdit}
                onTipoSede={cambiarTipoSedeEdit}
                clubes={clubes}
                clubPropio={clubPropio}
                clubId={clubIdEdit}
                onClubId={elegirClubEdit}
                busqueda={busquedaClub}
                onBusqueda={setBusquedaClub}
                canchasClub={canchasClubEdit}
                cargandoCanchas={cargandoCanchas}
                canchasSel={canchasSelEdit}
                onToggleCancha={toggleCanchaEdit}
                errorCanchas={errorCanchas}
              >
                <Field label="Sede">
                  <Input type="text" value={editForm.sede || ""} onChange={setEdit("sede")} />
                </Field>
                <Field label="Dirección">
                  <Input type="text" value={editForm.direccionSede || ""} onChange={setEdit("direccionSede")} />
                </Field>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Field label="Instagram sede">
                    <Input type="text" value={editForm.instagramSede || ""} onChange={setEdit("instagramSede")} />
                  </Field>
                  <Field label="Facebook sede">
                    <Input type="text" value={editForm.facebookSede || ""} onChange={setEdit("facebookSede")} />
                  </Field>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Field label="Ciudad">
                    <Input type="text" value={editForm.ciudad || ""} onChange={setEdit("ciudad")} />
                  </Field>
                  <Field label="Provincia">
                    <Select value={editForm.provincia || ""} onChange={setEdit("provincia")}>
                      <option value="">Seleccionar</option>
                      {provinciasArgentina.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <Field label="Canchas" help="Separadas por coma">
                  <Input
                    type="text"
                    placeholder="Cancha 1, Cancha 2"
                    value={canchasTextoEdit}
                    onChange={(e) => setCanchasTextoEdit(e.target.value)}
                  />
                </Field>
              </SeccionSede>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Fecha inicio">
                  <Input type="date" value={editForm.fechaInicio} onChange={setEdit("fechaInicio")} />
                </Field>
                <Field label="Fecha fin">
                  <Input type="date" value={editForm.fechaFin} onChange={setEdit("fechaFin")} />
                </Field>
              </div>

              <Field label="Reglamento">
                <Textarea value={editForm.reglamento || ""} onChange={setEdit("reglamento")} rows={4} />
              </Field>

              <Field label="Instagram organizador">
                <Input
                  type="text"
                  value={editForm.instagramOrganizador || ""}
                  onChange={setEdit("instagramOrganizador")}
                />
              </Field>
              <Field label="Facebook organizador">
                <Input
                  type="text"
                  value={editForm.facebookOrganizador || ""}
                  onChange={setEdit("facebookOrganizador")}
                />
              </Field>
              <Field label="WhatsApp organizador">
                <Input
                  type="text"
                  inputMode="tel"
                  value={editForm.whatsappOrganizador || ""}
                  onChange={setEdit("whatsappOrganizador")}
                />
              </Field>
            </div>
          </Card>
        </div>
      )}

      {/* Tab de parejas reemplazado por el componente independiente */}
      {tab === "Parejas" && <TabParejas torneoId={id} torneo={torneo} onParejasChange={setParejasStepper} />}
      {tab === "Grupos" && (
        <>
          {selectorCuadros}
          <TabGrupos key={cuadroActual.id} torneoId={id} torneo={torneo} cuadro={cuadroActual} onGruposChange={onGruposDelCuadro} />
        </>
      )}
      {tab === "Liga" && (
        <>
          {selectorCuadros}
          <TabGrupos key={cuadroActual.id} torneoId={id} torneo={torneo} modoLiga={true} cuadro={cuadroActual} onGruposChange={onGruposDelCuadro} />
        </>
      )}
      {tab === "Bracket" && (
        <>
          {selectorCuadros}
          <TabBracket key={cuadroActual.id} torneoId={id} torneo={torneo} cuadro={cuadroActual} onBracketChange={onBracketDelCuadro} />
        </>
      )}
      {tab === "Reclamos" && <TabReclamos torneoId={id} torneo={torneo} />}
    </div>
  );
}
