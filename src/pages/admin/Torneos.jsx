import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import { getTorneosByOrganizer } from "../../services/torneoService";

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

export default function Torneos() {
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
        <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Mis torneos</h1>
        <button
          onClick={() => navigate("/admin/torneos/nuevo")}
          className="text-white px-4 py-2 rounded-xl text-sm font-semibold hover:opacity-90 transition"
          style={{ backgroundColor: "var(--accent)" }}
        >
          + Nuevo torneo
        </button>
      </div>

      {loading && (
        <div className="text-center py-12" style={{ color: "var(--text-muted)" }}>Cargando...</div>
      )}

      {!loading && torneos.length === 0 && (
        <div className="text-center py-16 themed-card rounded-2xl border">
          <div className="text-5xl mb-4">🏆</div>
          <p className="font-medium" style={{ color: "var(--text-muted)" }}>
            Todavía no creaste ningún torneo
          </p>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            Hacé clic en "Nuevo torneo" para empezar
          </p>
        </div>
      )}

      {!loading && torneos.length > 0 && (
        <div className="flex flex-col gap-3">
          {torneos.map((t) => (
            <div
              key={t.id}
              onClick={() => navigate(`/admin/torneos/${t.id}`)}
              className="themed-card rounded-2xl p-5 border cursor-pointer hover:shadow-md transition"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>{t.nombre}</h2>
                  <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
                    {t.sede} — {t.ciudad}, {t.provincia}
                  </p>
                  <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
                    {t.fechaInicio} → {t.fechaFin}
                  </p>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    <span className="text-xs px-2 py-0.5 rounded-full capitalize" style={{ backgroundColor: "var(--bg-card-hover)", color: "var(--text-muted)" }}>
                      {t.formato}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full capitalize" style={{ backgroundColor: "var(--bg-card-hover)", color: "var(--text-muted)" }}>
                      {t.categoria}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: "var(--bg-card-hover)", color: "var(--text-muted)" }}>
                      {t.maxParejas} parejas
                    </span>
                  </div>
                </div>
                <span
                  className={`text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap ${estadoBadge[t.status] || "bg-[var(--bg-card-hover)] text-[var(--text-muted)]"}`}
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
