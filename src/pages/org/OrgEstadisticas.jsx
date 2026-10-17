import { useEffect, useState } from "react";
import { useAuthStore } from "../../store/authStore";
import { getTorneosByOrganizer } from "../../services/torneoService";
import { formatFecha } from "../../utils/formatDate";
import { Badge, StatTile } from "../../components/ui";

// Estado del torneo → tono y palabra del badge (sin punto: la fase cambia, pero el sistema lo reserva a reservas)
const ESTADO = {
  inscripcion: { tone: "court", label: "Inscripción" },
  en_curso: { tone: "lime", label: "En curso" },
  finalizado: { tone: "neutral", label: "Finalizado" },
};

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

  if (loading) {
    return (
      <div aria-busy="true">
        <span className="sr-only">Cargando...</span>
        <div className="pd-skeleton h-8 w-48 mb-6" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="pd-skeleton h-[92px] rounded-lg" />
          ))}
        </div>
        <div className="pd-skeleton h-56 rounded-lg" />
      </div>
    );
  }

  const finalizados = torneos.filter((t) => t.status === "finalizado");
  const activos = torneos.filter((t) => t.status === "inscripcion" || t.status === "en_curso");
  const totalParejas = torneos.reduce((sum, t) => sum + (Number(t.maxParejas) || 0), 0);

  return (
    <div>
      <h1 className="heading-lg m-0 mb-6">Estadísticas</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatTile value={torneos.length} label="Torneos totales" />
        <StatTile value={activos.length} label="Activos ahora" />
        <StatTile value={finalizados.length} label="Finalizados" />
        <StatTile value={totalParejas} label="Capacidad total parejas" />
      </div>

      {torneos.length > 0 && (
        <div className="pd-table-wrap">
          <div className="pd-table-head">
            <h3>Historial de torneos</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="pd-table">
              <thead>
                <tr>
                  <th>Torneo</th>
                  <th>Sede</th>
                  <th>Inicio</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {torneos.map((t) => {
                  const estado = ESTADO[t.status] || { tone: "danger", label: "Cancelado" };
                  return (
                    <tr key={t.id}>
                      <td className="font-semibold">{t.nombre}</td>
                      <td className="text-ink-2!">{t.sede}</td>
                      <td className="text-ink-2!">{formatFecha(t.fechaInicio)}</td>
                      <td>
                        <Badge tone={estado.tone}>{estado.label}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
