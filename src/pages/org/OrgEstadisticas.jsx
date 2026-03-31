import { useEffect, useState } from "react";
import { useAuthStore } from "../../store/authStore";
import { getTorneosByOrganizer } from "../../services/torneoService";

export default function OrgEstadisticas() {
  const { user } = useAuthStore();
  const [torneos, setTorneos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    getTorneosByOrganizer(user.uid)
      .then(setTorneos)
      .finally(() => setLoading(false));
  }, [user]);

  if (loading) return <div className="text-center py-12" style={{ color: "var(--text-muted)" }}>Cargando...</div>;

  const finalizados = torneos.filter((t) => t.status === "finalizado");
  const activos = torneos.filter((t) => t.status === "inscripcion" || t.status === "en_curso");
  const totalParejas = torneos.reduce((sum, t) => sum + (Number(t.maxParejas) || 0), 0);

  return (
    <div>
      <h1 className="text-xl font-bold mb-6" style={{ color: "var(--text-primary)" }}>Estadísticas</h1>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="themed-card rounded-2xl p-5 border text-center">
          <p className="text-3xl font-bold text-blue-600">{torneos.length}</p>
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Torneos totales</p>
        </div>
        <div className="themed-card rounded-2xl p-5 border text-center">
          <p className="text-3xl font-bold text-emerald-600">{activos.length}</p>
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Activos ahora</p>
        </div>
        <div className="themed-card rounded-2xl p-5 border text-center">
          <p className="text-3xl font-bold" style={{ color: "var(--text-muted)" }}>{finalizados.length}</p>
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Finalizados</p>
        </div>
        <div className="themed-card rounded-2xl p-5 border text-center">
          <p className="text-3xl font-bold text-purple-600">{totalParejas}</p>
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Capacidad total parejas</p>
        </div>
      </div>

      {torneos.length > 0 && (
        <div className="themed-card rounded-2xl p-5 border">
          <h2 className="font-semibold mb-3" style={{ color: "var(--text-primary)" }}>Historial de torneos</h2>
          <div className="flex flex-col gap-2">
            {torneos.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-xl px-4 py-3"
                style={{ backgroundColor: "var(--bg-card-hover)" }}
              >
                <div>
                  <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{t.nombre}</p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>{t.sede} — {t.fechaInicio}</p>
                </div>
                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                  t.status === "finalizado" ? "bg-slate-100 text-slate-500" :
                  t.status === "inscripcion" ? "bg-blue-100 text-blue-700" :
                  t.status === "en_curso" ? "bg-emerald-100 text-emerald-700" :
                  "bg-red-100 text-red-500"
                }`}>
                  {t.status === "inscripcion" ? "Inscripción" : t.status === "en_curso" ? "En curso" : t.status === "finalizado" ? "Finalizado" : "Cancelado"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
