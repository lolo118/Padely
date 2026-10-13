import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getTorneoById, actualizarTorneo, getParejas, getGrupos, getCuadros } from "../../services/torneoService";
import { cuadrosDeTorneo, parejasDeCuadro, parejasSinCuadro, cuadroDeGrupo } from "../../utils/torneo";
import { toast } from "../../components/Toast";
import { confirmar } from "../../components/ConfirmDialog";

import TabGrupos from "./TabGrupos";
import TabBracket from "./TabBracket";
import TabParejas from "./TabParejas";
import TabReclamos from "./TabReclamos";
import { formatFecha } from "../../utils/formatDate";
import { CATEGORIAS_TORNEO } from "../../utils/categorias";
import { formatPrecio } from "../../utils/format";

const estadoBadge = {
  inscripcion: "bg-blue-100 text-blue-700",
  en_curso: "bg-green-100 text-green-700",
  finalizado: "bg-[var(--bg-card-hover)] text-[var(--text-muted)]",
  cancelado: "bg-red-100 text-red-500",
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

const inputClass =
  "themed-input rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 w-full";
const selectClass =
  "themed-input rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 w-full";
const labelClass = "text-xs font-semibold mb-1 block";

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

// Stepper por cuadro: el paso actual es el del cuadro menos avanzado entre los que tienen parejas;
// las acciones pendientes se listan por cuadro (con su nombre cuando hay más de uno).
// Un cuadro sin parejas no se juega y no cuenta acá.
function TournamentStepper({ torneo, cuadros, datosPorCuadro, parejasSinCuadro: sinCuadro }) {
  const steps = torneo.formato === "liga"
    ? [
        { key: "inscripcion", label: "Inscripción", icon: "📝" },
        { key: "fixture", label: "Fixture", icon: "📋" },
        { key: "en_curso", label: "En curso", icon: "🎾" },
        { key: "finalizado", label: "Finalizado", icon: "🏆" },
      ]
    : torneo.formato === "eliminacion"
    ? [
        { key: "inscripcion", label: "Inscripción", icon: "📝" },
        { key: "en_curso", label: "En curso", icon: "🎾" },
        { key: "bracket", label: "Bracket", icon: "🏆" },
        { key: "finalizado", label: "Finalizado", icon: "🎉" },
      ]
    : [
        { key: "inscripcion", label: "Inscripción", icon: "📝" },
        { key: "grupos", label: "Grupos", icon: "👥" },
        { key: "en_curso", label: "En curso", icon: "🎾" },
        { key: "bracket", label: "Bracket", icon: "🏆" },
        { key: "finalizado", label: "Finalizado", icon: "🎉" },
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
    <div className="themed-card rounded-2xl p-5 border mb-4">
      <div className="flex items-center justify-between mb-4">
        {steps.map((step, i) => (
          <div key={step.key} className="flex items-center flex-1">
            <div className="flex flex-col items-center flex-1">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center text-lg mb-1 transition ${i <= currentIdx ? "" : "opacity-30"}`}
                style={{
                  backgroundColor: i === currentIdx ? "var(--accent)" : i < currentIdx ? "rgba(34,197,94,0.15)" : "var(--bg-card-hover)",
                }}
              >
                {i < currentIdx ? "✓" : step.icon}
              </div>
              <span className="text-[10px] font-semibold text-center"
                style={{ color: i <= currentIdx ? "var(--text-primary)" : "var(--text-muted)" }}>
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className="h-0.5 flex-1 mx-1 rounded-full mt-[-14px]"
                style={{ backgroundColor: i < currentIdx ? "var(--accent)" : "var(--bg-card-hover)" }} />
            )}
          </div>
        ))}
      </div>
      {pendingActions.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {pendingActions.map((action, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg px-3 py-2"
              style={{ backgroundColor: "var(--bg-card-hover)" }}>
              <span className="text-xs">💡</span>
              <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{action}</span>
            </div>
          ))}
        </div>
      )}
    </div>
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
      } catch (err) {
        console.error("Error al cargar torneo:", err);
      }
      setLoading(false);
    };
    cargar();
  }, [id]);

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

  const iniciarEdicion = () => {
    setEditForm({ ...torneo });
    setEditando(true);
  };

  const cancelarEdicion = () => {
    setEditando(false);
    setEditForm(null);
  };

  const guardarEdicion = async () => {
    setGuardandoEdit(true);
    try {
      const {
        id: _,
        createdAt: _ca,
        status: _st,
        organizerId: _oi,
        ...datosActualizar
      } = editForm;
      await actualizarTorneo(id, datosActualizar);
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
    return <div className="text-center py-12" style={{ color: "var(--text-muted)" }}>Cargando...</div>;

  if (!torneo)
    return (
      <div className="text-center py-12" style={{ color: "var(--text-muted)" }}>
        Torneo no encontrado
      </div>
    );

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

  const selectorCuadros = variosCuadros ? (
    <div className="flex flex-wrap gap-2 mb-4">
      {cuadros.map((c) => {
        const n = datosPorCuadro[c.id].parejas.length;
        const activo = c.id === cuadroActual.id;
        return (
          <button
            key={c.id}
            onClick={() => {
              setCuadroSel(c.id);
              setCuadroElegido(true);
            }}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold transition border"
            style={
              activo
                ? { backgroundColor: "var(--accent)", color: "white", borderColor: "var(--accent)" }
                : { backgroundColor: "var(--bg-card)", color: "var(--text-secondary)", borderColor: "var(--border-card)" }
            }
          >
            {c.label} <span className="font-normal opacity-80">({n} pareja{n !== 1 ? "s" : ""})</span>
          </button>
        );
      })}
    </div>
  ) : null;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="text-xl hover:opacity-70"
          style={{ color: "var(--text-muted)" }}
        >
          ←
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>{torneo.nombre}</h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {torneo.sede} — {torneo.ciudad}, {torneo.provincia}
          </p>
        </div>
        <span
          className={`text-xs font-semibold px-3 py-1 rounded-full ${estadoBadge[torneo.status]}`}
        >
          {estadoLabel[torneo.status]}
        </span>

        {/* Notificar */}
        {mostrarNotificar && (
          <div className="fixed inset-0 z-10" onClick={() => setMostrarNotificar(false)} />
        )}
        <div className="relative">
          <button
            onClick={() => setMostrarNotificar(!mostrarNotificar)}
            className="px-3 py-2 rounded-xl text-sm font-semibold transition"
            style={{ backgroundColor: "#25d366", color: "white" }}
          >
            📱
          </button>
          {mostrarNotificar && (
            <div className="absolute right-0 top-12 themed-card rounded-xl border shadow-lg p-3 z-20 w-72">
              <p className="text-xs font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
                Enviar mensaje por WhatsApp
              </p>
              <div className="flex flex-col gap-1.5">
                {torneo.status === "en_curso" && (
                  <button
                    onClick={() => {
                      const msg = encodeURIComponent(`¡Los grupos del torneo "${torneo.nombre}" ya fueron publicados! Consultá tus partidos acá: ${window.location.origin}/torneos/${id}`);
                      window.open(`https://wa.me/?text=${msg}`, "_blank");
                      setMostrarNotificar(false);
                    }}
                    className="text-left rounded-lg px-3 py-2 text-xs transition hover:opacity-80"
                    style={{ backgroundColor: "var(--bg-card-hover)", color: "var(--text-secondary)" }}
                  >
                    📋 Grupos publicados — compartir link
                  </button>
                )}
                <button
                  onClick={() => {
                    const msg = encodeURIComponent(`📢 Información del torneo "${torneo.nombre}"\n📍 Sede: ${torneo.sede}\n📅 Fecha: ${formatFecha(torneo.fechaInicio)}\n🔗 Más info: ${window.location.origin}/torneos/${id}`);
                    window.open(`https://wa.me/?text=${msg}`, "_blank");
                    setMostrarNotificar(false);
                  }}
                  className="text-left rounded-lg px-3 py-2 text-xs transition hover:opacity-80"
                  style={{ backgroundColor: "var(--bg-card-hover)", color: "var(--text-secondary)" }}
                >
                  📢 Info general del torneo
                </button>
                {torneo.status === "inscripcion" && (
                  <button
                    onClick={() => {
                      const cats = torneo.categoriasConfig ? Object.values(torneo.categoriasConfig).flat().join(", ") : "";
                      const msg = encodeURIComponent(`🏆 ¡Inscripciones abiertas!\n\nTorneo: ${torneo.nombre}\n📍 ${torneo.sede}, ${torneo.ciudad}\n📅 ${formatFecha(torneo.fechaInicio)}\n🎾 Categorías: ${cats}\n💰 Inscripción: ${torneo.inscripcion > 0 ? formatPrecio(torneo.inscripcion) : "Gratis"}\n\n✍️ Inscribite acá: ${window.location.origin}/torneos/${id}`);
                      window.open(`https://wa.me/?text=${msg}`, "_blank");
                      setMostrarNotificar(false);
                    }}
                    className="text-left rounded-lg px-3 py-2 text-xs transition hover:opacity-80"
                    style={{ backgroundColor: "var(--bg-card-hover)", color: "var(--text-secondary)" }}
                  >
                    📝 Invitar a inscribirse
                  </button>
                )}
                {torneo.status === "finalizado" && (
                  <button
                    onClick={() => {
                      const msg = encodeURIComponent(`🏆 ¡Finalizó el torneo "${torneo.nombre}"!\n\nMirá los resultados acá: ${window.location.origin}/torneos/${id}`);
                      window.open(`https://wa.me/?text=${msg}`, "_blank");
                      setMostrarNotificar(false);
                    }}
                    className="text-left rounded-lg px-3 py-2 text-xs transition hover:opacity-80"
                    style={{ backgroundColor: "var(--bg-card-hover)", color: "var(--text-secondary)" }}
                  >
                    🎉 Compartir resultados finales
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <TournamentStepper torneo={torneo} cuadros={cuadros} datosPorCuadro={datosPorCuadro} parejasSinCuadro={sinCuadro.length} />

      {mostrarAyuda && (
        <div className="themed-card rounded-2xl p-4 border mb-4" style={{ borderColor: "rgba(59,130,246,0.2)", backgroundColor: "rgba(59,130,246,0.04)" }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-sm">💡</span>
              <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>¿Sabías que...?</span>
            </div>
            <button onClick={() => setMostrarAyuda(false)} className="text-xs font-semibold px-2 py-1 rounded-lg transition" style={{ color: "var(--text-muted)" }}>
              Ocultar
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {torneo.status === "inscripcion" && (
              <>
                <div className="flex items-start gap-2">
                  <span className="text-xs mt-0.5">📝</span>
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Cuando un jugador se inscribe, recibís una <strong>notificación automática</strong> en la campana de la app.</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-xs mt-0.5">🔗</span>
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Podés <strong>vincular jugadores a sus parejas</strong> desde la pestaña Parejas. Cada jugador recibe un link único para asociar su cuenta.</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-xs mt-0.5">📱</span>
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Usá el botón <strong>"📱"</strong> para compartir la info del torneo por WhatsApp e invitar jugadores a inscribirse.</p>
                </div>
              </>
            )}
            {torneo.status === "en_curso" && (
              <>
                <div className="flex items-start gap-2">
                  <span className="text-xs mt-0.5">🎾</span>
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Cuando asignás <strong>horario y cancha</strong> a un partido, los jugadores vinculados reciben una notificación automática.</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-xs mt-0.5">📊</span>
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Al cargar un resultado, los <strong>puntos se calculan automáticamente</strong> y los jugadores reciben notificación.</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-xs mt-0.5">⚡</span>
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Usá <strong>"Guardar y cargar siguiente"</strong> en el modal de resultados para cargar varios partidos en secuencia.</p>
                </div>
                {torneo.formato === "liga" && (
                  <div className="flex items-start gap-2">
                    <span className="text-xs mt-0.5">📋</span>
                    <p className="text-xs" style={{ color: "var(--text-secondary)" }}>En formato <strong>Liga</strong>, todas las parejas juegan entre sí. Los partidos están organizados por <strong>fechas</strong>. El líder de la tabla al finalizar es el campeón.</p>
                  </div>
                )}
                {torneo.habilitarReclamos && (
                  <div className="flex items-start gap-2">
                    <span className="text-xs mt-0.5">⚠️</span>
                    <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Los jugadores vinculados pueden <strong>abrir reclamos</strong>. Revisalos en la pestaña Reclamos.</p>
                  </div>
                )}
              </>
            )}
            {torneo.status === "finalizado" && (
              <>
                <div className="flex items-start gap-2">
                  <span className="text-xs mt-0.5">🏆</span>
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Los <strong>puntos de campeón y subcampeón</strong> ya fueron asignados automáticamente a los jugadores vinculados.</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-xs mt-0.5">📱</span>
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Compartí los resultados finales por WhatsApp con el botón <strong>"📱"</strong>.</p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="flex gap-2 mb-6 border-b" style={{ borderColor: "var(--border-card)" }}>
        {getTabs(torneo?.formato || "normal").map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-semibold transition border-b-2 -mb-px ${
              tab === t
                ? "border-green-600 text-green-600"
                : "border-transparent hover:opacity-80"
            }`}
            style={tab !== t ? { color: "var(--text-muted)" } : {}}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Info" && !editando && (
        <div className="flex flex-col gap-4">
          <div className="themed-card rounded-2xl p-5 border">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>
                Detalles del torneo
              </h2>
              <button
                onClick={iniciarEdicion}
                className="text-xs font-semibold text-green-600 hover:underline"
              >
                Editar
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="block" style={{ color: "var(--text-muted)" }}>Formato</span>
                <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                  {formatoLabel[torneo.formato]}
                </span>
                {formatoDesc[torneo.formato] && (
                  <span className="text-xs mt-0.5 block" style={{ color: "var(--text-muted)" }}>
                    {formatoDesc[torneo.formato]}
                  </span>
                )}
              </div>
              <div>
                <span className="block" style={{ color: "var(--text-muted)" }}>Categoría Género</span>
                <span className="font-medium capitalize" style={{ color: "var(--text-primary)" }}>
                  {Array.isArray(torneo.categoriaGenero)
                    ? torneo.categoriaGenero.join(", ")
                    : torneo.categoria || "—"}
                </span>
              </div>
              <div>
                <span className="block" style={{ color: "var(--text-muted)" }}>Categoría Nivel</span>
                <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                  {torneo.categoriasConfig
                    ? Object.entries(torneo.categoriasConfig)
                        .map(
                          ([genero, niveles]) =>
                            `${genero.charAt(0).toUpperCase() + genero.slice(1)}: ${niveles.join(", ")}`,
                        )
                        .join(" | ")
                    : torneo.nivel || "—"}
                </span>
              </div>
              <div>
                <span className="block" style={{ color: "var(--text-muted)" }}>Máx. parejas</span>
                <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                  {torneo.maxParejas}
                </span>
              </div>
              <div>
                <span className="block" style={{ color: "var(--text-muted)" }}>Sets por partido</span>
                <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                  {torneo.sets} set{torneo.sets > 1 ? "s" : ""}
                </span>
              </div>
              <div>
                <span className="block" style={{ color: "var(--text-muted)" }}>Games por set</span>
                <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                  {torneo.gamesPorSet} games
                </span>
              </div>
              <div>
                <span className="block" style={{ color: "var(--text-muted)" }}>Inscripción</span>
                <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                  {torneo.inscripcion > 0
                    ? formatPrecio(torneo.inscripcion)
                    : "Gratuita"}
                </span>
              </div>
              <div>
                <span className="block" style={{ color: "var(--text-muted)" }}>Super tiebreak</span>
                <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                  {torneo.superTiebreak ? "Sí" : "No"}
                </span>
              </div>
              <div>
                <span className="block" style={{ color: "var(--text-muted)" }}>Fecha inicio</span>
                <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                  {formatFecha(torneo.fechaInicio)}
                </span>
              </div>
              <div>
                <span className="block" style={{ color: "var(--text-muted)" }}>Fecha fin</span>
                <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                  {formatFecha(torneo.fechaFin)}
                </span>
              </div>
            </div>

            {/* Sede */}
            <div className="mt-3 pt-3 border-t" style={{ borderColor: "var(--border-card)" }}>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="block" style={{ color: "var(--text-muted)" }}>Sede</span>
                  <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                    {torneo.sede}
                  </span>
                </div>
                {torneo.direccionSede && (
                  <div>
                    <span className="block" style={{ color: "var(--text-muted)" }}>Dirección</span>
                    <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                      {torneo.direccionSede}
                    </span>
                  </div>
                )}
                {torneo.instagramSede && (
                  <div>
                    <span className="block" style={{ color: "var(--text-muted)" }}>Instagram sede</span>
                    <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                      {torneo.instagramSede}
                    </span>
                  </div>
                )}
                {torneo.facebookSede && (
                  <div>
                    <span className="block" style={{ color: "var(--text-muted)" }}>Facebook sede</span>
                    <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                      {torneo.facebookSede}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Redes organizador */}
            {(torneo.instagramOrganizador ||
              torneo.facebookOrganizador ||
              torneo.whatsappOrganizador) && (
              <div className="mt-3 pt-3 border-t" style={{ borderColor: "var(--border-card)" }}>
                <span className="text-sm block mb-2" style={{ color: "var(--text-muted)" }}>
                  Redes del organizador
                </span>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {torneo.instagramOrganizador && (
                    <div>
                      <span className="block" style={{ color: "var(--text-muted)" }}>Instagram</span>
                      <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                        {torneo.instagramOrganizador}
                      </span>
                    </div>
                  )}
                  {torneo.facebookOrganizador && (
                    <div>
                      <span className="block" style={{ color: "var(--text-muted)" }}>Facebook</span>
                      <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                        {torneo.facebookOrganizador}
                      </span>
                    </div>
                  )}
                  {torneo.whatsappOrganizador && (
                    <div>
                      <span className="block" style={{ color: "var(--text-muted)" }}>WhatsApp</span>
                      <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                        {torneo.whatsappOrganizador}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Descripción */}
            {torneo.descripcion && (
              <div className="mt-3 pt-3 border-t" style={{ borderColor: "var(--border-card)" }}>
                <span className="text-sm block mb-1" style={{ color: "var(--text-muted)" }}>
                  Descripción
                </span>
                <p className="text-sm" style={{ color: "var(--text-primary)" }}>{torneo.descripcion}</p>
              </div>
            )}

            {/* Reglamento */}
            {torneo.reglamento && (
              <div className="mt-3 pt-3 border-t" style={{ borderColor: "var(--border-card)" }}>
                <span className="text-sm block mb-1" style={{ color: "var(--text-muted)" }}>
                  Reglamento
                </span>
                <p className="text-sm whitespace-pre-line" style={{ color: "var(--text-primary)" }}>
                  {torneo.reglamento}
                </p>
              </div>
            )}
          </div>

          {/* Cuadros: un sorteo por categoría */}
          <div className="themed-card rounded-2xl p-5 border">
            <h2 className="font-semibold mb-1" style={{ color: "var(--text-primary)" }}>Cuadros</h2>
            <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
              Cada categoría se juega como un cuadro independiente, con sus propios grupos, bracket y campeones.
            </p>
            <div className="flex flex-col gap-2">
              {cuadros.map((c) => {
                const datos = datosPorCuadro[c.id];
                const n = datos.parejas.length;
                return (
                  <div
                    key={c.id}
                    className="flex items-center justify-between rounded-xl px-4 py-3"
                    style={{ backgroundColor: "var(--bg-card-hover)" }}
                  >
                    <div>
                      <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{c.label}</p>
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {n} pareja{n !== 1 ? "s" : ""}{n === 0 ? " — sin parejas, no se juega" : ""}
                      </p>
                    </div>
                    <span
                      className="text-xs font-semibold px-2 py-1 rounded-full"
                      style={{ backgroundColor: "var(--accent-light)", color: "var(--accent)" }}
                    >
                      {etiquetaEstadoCuadro(torneo, datos)}
                    </span>
                  </div>
                );
              })}
              {sinCuadro.length > 0 && (
                <p className="text-xs" style={{ color: "#b45309" }}>
                  ⚠ {sinCuadro.length} pareja{sinCuadro.length !== 1 ? "s" : ""} sin categoría — asignales una en la pestaña Parejas
                </p>
              )}
            </div>
          </div>

          {/* Acciones del torneo */}
          <div className="themed-card rounded-2xl p-5 border">
            <h2 className="font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Acciones</h2>

            {/* Acción principal según estado */}
            {torneo.status === "inscripcion" && (
              <button
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
                className="w-full py-2.5 rounded-xl text-sm font-semibold bg-green-600 text-white hover:bg-green-700 transition mb-3"
              >
                🚀 Iniciar torneo
              </button>
            )}
            {torneo.status === "en_curso" && (
              <button
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
                className="w-full py-2.5 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition mb-3"
              >
                🏆 Finalizar torneo
              </button>
            )}
            {torneo.status === "finalizado" && (
              <div className="text-sm text-center py-2 mb-3 rounded-xl" style={{ backgroundColor: "var(--bg-card-hover)", color: "var(--text-muted)" }}>
                Torneo finalizado
              </div>
            )}

            {/* Compartir */}
            <div className="flex gap-2 mb-3 flex-wrap">
              <button
                onClick={() => window.open(`/torneos/${id}`, "_blank")}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition flex items-center justify-center gap-2"
                style={{ backgroundColor: "var(--bg-card-hover)", color: "var(--text-primary)", border: "1px solid var(--border-card)" }}
              >
                👁️ Ver como jugador
              </button>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/torneos/${id}`);
                }}
                className="flex-1 py-2 rounded-xl text-xs font-semibold border transition hover:opacity-80"
                style={{ borderColor: "var(--border-card)", color: "var(--text-secondary)", backgroundColor: "var(--bg-card)" }}
              >
                🔗 Copiar link
              </button>
              <button
                onClick={() => {
                  const url = `https://wa.me/?text=${encodeURIComponent(`¡Inscribite al torneo ${torneo.nombre}! ${window.location.origin}/torneos/${id}`)}`;
                  window.open(url, "_blank");
                }}
                className="flex-1 py-2 rounded-xl text-xs font-semibold border transition hover:opacity-80"
                style={{ borderColor: "var(--border-card)", color: "var(--text-secondary)", backgroundColor: "var(--bg-card)" }}
              >
                💬 WhatsApp
              </button>
            </div>

            {/* Cancelar */}
            {torneo.status !== "cancelado" && torneo.status !== "finalizado" && (
              <button
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
                className="w-full py-2 rounded-xl text-xs font-semibold border text-red-400 hover:bg-red-500/10 transition"
                style={{ borderColor: "rgba(239,68,68,0.3)" }}
              >
                Cancelar torneo
              </button>
            )}
          </div>

          {/* Tip contextual */}
          {torneo.status === "inscripcion" && (
            <div className="rounded-xl px-4 py-3 text-sm border" style={{ backgroundColor: "rgba(59,130,246,0.07)", borderColor: "rgba(59,130,246,0.25)", color: "var(--text-secondary)" }}>
              💡 <strong>Tip:</strong> Podés iniciar el torneo cuando hayas confirmado todas las parejas. Las inscripciones se cerrarán automáticamente.
            </div>
          )}
          {torneo.status === "en_curso" && (
            <div className="rounded-xl px-4 py-3 text-sm border" style={{ backgroundColor: "rgba(34,197,94,0.07)", borderColor: "rgba(34,197,94,0.25)", color: "var(--text-secondary)" }}>
              💡 <strong>Tip:</strong> Cargá los resultados desde la pestaña Grupos o Bracket. Al finalizar, se otorgarán puntos automáticamente.
            </div>
          )}
          {torneo.status === "finalizado" && (
            <div className="rounded-xl px-4 py-3 text-sm border" style={{ backgroundColor: "var(--bg-card-hover)", borderColor: "var(--border-card)", color: "var(--text-muted)" }}>
              ✅ El torneo ha finalizado. Podés revisar los reclamos desde la pestaña correspondiente.
            </div>
          )}

          {/* Premios */}
          {torneo.premios && (
            <div className="themed-card rounded-2xl p-5 border">
              <h2 className="font-semibold mb-2" style={{ color: "var(--text-primary)" }}>Premios</h2>
              <p className="text-sm whitespace-pre-line" style={{ color: "var(--text-secondary)" }}>{torneo.premios}</p>
            </div>
          )}

          {/* Qué incluye la inscripción */}
          {torneo.inscripcionIncluye && (
            <div className="themed-card rounded-2xl p-5 border">
              <h2 className="font-semibold mb-2" style={{ color: "var(--text-primary)" }}>Incluye la inscripción</h2>
              <p className="text-sm whitespace-pre-line" style={{ color: "var(--text-secondary)" }}>{torneo.inscripcionIncluye}</p>
            </div>
          )}

          {/* Administradores */}
          {torneo.administradores && torneo.administradores.length > 0 && (
            <div className="themed-card rounded-2xl p-5 border">
              <h2 className="font-semibold mb-3" style={{ color: "var(--text-primary)" }}>Administradores</h2>
              <div className="flex flex-col gap-2">
                {torneo.administradores.map((admin, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold bg-gradient-to-br from-green-400 to-emerald-600">
                      {(admin.nombre || admin.email || "A").charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{admin.nombre || admin.email}</p>
                      {admin.nombre && <p className="text-xs" style={{ color: "var(--text-muted)" }}>{admin.email}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODO EDICIÓN */}
      {tab === "Info" && editando && (
        <div className="flex flex-col gap-4">
          <div className="themed-card rounded-2xl p-5 border" style={{ borderColor: "rgba(34,197,94,0.35)" }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold" style={{ color: "#22c55e" }}>Editando torneo</h2>
              <div className="flex gap-2">
                <button
                  onClick={cancelarEdicion}
                  className="px-3 py-1 rounded-lg text-sm font-semibold transition"
                  style={{ backgroundColor: "var(--bg-card-hover)", color: "var(--text-muted)" }}
                >
                  Cancelar
                </button>
                <button
                  onClick={guardarEdicion}
                  disabled={guardandoEdit}
                  className="px-3 py-1 rounded-lg text-sm font-semibold bg-green-600 text-white hover:bg-green-700 transition disabled:opacity-50"
                >
                  {guardandoEdit ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div>
                <label className={labelClass} style={{ color: "var(--text-muted)" }}>Nombre del torneo</label>
                <input
                  type="text"
                  value={editForm.nombre}
                  onChange={setEdit("nombre")}
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass} style={{ color: "var(--text-muted)" }}>Descripción</label>
                <textarea
                  value={editForm.descripcion || ""}
                  onChange={setEdit("descripcion")}
                  rows={3}
                  className={`${inputClass} resize-none`}
                />
              </div>

              {/* Categoría Género */}
              <div>
                <label className={labelClass} style={{ color: "var(--text-muted)" }}>Categoría Género</label>
                {bloqueoCategorias && (
                  <p className="text-xs mb-2" style={{ color: "#b45309" }}>
                    No se pueden cambiar las categorías después de generar un cuadro
                  </p>
                )}
                <div className="flex gap-2">
                  {["masculino", "femenino", "mixto"].map((g) => (
                    <button
                      key={g}
                      type="button"
                      disabled={bloqueoCategorias}
                      onClick={() => toggleGeneroEdit(g)}
                      className={`flex-1 px-4 py-2 rounded-xl text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed ${
                        (editForm.categoriaGenero || []).includes(g)
                          ? "bg-green-600 text-white"
                          : "bg-[var(--bg-card)] text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-card)]"
                      }`}
                    >
                      {g.charAt(0).toUpperCase() + g.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Categoría Nivel por género */}
              {(editForm.categoriaGenero || []).map((genero) => (
                <div key={genero}>
                  <label className={labelClass} style={{ color: "var(--text-muted)" }}>
                    Categoría Nivel —{" "}
                    {genero.charAt(0).toUpperCase() + genero.slice(1)}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORIAS_TORNEO.map((nivel) => (
                      <button
                        key={nivel}
                        type="button"
                        disabled={bloqueoCategorias}
                        onClick={() => toggleNivelEdit(genero, nivel)}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed ${
                          (
                            (editForm.categoriasConfig || {})[genero] || []
                          ).includes(nivel)
                            ? "bg-green-600 text-white"
                            : "bg-[var(--bg-card)] text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-card)]"
                        }`}
                      >
                        {nivel}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className={labelClass} style={{ color: "var(--text-muted)" }}>Formato</label>
                  <select
                    value={editForm.formato}
                    onChange={setEdit("formato")}
                    className={selectClass}
                  >
                    <option value="mini">Mini torneo</option>
                    <option value="normal">Torneo normal</option>
                    <option value="liga">Liga</option>
                    <option value="eliminacion">Eliminación directa</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className={labelClass} style={{ color: "var(--text-muted)" }}>Máx. parejas</label>
                  <input
                    type="number"
                    min="4"
                    max="256"
                    value={editForm.maxParejas}
                    onChange={setEdit("maxParejas")}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className={labelClass} style={{ color: "var(--text-muted)" }}>Sets por partido</label>
                  <select
                    value={editForm.sets}
                    onChange={setEdit("sets")}
                    className={selectClass}
                  >
                    <option value={1}>1 set</option>
                    <option value={3}>3 sets</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className={labelClass} style={{ color: "var(--text-muted)" }}>Games por set</label>
                  <select
                    value={editForm.gamesPorSet}
                    onChange={setEdit("gamesPorSet")}
                    className={selectClass}
                  >
                    <option value={4}>4 games</option>
                    <option value={6}>6 games</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className={labelClass} style={{ color: "var(--text-muted)" }}>Inscripción ($)</label>
                  <input
                    type="number"
                    min="0"
                    value={editForm.inscripcion}
                    onChange={setEdit("inscripcion")}
                    className={inputClass}
                  />
                </div>
                <div className="flex-1 flex items-end gap-2 pb-2">
                  <input
                    type="checkbox"
                    checked={editForm.superTiebreak || false}
                    onChange={setEdit("superTiebreak")}
                    className="w-4 h-4 accent-green-600"
                  />
                  <span className="text-sm" style={{ color: "var(--text-muted)" }}>Super tiebreak</span>
                </div>
              </div>

              <div>
                <label className={labelClass} style={{ color: "var(--text-muted)" }}>Sede</label>
                <input
                  type="text"
                  value={editForm.sede}
                  onChange={setEdit("sede")}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass} style={{ color: "var(--text-muted)" }}>Dirección</label>
                <input
                  type="text"
                  value={editForm.direccionSede || ""}
                  onChange={setEdit("direccionSede")}
                  className={inputClass}
                />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className={labelClass} style={{ color: "var(--text-muted)" }}>Instagram sede</label>
                  <input
                    type="text"
                    value={editForm.instagramSede || ""}
                    onChange={setEdit("instagramSede")}
                    className={inputClass}
                  />
                </div>
                <div className="flex-1">
                  <label className={labelClass} style={{ color: "var(--text-muted)" }}>Facebook sede</label>
                  <input
                    type="text"
                    value={editForm.facebookSede || ""}
                    onChange={setEdit("facebookSede")}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className={labelClass} style={{ color: "var(--text-muted)" }}>Ciudad</label>
                  <input
                    type="text"
                    value={editForm.ciudad}
                    onChange={setEdit("ciudad")}
                    className={inputClass}
                  />
                </div>
                <div className="flex-1">
                  <label className={labelClass} style={{ color: "var(--text-muted)" }}>Provincia</label>
                  <select
                    value={editForm.provincia}
                    onChange={setEdit("provincia")}
                    className={selectClass}
                  >
                    <option value="">Seleccionar</option>
                    {provinciasArgentina.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className={labelClass} style={{ color: "var(--text-muted)" }}>Fecha inicio</label>
                  <input
                    type="date"
                    value={editForm.fechaInicio}
                    onChange={setEdit("fechaInicio")}
                    className={inputClass}
                  />
                </div>
                <div className="flex-1">
                  <label className={labelClass} style={{ color: "var(--text-muted)" }}>Fecha fin</label>
                  <input
                    type="date"
                    value={editForm.fechaFin}
                    onChange={setEdit("fechaFin")}
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label className={labelClass} style={{ color: "var(--text-muted)" }}>Reglamento</label>
                <textarea
                  value={editForm.reglamento || ""}
                  onChange={setEdit("reglamento")}
                  rows={4}
                  className={`${inputClass} resize-none`}
                />
              </div>

              <div>
                <label className={labelClass} style={{ color: "var(--text-muted)" }}>Instagram organizador</label>
                <input
                  type="text"
                  value={editForm.instagramOrganizador || ""}
                  onChange={setEdit("instagramOrganizador")}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass} style={{ color: "var(--text-muted)" }}>Facebook organizador</label>
                <input
                  type="text"
                  value={editForm.facebookOrganizador || ""}
                  onChange={setEdit("facebookOrganizador")}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass} style={{ color: "var(--text-muted)" }}>WhatsApp organizador</label>
                <input
                  type="text"
                  value={editForm.whatsappOrganizador || ""}
                  onChange={setEdit("whatsappOrganizador")}
                  className={inputClass}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ✅ Tab de parejas reemplazado por el componente independiente */}
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
