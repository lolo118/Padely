import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getTodosLosTorneos } from "../services/torneoService";

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

export default function Torneos() {
  const navigate = useNavigate();
  const [torneos, setTorneos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todos");

  useEffect(() => {
    getTodosLosTorneos()
      .then(setTorneos)
      .finally(() => setLoading(false));
  }, []);

  const torneosFiltrados = torneos.filter((t) => {
    const coincideBusqueda =
      !busqueda.trim() ||
      t.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
      t.sede?.toLowerCase().includes(busqueda.toLowerCase()) ||
      t.ciudad?.toLowerCase().includes(busqueda.toLowerCase());

    const coincideEstado =
      filtroEstado === "todos" || t.status === filtroEstado;

    return coincideBusqueda && coincideEstado;
  });

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-800 mb-4">Torneos</h1>

      {/* Buscador */}
      <div className="flex flex-col gap-3 mb-6">
        <input
          type="text"
          placeholder="Buscar por nombre, sede o ciudad..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        />
        <div className="flex gap-2 flex-wrap">
          {[
            { key: "todos", label: "Todos" },
            { key: "inscripcion", label: "Inscripción abierta" },
            { key: "en_curso", label: "En curso" },
            { key: "finalizado", label: "Finalizados" },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setFiltroEstado(f.key)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
                filtroEstado === f.key
                  ? "bg-green-600 text-white"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="text-center text-gray-400 py-12">
          Cargando torneos...
        </div>
      )}

      {!loading && torneosFiltrados.length === 0 && (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="text-5xl mb-4">🏆</div>
          <p className="text-gray-500 font-medium">No se encontraron torneos</p>
          <p className="text-gray-400 text-sm mt-1">
            Probá con otra búsqueda o filtro
          </p>
        </div>
      )}

      {!loading && torneosFiltrados.length > 0 && (
        <div className="flex flex-col gap-3">
          {torneosFiltrados.map((t) => (
            <div
              key={t.id}
              onClick={() => navigate(`/torneos/${t.id}`)}
              className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <h2 className="font-semibold text-gray-800">{t.nombre}</h2>
                  <p className="text-sm text-gray-400 mt-0.5">
                    {t.sede} — {t.ciudad}, {t.provincia}
                  </p>
                  <p className="text-sm text-gray-400 mt-0.5">
                    {t.fechaInicio} → {t.fechaFin}
                  </p>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {Array.isArray(t.categoriaGenero) &&
                      t.categoriaGenero.map((g) => (
                        <span
                          key={g}
                          className="text-xs bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full capitalize"
                        >
                          {g}
                        </span>
                      ))}
                    {t.categoriasConfig &&
                      Object.entries(t.categoriasConfig).map(
                        ([genero, niveles]) =>
                          niveles.map((n) => (
                            <span
                              key={`${genero}-${n}`}
                              className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full"
                            >
                              {n}
                            </span>
                          )),
                      )}
                    <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                      {t.maxParejas} parejas
                    </span>
                    {t.inscripcion > 0 && (
                      <span className="text-xs bg-green-100 text-green-600 px-2 py-0.5 rounded-full">
                        ${t.inscripcion}
                      </span>
                    )}
                  </div>
                </div>
                <span
                  className={`text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap ${
                    estadoBadge[t.status] || "bg-gray-100 text-gray-500"
                  }`}
                >
                  {estadoLabel[t.status] || t.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
