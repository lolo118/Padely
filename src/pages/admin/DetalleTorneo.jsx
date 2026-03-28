import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getTorneoById, actualizarTorneo } from "../../services/torneoService";

import TabGrupos from "./TabGrupos";
import TabBracket from "./TabBracket";
import TabParejas from "./TabParejas"; // ✅ Import agregado

const estadoBadge = {
  inscripcion: "bg-blue-100 text-blue-700",
  en_curso: "bg-green-100 text-green-700",
  finalizado: "bg-gray-100 text-gray-500",
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
  "border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 w-full";
const selectClass =
  "border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 w-full bg-white";
const labelClass = "text-xs font-semibold text-gray-500 mb-1 block";

const tabs = ["Info", "Parejas", "Grupos", "Bracket"];

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
    return <div className="text-center text-gray-400 py-12">Cargando...</div>;

  if (!torneo)
    return (
      <div className="text-center text-gray-400 py-12">
        Torneo no encontrado
      </div>
    );

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="text-gray-400 hover:text-gray-600 text-xl"
        >
          ←
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-800">{torneo.nombre}</h1>
          <p className="text-sm text-gray-400">
            {torneo.sede} — {torneo.ciudad}, {torneo.provincia}
          </p>
        </div>
        <span
          className={`text-xs font-semibold px-3 py-1 rounded-full ${estadoBadge[torneo.status]}`}
        >
          {estadoLabel[torneo.status]}
        </span>
      </div>

      <div className="flex gap-2 mb-6 border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-semibold transition border-b-2 -mb-px ${
              tab === t
                ? "border-green-600 text-green-600"
                : "border-transparent text-gray-400 hover:text-gray-600"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Info" && !editando && (
        <div className="flex flex-col gap-4">
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-700">
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
                <span className="text-gray-400 block">Formato</span>
                <span className="font-medium text-gray-700">
                  {formatoLabel[torneo.formato]}
                </span>
              </div>
              <div>
                <span className="text-gray-400 block">Categoría Género</span>
                <span className="font-medium text-gray-700 capitalize">
                  {Array.isArray(torneo.categoriaGenero)
                    ? torneo.categoriaGenero.join(", ")
                    : torneo.categoria || "—"}
                </span>
              </div>
              <div>
                <span className="text-gray-400 block">Categoría Nivel</span>
                <span className="font-medium text-gray-700">
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
                <span className="text-gray-400 block">Máx. parejas</span>
                <span className="font-medium text-gray-700">
                  {torneo.maxParejas}
                </span>
              </div>
              <div>
                <span className="text-gray-400 block">Sets por partido</span>
                <span className="font-medium text-gray-700">
                  {torneo.sets} set{torneo.sets > 1 ? "s" : ""}
                </span>
              </div>
              <div>
                <span className="text-gray-400 block">Games por set</span>
                <span className="font-medium text-gray-700">
                  {torneo.gamesPorSet} games
                </span>
              </div>
              <div>
                <span className="text-gray-400 block">Inscripción</span>
                <span className="font-medium text-gray-700">
                  {torneo.inscripcion > 0
                    ? `$${torneo.inscripcion}`
                    : "Gratuita"}
                </span>
              </div>
              <div>
                <span className="text-gray-400 block">Super tiebreak</span>
                <span className="font-medium text-gray-700">
                  {torneo.superTiebreak ? "Sí" : "No"}
                </span>
              </div>
              <div>
                <span className="text-gray-400 block">Fecha inicio</span>
                <span className="font-medium text-gray-700">
                  {torneo.fechaInicio}
                </span>
              </div>
              <div>
                <span className="text-gray-400 block">Fecha fin</span>
                <span className="font-medium text-gray-700">
                  {torneo.fechaFin}
                </span>
              </div>
            </div>

            {/* Sede */}
            <div className="mt-3 pt-3 border-t border-gray-100">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-400 block">Sede</span>
                  <span className="font-medium text-gray-700">
                    {torneo.sede}
                  </span>
                </div>
                {torneo.direccionSede && (
                  <div>
                    <span className="text-gray-400 block">Dirección</span>
                    <span className="font-medium text-gray-700">
                      {torneo.direccionSede}
                    </span>
                  </div>
                )}
                {torneo.instagramSede && (
                  <div>
                    <span className="text-gray-400 block">Instagram sede</span>
                    <span className="font-medium text-gray-700">
                      {torneo.instagramSede}
                    </span>
                  </div>
                )}
                {torneo.facebookSede && (
                  <div>
                    <span className="text-gray-400 block">Facebook sede</span>
                    <span className="font-medium text-gray-700">
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
              <div className="mt-3 pt-3 border-t border-gray-100">
                <span className="text-gray-400 text-sm block mb-2">
                  Redes del organizador
                </span>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {torneo.instagramOrganizador && (
                    <div>
                      <span className="text-gray-400 block">Instagram</span>
                      <span className="font-medium text-gray-700">
                        {torneo.instagramOrganizador}
                      </span>
                    </div>
                  )}
                  {torneo.facebookOrganizador && (
                    <div>
                      <span className="text-gray-400 block">Facebook</span>
                      <span className="font-medium text-gray-700">
                        {torneo.facebookOrganizador}
                      </span>
                    </div>
                  )}
                  {torneo.whatsappOrganizador && (
                    <div>
                      <span className="text-gray-400 block">WhatsApp</span>
                      <span className="font-medium text-gray-700">
                        {torneo.whatsappOrganizador}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Descripción */}
            {torneo.descripcion && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <span className="text-gray-400 text-sm block mb-1">
                  Descripción
                </span>
                <p className="text-sm text-gray-700">{torneo.descripcion}</p>
              </div>
            )}

            {/* Reglamento */}
            {torneo.reglamento && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <span className="text-gray-400 text-sm block mb-1">
                  Reglamento
                </span>
                <p className="text-sm text-gray-700 whitespace-pre-line">
                  {torneo.reglamento}
                </p>
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <h2 className="font-semibold text-gray-700 mb-3">Cambiar estado</h2>
            <div className="flex gap-2 flex-wrap">
              {Object.entries(estadoLabel).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => cambiarEstado(key)}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
                    torneo.status === key
                      ? "bg-green-600 text-white"
                      : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODO EDICIÓN */}
      {tab === "Info" && editando && (
        <div className="flex flex-col gap-4">
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-green-200">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-green-700">Editando torneo</h2>
              <div className="flex gap-2">
                <button
                  onClick={cancelarEdicion}
                  className="px-3 py-1 rounded-lg text-sm font-semibold bg-gray-100 text-gray-500 hover:bg-gray-200 transition"
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
                <label className={labelClass}>Nombre del torneo</label>
                <input
                  type="text"
                  value={editForm.nombre}
                  onChange={setEdit("nombre")}
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Descripción</label>
                <textarea
                  value={editForm.descripcion || ""}
                  onChange={setEdit("descripcion")}
                  rows={3}
                  className={`${inputClass} resize-none`}
                />
              </div>

              {/* Categoría Género */}
              <div>
                <label className={labelClass}>Categoría Género</label>
                <div className="flex gap-2">
                  {["masculino", "femenino", "mixto"].map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => toggleGeneroEdit(g)}
                      className={`flex-1 px-4 py-2 rounded-xl text-sm font-semibold transition ${
                        (editForm.categoriaGenero || []).includes(g)
                          ? "bg-green-600 text-white"
                          : "bg-gray-100 text-gray-500 hover:bg-gray-200"
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
                  <label className={labelClass}>
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
                            : "bg-gray-100 text-gray-500 hover:bg-gray-200"
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
                  <label className={labelClass}>Formato</label>
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
                  <label className={labelClass}>Máx. parejas</label>
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
                  <label className={labelClass}>Sets por partido</label>
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
                  <label className={labelClass}>Games por set</label>
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
                  <label className={labelClass}>Inscripción ($)</label>
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
                  <span className="text-sm text-gray-600">Super tiebreak</span>
                </div>
              </div>

              <div>
                <label className={labelClass}>Sede</label>
                <input
                  type="text"
                  value={editForm.sede}
                  onChange={setEdit("sede")}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Dirección</label>
                <input
                  type="text"
                  value={editForm.direccionSede || ""}
                  onChange={setEdit("direccionSede")}
                  className={inputClass}
                />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className={labelClass}>Instagram sede</label>
                  <input
                    type="text"
                    value={editForm.instagramSede || ""}
                    onChange={setEdit("instagramSede")}
                    className={inputClass}
                  />
                </div>
                <div className="flex-1">
                  <label className={labelClass}>Facebook sede</label>
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
                  <label className={labelClass}>Ciudad</label>
                  <input
                    type="text"
                    value={editForm.ciudad}
                    onChange={setEdit("ciudad")}
                    className={inputClass}
                  />
                </div>
                <div className="flex-1">
                  <label className={labelClass}>Provincia</label>
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
                  <label className={labelClass}>Fecha inicio</label>
                  <input
                    type="date"
                    value={editForm.fechaInicio}
                    onChange={setEdit("fechaInicio")}
                    className={inputClass}
                  />
                </div>
                <div className="flex-1">
                  <label className={labelClass}>Fecha fin</label>
                  <input
                    type="date"
                    value={editForm.fechaFin}
                    onChange={setEdit("fechaFin")}
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label className={labelClass}>Reglamento</label>
                <textarea
                  value={editForm.reglamento || ""}
                  onChange={setEdit("reglamento")}
                  rows={4}
                  className={`${inputClass} resize-none`}
                />
              </div>

              <div>
                <label className={labelClass}>Instagram organizador</label>
                <input
                  type="text"
                  value={editForm.instagramOrganizador || ""}
                  onChange={setEdit("instagramOrganizador")}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Facebook organizador</label>
                <input
                  type="text"
                  value={editForm.facebookOrganizador || ""}
                  onChange={setEdit("facebookOrganizador")}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>WhatsApp organizador</label>
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
    </div>
  );
}
