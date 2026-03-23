import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import { crearTorneo } from "../../services/torneoService";

const inputClass =
  "border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 w-full";
const selectClass =
  "border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 w-full bg-white";
const labelClass = "text-xs font-semibold text-gray-500 mb-1 block";

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

const categoriasGenero = [
  { value: "masculino", label: "Masculino" },
  { value: "femenino", label: "Femenino" },
  { value: "mixto", label: "Mixto" },
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

export default function CrearTorneo() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    nombre: "",
    formato: "mini",
    categoriaGenero: [],
    categoriasConfig: {},
    maxParejas: 8,
    inscripcion: 0,
    sede: "",
    direccionSede: "",
    instagramSede: "",
    facebookSede: "",
    ciudad: "",
    provincia: "",
    fechaInicio: "",
    fechaFin: "",
    descripcion: "",
    sets: 1,
    gamesPorSet: 6,
    superTiebreak: false,
    inscripcionAbierta: true,
    reglamento: "",
    instagramOrganizador: "",
    facebookOrganizador: "",
    whatsappOrganizador: "",
  });

  const set = (field) => (e) => {
    const val =
      e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setForm({ ...form, [field]: val });
  };

  const toggleGenero = (genero) => {
    const current = form.categoriaGenero;
    let updated;
    if (current.includes(genero)) {
      updated = current.filter((g) => g !== genero);
      const newConfig = { ...form.categoriasConfig };
      delete newConfig[genero];
      setForm({
        ...form,
        categoriaGenero: updated,
        categoriasConfig: newConfig,
      });
    } else {
      if (current.length >= 3) return;
      updated = [...current, genero];
      setForm({
        ...form,
        categoriaGenero: updated,
        categoriasConfig: { ...form.categoriasConfig, [genero]: [] },
      });
    }
  };

  const toggleNivel = (genero, nivel) => {
    const current = form.categoriasConfig[genero] || [];
    let updated;
    if (current.includes(nivel)) {
      updated = current.filter((n) => n !== nivel);
    } else {
      updated = [...current, nivel];
    }
    setForm({
      ...form,
      categoriasConfig: { ...form.categoriasConfig, [genero]: updated },
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (form.categoriaGenero.length === 0) {
      setError("Seleccioná al menos una categoría género.");
      return;
    }

    const algunNivelVacio = form.categoriaGenero.some(
      (g) => !form.categoriasConfig[g] || form.categoriasConfig[g].length === 0,
    );
    if (algunNivelVacio) {
      setError("Seleccioná al menos una categoría nivel para cada género.");
      return;
    }

    setLoading(true);
    try {
      const id = await crearTorneo(form, user.uid);
      navigate(`/admin/torneos/${id}`);
    } catch {
      setError("Error al crear el torneo. Intentá de nuevo.");
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate("/admin/torneos")}
          className="text-gray-400 hover:text-gray-600 text-xl"
        >
          ←
        </button>
        <h1 className="text-xl font-bold text-gray-800">Crear torneo</h1>
      </div>

      {error && (
        <div className="bg-red-100 text-red-600 text-sm p-3 rounded-lg mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {/* Información general */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h2 className="font-semibold text-gray-700 mb-4">
            Información general
          </h2>
          <div className="flex flex-col gap-3">
            <div>
              <label className={labelClass}>Nombre del torneo</label>
              <input
                type="text"
                placeholder="Ej: Torneo Apertura 2025"
                value={form.nombre}
                onChange={set("nombre")}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className={labelClass}>Descripción (opcional)</label>
              <textarea
                placeholder="Información adicional del torneo..."
                value={form.descripcion}
                onChange={set("descripcion")}
                rows={3}
                className="border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 w-full resize-none"
              />
            </div>

            {/* Categoría Género */}
            <div>
              <label className={labelClass}>Categoría Género (hasta 3)</label>
              <div className="flex gap-2">
                {categoriasGenero.map((cat) => (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => toggleGenero(cat.value)}
                    className={`flex-1 px-4 py-2 rounded-xl text-sm font-semibold transition ${
                      form.categoriaGenero.includes(cat.value)
                        ? "bg-green-600 text-white"
                        : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Categoría Nivel por cada género seleccionado */}
            {form.categoriaGenero.map((genero) => (
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
                      onClick={() => toggleNivel(genero, nivel)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                        (form.categoriasConfig[genero] || []).includes(nivel)
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
          </div>
        </div>

        {/* Formato */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h2 className="font-semibold text-gray-700 mb-4">Formato</h2>
          <div className="flex flex-col gap-3">
            <div>
              <label className={labelClass}>Tipo de torneo</label>
              <select
                value={form.formato}
                onChange={set("formato")}
                className={selectClass}
              >
                <option value="mini">
                  Mini torneo (1 set, fase de grupos + eliminación)
                </option>
                <option value="normal">
                  Torneo normal (3 sets, fase de grupos + eliminación)
                </option>
                <option value="liga">Liga (fechas, tabla de posiciones)</option>
                <option value="eliminacion">Eliminación directa</option>
              </select>
            </div>
            {(form.formato === "mini" || form.formato === "normal") && (
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className={labelClass}>Sets por partido</label>
                  <select
                    value={form.sets}
                    onChange={set("sets")}
                    className={selectClass}
                  >
                    <option value={1}>1 set</option>
                    <option value={3}>3 sets</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className={labelClass}>Games por set</label>
                  <select
                    value={form.gamesPorSet}
                    onChange={set("gamesPorSet")}
                    className={selectClass}
                  >
                    <option value={4}>4 games</option>
                    <option value={6}>6 games</option>
                  </select>
                </div>
              </div>
            )}
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="superTiebreak"
                checked={form.superTiebreak}
                onChange={set("superTiebreak")}
                className="w-4 h-4 accent-green-600"
              />
              <label htmlFor="superTiebreak" className="text-sm text-gray-600">
                Super tiebreak al 10 en caso de empate
              </label>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="inscripcionAbierta"
                checked={form.inscripcionAbierta}
                onChange={set("inscripcionAbierta")}
                className="w-4 h-4 accent-green-600"
              />
              <label
                htmlFor="inscripcionAbierta"
                className="text-sm text-gray-600"
              >
                Inscripción abierta al público
              </label>
            </div>
          </div>
        </div>

        {/* Participantes */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h2 className="font-semibold text-gray-700 mb-4">Participantes</h2>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className={labelClass}>Máximo de parejas</label>
              <input
                type="number"
                min="4"
                max="256"
                placeholder="Ej: 32"
                value={form.maxParejas}
                onChange={set("maxParejas")}
                className={inputClass}
              />
            </div>
            <div className="flex-1">
              <label className={labelClass}>Costo de inscripción ($)</label>
              <input
                type="number"
                min="0"
                placeholder="0"
                value={form.inscripcion}
                onChange={set("inscripcion")}
                className={inputClass}
              />
            </div>
          </div>
        </div>

        {/* Sede y fechas */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h2 className="font-semibold text-gray-700 mb-4">Sede y fechas</h2>
          <div className="flex flex-col gap-3">
            <div>
              <label className={labelClass}>Nombre de la sede</label>
              <input
                type="text"
                placeholder="Ej: Club Náutico Santiago"
                value={form.sede}
                onChange={set("sede")}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className={labelClass}>Dirección física</label>
              <input
                type="text"
                placeholder="Ej: Av. Belgrano 1234"
                value={form.direccionSede}
                onChange={set("direccionSede")}
                className={inputClass}
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className={labelClass}>Instagram de la sede</label>
                <input
                  type="text"
                  placeholder="@clubnautico"
                  value={form.instagramSede}
                  onChange={set("instagramSede")}
                  className={inputClass}
                />
              </div>
              <div className="flex-1">
                <label className={labelClass}>Facebook de la sede</label>
                <input
                  type="text"
                  placeholder="facebook.com/clubnautico"
                  value={form.facebookSede}
                  onChange={set("facebookSede")}
                  className={inputClass}
                />
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className={labelClass}>Ciudad</label>
                <input
                  type="text"
                  placeholder="Ciudad"
                  value={form.ciudad}
                  onChange={set("ciudad")}
                  className={inputClass}
                  required
                />
              </div>
              <div className="flex-1">
                <label className={labelClass}>Provincia</label>
                <select
                  value={form.provincia}
                  onChange={set("provincia")}
                  className={selectClass}
                  required
                >
                  <option value="">Seleccionar provincia</option>
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
                <label className={labelClass}>Fecha de inicio</label>
                <input
                  type="date"
                  value={form.fechaInicio}
                  onChange={set("fechaInicio")}
                  className={inputClass}
                  required
                />
              </div>
              <div className="flex-1">
                <label className={labelClass}>Fecha de fin</label>
                <input
                  type="date"
                  value={form.fechaFin}
                  onChange={set("fechaFin")}
                  className={inputClass}
                  required
                />
              </div>
            </div>
          </div>
        </div>

        {/* Reglamento */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h2 className="font-semibold text-gray-700 mb-4">Reglamento</h2>
          <div>
            <label className={labelClass}>
              Reglas especiales del torneo (opcional)
            </label>
            <textarea
              placeholder={
                "Ej:\n- 15 minutos de tolerancia\n- Pareja que no sea de la categoría será eliminada sin devolución de inscripción\n- Se juega con pelotas nuevas provistas por la organización"
              }
              value={form.reglamento}
              onChange={set("reglamento")}
              rows={5}
              className="border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 w-full resize-none"
            />
          </div>
        </div>

        {/* Redes sociales del organizador */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h2 className="font-semibold text-gray-700 mb-4">
            Redes del organizador
          </h2>
          <div className="flex flex-col gap-3">
            <div>
              <label className={labelClass}>Instagram</label>
              <input
                type="text"
                placeholder="@toppadeltorneos"
                value={form.instagramOrganizador}
                onChange={set("instagramOrganizador")}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Facebook</label>
              <input
                type="text"
                placeholder="facebook.com/toppadeltorneos"
                value={form.facebookOrganizador}
                onChange={set("facebookOrganizador")}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>WhatsApp de contacto</label>
              <input
                type="text"
                placeholder="Ej: +54 385 1234567"
                value={form.whatsappOrganizador}
                onChange={set("whatsappOrganizador")}
                className={inputClass}
              />
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="bg-green-600 text-white py-3 rounded-xl font-semibold hover:bg-green-700 transition disabled:opacity-50"
        >
          {loading ? "Creando torneo..." : "Crear torneo"}
        </button>
      </form>
    </div>
  );
}
