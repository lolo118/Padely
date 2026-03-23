import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getTorneoById,
  actualizarTorneo,
  agregarPareja,
  getParejas,
  eliminarPareja,
} from "../../services/torneoService";

import TabGrupos from "./TabGrupos";

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

  // Estado para parejas
  const [parejas, setParejas] = useState([]);
  const [jugador1, setJugador1] = useState("");
  const [jugador2, setJugador2] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    getTorneoById(id)
      .then(setTorneo)
      .finally(() => setLoading(false));
  }, [id]);

  // Cargar parejas cuando se abre la pestaña
  useEffect(() => {
    if (tab !== "Parejas" || !id) return;

    let cancelled = false;
    const cargarParejas = async () => {
      try {
        const data = await getParejas(id);
        if (!cancelled) setParejas(data);
      } catch (err) {
        console.error("Error al cargar parejas:", err);
      }
    };
    cargarParejas();

    return () => {
      cancelled = true;
    };
  }, [tab, id]);

  const cambiarEstado = async (nuevoEstado) => {
    await actualizarTorneo(id, { status: nuevoEstado });
    setTorneo({ ...torneo, status: nuevoEstado });
  };

  const handleAgregarPareja = async (e) => {
    e.preventDefault();
    if (!jugador1.trim() || !jugador2.trim()) return;
    setGuardando(true);
    try {
      const nuevaId = await agregarPareja(id, {
        jugador1: jugador1.trim(),
        jugador2: jugador2.trim(),
      });
      setParejas([
        ...parejas,
        { id: nuevaId, jugador1: jugador1.trim(), jugador2: jugador2.trim() },
      ]);
      setJugador1("");
      setJugador2("");
    } catch (err) {
      console.error("Error al agregar pareja:", err);
    }
    setGuardando(false);
  };

  const handleEliminarPareja = async (parejaId) => {
    if (!window.confirm("¿Eliminar esta pareja?")) return;
    try {
      await eliminarPareja(id, parejaId);
      setParejas(parejas.filter((p) => p.id !== parejaId));
    } catch (err) {
      console.error("Error al eliminar pareja:", err);
    }
  };

  if (loading)
    return <div className="text-center text-gray-400 py-12">Cargando...</div>;

  if (!torneo)
    return (
      <div className="text-center text-gray-400 py-12">
        Torneo no encontrado
      </div>
    );

  const cuposDisponibles = torneo.maxParejas - parejas.length;

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
        <div className="flex flex-col gap-4">
          {/* Contador de cupos */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-700">
                  Parejas inscriptas
                </h2>
                <p className="text-sm text-gray-400 mt-1">
                  {parejas.length} de {torneo.maxParejas} parejas
                </p>
              </div>
              <div
                className={`text-2xl font-bold ${
                  cuposDisponibles > 0 ? "text-green-600" : "text-red-500"
                }`}
              >
                {cuposDisponibles > 0
                  ? `${cuposDisponibles} cupos`
                  : "Completo"}
              </div>
            </div>
          </div>

          {/* Formulario agregar pareja */}
          {cuposDisponibles > 0 && (
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <h2 className="font-semibold text-gray-700 mb-3">
                Agregar pareja
              </h2>
              <form
                onSubmit={handleAgregarPareja}
                className="flex flex-col gap-3"
              >
                <input
                  type="text"
                  placeholder="Nombre jugador 1"
                  value={jugador1}
                  onChange={(e) => setJugador1(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <input
                  type="text"
                  placeholder="Nombre jugador 2"
                  value={jugador2}
                  onChange={(e) => setJugador2(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <button
                  type="submit"
                  disabled={guardando || !jugador1.trim() || !jugador2.trim()}
                  className="bg-green-600 text-white font-semibold py-2 rounded-xl hover:bg-green-700 transition disabled:opacity-50"
                >
                  {guardando ? "Agregando..." : "Agregar pareja"}
                </button>
              </form>
            </div>
          )}

          {/* Lista de parejas */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <h2 className="font-semibold text-gray-700 mb-3">
              Lista de parejas
            </h2>
            {parejas.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-4">
                No hay parejas inscriptas todavía
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {parejas.map((p, index) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-gray-400 w-6">
                        {index + 1}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-gray-700">
                          {p.jugador1}
                        </p>
                        <p className="text-sm text-gray-500">{p.jugador2}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleEliminarPareja(p.id)}
                      className="text-red-400 hover:text-red-600 text-sm font-semibold transition"
                    >
                      Eliminar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "Grupos" && <TabGrupos torneoId={id} torneo={torneo} />}

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
