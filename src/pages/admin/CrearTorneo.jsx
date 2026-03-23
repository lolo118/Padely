import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import { crearTorneo } from "../../services/torneoService";

const inputClass =
  "border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 w-full";
const selectClass =
  "border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 w-full bg-white";
const labelClass = "text-xs font-semibold text-gray-500 mb-1 block";

export default function CrearTorneo() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    nombre: "",
    formato: "mini",
    categoria: "masculino",
    nivel: "principiante",
    maxParejas: 8,
    inscripcion: 0,
    sede: "",
    ciudad: "",
    provincia: "",
    fechaInicio: "",
    fechaFin: "",
    descripcion: "",
    sets: 1,
    gamesPorSet: 6,
    superTiebreak: false,
    inscripcionAbierta: true,
  });

  const set = (field) => (e) => {
    const val =
      e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setForm({ ...form, [field]: val });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
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
            <div className="flex gap-3">
              <div className="flex-1">
                <label className={labelClass}>Categoría</label>
                <select
                  value={form.categoria}
                  onChange={set("categoria")}
                  className={selectClass}
                >
                  <option value="masculino">Masculino</option>
                  <option value="femenino">Femenino</option>
                  <option value="mixto">Mixto</option>
                </select>
              </div>
              <div className="flex-1">
                <label className={labelClass}>Nivel</label>
                <select
                  value={form.nivel}
                  onChange={set("nivel")}
                  className={selectClass}
                >
                  <option value="principiante">Principiante</option>
                  <option value="intermedio">Intermedio</option>
                  <option value="avanzado">Avanzado</option>
                  <option value="todas">Todas</option>
                </select>
              </div>
            </div>
          </div>
        </div>

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

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h2 className="font-semibold text-gray-700 mb-4">Participantes</h2>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className={labelClass}>Máximo de parejas</label>
              <select
                value={form.maxParejas}
                onChange={set("maxParejas")}
                className={selectClass}
              >
                <option value={8}>8 parejas</option>
                <option value={16}>16 parejas</option>
                <option value={32}>32 parejas</option>
                <option value={48}>48 parejas</option>
                <option value={64}>64 parejas</option>
              </select>
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
                <input
                  type="text"
                  placeholder="Provincia"
                  value={form.provincia}
                  onChange={set("provincia")}
                  className={inputClass}
                  required
                />
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
