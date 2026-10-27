import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { collection, query, where, getDocs } from "firebase/firestore";
import { Plus, TriangleAlert } from "lucide-react";
import { db } from "../../lib/firebase";
import { useAuthStore } from "../../store/authStore";
import { getTorneosByOrganizer } from "../../services/torneoService";
import { formatFecha } from "../../utils/formatDate";
import { sedeDeTorneo } from "../../utils/torneo";
import { Badge, Button, Card, StatTile } from "../../components/ui";

// Estado del vínculo con el club sede; aceptado (o sin club) no lleva badge
const badgeSede = (t) => {
  if (t.club?.estado === "pendiente") return <Badge tone="warning">Esperando confirmación</Badge>;
  if (t.club?.estado === "rechazado") return <Badge tone="danger">Sede rechazada</Badge>;
  return null;
};

const enlaceCard =
  "block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

export default function OrgDashboard() {
  const entidadSuspendida = useAuthStore((s) => s.entidadSuspendida);
  const { user } = useAuthStore();
  const [torneos, setTorneos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [entidad, setEntidad] = useState(null);

  useEffect(() => {
    if (!user) return;
    const cargar = async () => {
      try {
        const [torneosData] = await Promise.all([
          getTorneosByOrganizer(user.uid),
        ]);
        setTorneos(torneosData);

        // Cargar entidad
        const q = query(collection(db, "organizers"), where("ownerUid", "==", user.uid));
        const snap = await getDocs(q);
        if (snap.docs.length > 0) {
          setEntidad({ id: snap.docs[0].id, ...snap.docs[0].data() });
        }
      } catch (err) {
        console.error("Error:", err);
      }
      setLoading(false);
    };
    cargar();
  }, [user]);

  if (loading)
    return (
      <div className="flex flex-col gap-6" aria-busy="true" aria-label="Cargando">
        <div className="pd-skeleton h-8 w-40" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="pd-skeleton h-24 rounded-lg!" />
          ))}
        </div>
        <div className="pd-skeleton h-40 rounded-lg!" />
      </div>
    );

  const activos = torneos.filter(
    (t) => t.status === "inscripcion" || t.status === "en_curso",
  );
  const finalizados = torneos.filter((t) => t.status === "finalizado");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="heading-lg m-0">Resumen</h1>
          <p className="body-sm text-ink-2 mt-1 mb-0">Resumen de tu actividad como organizador</p>
        </div>
        {/* Con la entidad suspendida no se crean torneos (el aviso del panel explica por qué) */}
        {!entidadSuspendida && (
          <Button
            as="link"
            to="/org/torneos/nuevo"
            variant="primary"
            icon={<Plus className="pd-icon" size={20} aria-hidden="true" />}
          >
            Crear nuevo torneo
          </Button>
        )}
      </div>

      {/* Recordatorio completar perfil de entidad */}
      {(!entidad || !entidad.telefono || !entidad.bio) && (
        <Card as={Link} to="/org/entidad" variant="hover" className={enlaceCard}>
          <div className="flex items-start gap-3">
            <TriangleAlert className="pd-icon text-warning mt-0.5" size={20} aria-hidden="true" />
            <div className="min-w-0">
              <p className="heading-sm m-0">Completá tu perfil de entidad</p>
              <p className="body-sm text-ink-2 mt-1 mb-0">
                Configurá los datos de tu entidad y equipo para que los jugadores te conozcan
              </p>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <Link to="/org/torneos" className="block rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
          <StatTile value={torneos.length} label="Torneos totales" className="h-full" />
        </Link>
        <Link to="/org/torneos" className="block rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
          <StatTile value={activos.length} label="Activos" className="h-full" />
        </Link>
        <StatTile value={finalizados.length} label="Finalizados" className="h-full" />
      </div>

      {activos.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="heading-md m-0">Torneos activos</h2>
          <div className="grid gap-4 sm:grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
            {activos.map((t) => (
              <Card key={t.id} as={Link} to={`/org/torneos/${t.id}`} variant="hover" className={enlaceCard}>
                <Card.Row>
                  <Card.Eyebrow>{formatFecha(t.fechaInicio)}</Card.Eyebrow>
                  <span className="flex flex-wrap items-center justify-end gap-2">
                    {badgeSede(t)}
                    <Badge tone={t.status === "inscripcion" ? "court" : "lime"}>
                      {t.status === "inscripcion" ? "Inscripción" : "En curso"}
                    </Badge>
                  </span>
                </Card.Row>
                <Card.Title className="mt-2!">{t.nombre}</Card.Title>
                <Card.Meta>{sedeDeTorneo(t).nombre}</Card.Meta>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
