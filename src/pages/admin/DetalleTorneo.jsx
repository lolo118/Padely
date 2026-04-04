import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getTorneoById, actualizarTorneo } from "../../services/torneoService";

import TabGrupos from "./TabGrupos";
import TabBracket from "./TabBracket";
import TabParejas from "./TabParejas";
import TabReclamos from "./TabReclamos";

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

const categoriasNivel = [
  "8va",
  "Suma 15",
  "7ma",
  "Suma 13",
  "6ta",
  "Suma 11",
  "5ta",
  "Suma 9",
  "4ta",
  "Suma 7",
  "3era",
  "Suma 5",
  "2da",
  "Suma 3",
  "1era",
  "Libre",
];

const inputClass =
  "themed-input rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 w-full";
const selectClass =
  "themed-input rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 w-full";
const labelClass = "text-xs font-semibold mb-1 block";

const tabs = ["Info", "Parejas", "Grupos", "Bracket", "Reclamos"];

export default function DetalleTorneo() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [torneo, setTorneo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("Info");
  const [editando, setEditando] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [guardandoEdit, setGuardandoEdit] = useState(false);

  useEffect(() => {
    getTorneoById(id)
      .then(setTorneo)
      .finally(() => setLoading(false));
  }, [id]);

  const cambiarEstado = async (nuevoEstado) => {
    await actualizarTorneo(id, { status: nuevoEstado });
    setTorneo({ ...torneo, status: nuevoEstado });
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
    } catch (err) {
      console.error("Error al guardar:", err);
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
      </div>

      <div className="flex gap-2 mb-6 border-b" style={{ borderColor: "var(--border-card)" }}>
        {tabs.map((t) => (
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
                    ? `$${torneo.inscripcion}`
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
                  {torneo.fechaInicio}
                </span>
              </div>
              <div>
                <span className="block" style={{ color: "var(--text-muted)" }}>Fecha fin</span>
                <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                  {torneo.fechaFin}
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

          {/* Acciones del torneo */}
          <div className="themed-card rounded-2xl p-5 border">
            <h2 className="font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Acciones</h2>

            {/* Acción principal según estado */}
            {torneo.status === "inscripcion" && (
              <button
                onClick={() => {
                  if (window.confirm("¿Cerrar inscripciones y comenzar el torneo?")) {
                    if (window.confirm("¿Estás seguro? Una vez iniciado, no se pueden modificar las inscripciones.")) {
                      cambiarEstado("en_curso");
                    }
                  }
                }}
                className="w-full py-2.5 rounded-xl text-sm font-semibold bg-green-600 text-white hover:bg-green-700 transition mb-3"
              >
                🚀 Iniciar torneo
              </button>
            )}
            {torneo.status === "en_curso" && (
              <button
                onClick={() => {
                  if (window.confirm("¿Finalizar el torneo?")) {
                    if (window.confirm("¿Estás seguro? Esta acción no se puede deshacer. Se asignarán los puntos finales.")) {
                      cambiarEstado("finalizado");
                    }
                  }
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
                onClick={() => {
                  if (window.confirm("¿Cancelar el torneo? Esta acción no se puede deshacer.")) {
                    cambiarEstado("cancelado");
                  }
                }}
                className="w-full py-2 rounded-xl text-xs font-semibold border border-red-200 text-red-400 hover:bg-red-50 transition"
              >
                Cancelar torneo
              </button>
            )}
          </div>

          {/* Tip contextual */}
          {torneo.status === "inscripcion" && (
            <div className="rounded-xl px-4 py-3 text-sm border border-blue-200" style={{ backgroundColor: "rgba(59,130,246,0.07)", color: "var(--text-secondary)" }}>
              💡 <strong>Tip:</strong> Podés iniciar el torneo cuando hayas confirmado todas las parejas. Las inscripciones se cerrarán automáticamente.
            </div>
          )}
          {torneo.status === "en_curso" && (
            <div className="rounded-xl px-4 py-3 text-sm border border-green-200" style={{ backgroundColor: "rgba(34,197,94,0.07)", color: "var(--text-secondary)" }}>
              💡 <strong>Tip:</strong> Cargá los resultados desde la pestaña Grupos o Bracket. Al finalizar, se otorgarán puntos automáticamente.
            </div>
          )}
          {torneo.status === "finalizado" && (
            <div className="rounded-xl px-4 py-3 text-sm border border-slate-200" style={{ backgroundColor: "var(--bg-card-hover)", color: "var(--text-muted)" }}>
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
          <div className="themed-card rounded-2xl p-5 border border-green-200">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-green-700">Editando torneo</h2>
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
                <div className="flex gap-2">
                  {["masculino", "femenino", "mixto"].map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => toggleGeneroEdit(g)}
                      className={`flex-1 px-4 py-2 rounded-xl text-sm font-semibold transition ${
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
                    {categoriasNivel.map((nivel) => (
                      <button
                        key={nivel}
                        type="button"
                        onClick={() => toggleNivelEdit(genero, nivel)}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
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
      {tab === "Parejas" && <TabParejas torneoId={id} torneo={torneo} />}
      {tab === "Grupos" && <TabGrupos torneoId={id} torneo={torneo} />}
      {tab === "Bracket" && <TabBracket torneoId={id} torneo={torneo} />}
      {tab === "Reclamos" && <TabReclamos torneoId={id} torneo={torneo} />}
    </div>
  );
}
