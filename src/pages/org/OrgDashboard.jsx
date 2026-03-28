import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import { getTorneosByOrganizer } from "../../services/torneoService";

export default function OrgDashboard() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [torneos, setTorneos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    getTorneosByOrganizer(user.uid)
      .then(setTorneos)
      .finally(() => setLoading(false));
  }, [user]);

  if (loading)
    return <div className="text-center text-slate-400 py-12">Cargando...</div>;

  const activos = torneos.filter(
    (t) => t.status === "inscripcion" || t.status === "en_curso",
  );
  const finalizados = torneos.filter((t) => t.status === "finalizado");

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-800">Dashboard</h1>
        <p className="text-sm text-slate-400 mt-1">
          Resumen de tu actividad como organizador
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <div
          className="bg-white rounded-2xl p-5 border border-slate-200 text-center card-hover cursor-pointer"
          onClick={() => navigate("/org/torneos")}
        >
          <p className="text-3xl font-bold text-blue-600">{torneos.length}</p>
          <p className="text-xs text-slate-400 mt-1">Torneos totales</p>
        </div>
        <div
          className="bg-white rounded-2xl p-5 border border-slate-200 text-center card-hover cursor-pointer"
          onClick={() => navigate("/org/torneos")}
        >
          <p className="text-3xl font-bold text-emerald-600">
            {activos.length}
          </p>
          <p className="text-xs text-slate-400 mt-1">Activos</p>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-200 text-center">
          <p className="text-3xl font-bold text-slate-500">
            {finalizados.length}
          </p>
          <p className="text-xs text-slate-400 mt-1">Finalizados</p>
        </div>
      </div>

      {activos.length > 0 && (
        <div className="bg-white rounded-2xl p-5 border border-slate-200 mb-4">
          <h2 className="font-semibold text-slate-700 text-sm mb-3">
            Torneos activos
          </h2>
          <div className="flex flex-col gap-2">
            {activos.map((t) => (
              <div
                key={t.id}
                onClick={() => navigate(`/org/torneos/${t.id}`)}
                className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3 cursor-pointer hover:bg-slate-100 transition"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-700">
                    {t.nombre}
                  </p>
                  <p className="text-xs text-slate-400">
                    {t.sede} — {t.fechaInicio}
                  </p>
                </div>
                <span
                  className={`text-xs font-semibold px-2 py-1 rounded-full ${
                    t.status === "inscripcion"
                      ? "bg-blue-100 text-blue-700"
                      : "bg-emerald-100 text-emerald-700"
                  }`}
                >
                  {t.status === "inscripcion" ? "Inscripción" : "En curso"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={() => navigate("/org/torneos/nuevo")}
        className="w-full bg-blue-600 text-white rounded-2xl p-4 text-sm font-semibold hover:bg-blue-700 transition"
      >
        + Crear nuevo torneo
      </button>
    </div>
  );
}
