import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getTorneoById, actualizarTorneo } from "../../services/torneoService";

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

const tabs = ["Info", "Parejas", "Grupos", "Bracket"];

export default function DetalleTorneo() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [torneo, setTorneo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("Info");

  useEffect(() => {
    getTorneoById(id)
      .then(setTorneo)
      .finally(() => setLoading(false));
  }, [id]);

  const cambiarEstado = async (nuevoEstado) => {
    await actualizarTorneo(id, { status: nuevoEstado });
    setTorneo({ ...torneo, status: nuevoEstado });
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
          onClick={() => navigate("/admin/torneos")}
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

      {tab === "Info" && (
        <div className="flex flex-col gap-4">
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <h2 className="font-semibold text-gray-700 mb-3">
              Detalles del torneo
            </h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-400 block">Formato</span>
                <span className="font-medium text-gray-700">
                  {formatoLabel[torneo.formato]}
                </span>
              </div>
              <div>
                <span className="text-gray-400 block">Categoría</span>
                <span className="font-medium text-gray-700 capitalize">
                  {torneo.categoria}
                </span>
              </div>
              <div>
                <span className="text-gray-400 block">Nivel</span>
                <span className="font-medium text-gray-700 capitalize">
                  {torneo.nivel}
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
            {torneo.descripcion && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <span className="text-gray-400 text-sm block mb-1">
                  Descripción
                </span>
                <p className="text-sm text-gray-700">{torneo.descripcion}</p>
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

      {tab === "Parejas" && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 text-center py-12">
          <div className="text-4xl mb-3">👥</div>
          <p className="text-gray-500 font-medium">Gestión de parejas</p>
          <p className="text-gray-400 text-sm mt-1">Próximamente</p>
        </div>
      )}

      {tab === "Grupos" && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 text-center py-12">
          <div className="text-4xl mb-3">📋</div>
          <p className="text-gray-500 font-medium">Grupos y partidos</p>
          <p className="text-gray-400 text-sm mt-1">Próximamente</p>
        </div>
      )}

      {tab === "Bracket" && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 text-center py-12">
          <div className="text-4xl mb-3">🏆</div>
          <p className="text-gray-500 font-medium">Bracket eliminatorio</p>
          <p className="text-gray-400 text-sm mt-1">Próximamente</p>
        </div>
      )}
    </div>
  );
}
