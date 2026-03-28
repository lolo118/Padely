import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import { getTorneosByOrganizer } from "../../services/torneoService";

const estadoBadge = {
  inscripcion: "bg-blue-100 text-blue-700",
  en_curso: "bg-emerald-100 text-emerald-700",
  finalizado: "bg-slate-100 text-slate-500",
  cancelado: "bg-red-100 text-red-500",
};

const estadoLabel = {
  inscripcion: "Inscripción abierta",
  en_curso: "En curso",
  finalizado: "Finalizado",
  cancelado: "Cancelado",
};

export default function OrgTorneos() {
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-slate-800">Mis torneos</h1>
        <button
          onClick={() => navigate("/org/torneos/nuevo")}
          className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-blue-700 transition"
        >
          + Nuevo torneo
        </button>
      </div>

      {loading && (
        <div className="text-center text-slate-400 py-12">Cargando...</div>
      )}

      {!loading && torneos.length === 0 && (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
          <div className="text-5xl mb-4">🏆</div>
          <p className="text-slate-500 font-medium">
            Todavía no creaste ningún torneo
          </p>
          <p className="text-slate-400 text-sm mt-1">
            Hacé clic en "Nuevo torneo" para empezar
          </p>
        </div>
      )}

      {!loading && torneos.length > 0 && (
        <div className="flex flex-col gap-3">
          {torneos.map((t) => (
            <div
              key={t.id}
              onClick={() => navigate(`/org/torneos/${t.id}`)}
              className="bg-white rounded-2xl p-5 border border-slate-200 cursor-pointer card-hover"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <h2 className="font-semibold text-slate-800">{t.nombre}</h2>
                  <p className="text-sm text-slate-400 mt-0.5">
                    {t.sede} — {t.ciudad}, {t.provincia}
                  </p>
                  <p className="text-sm text-slate-400 mt-0.5">
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
                    <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                      {t.maxParejas} parejas
                    </span>
                  </div>
                </div>
                <span
                  className={`text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap ${estadoBadge[t.status] || "bg-slate-100 text-slate-500"}`}
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
