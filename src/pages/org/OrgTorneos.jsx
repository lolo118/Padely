import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { getTorneosByOrganizer } from "../../services/torneoService";
import { formatFecha } from "../../utils/formatDate";
import { ubicacionCorta } from "../../utils/format";
import { sedeDeTorneo } from "../../utils/torneo";
import { Badge, Button, Card } from "../../components/ui";

const estadoLabel = {
  inscripcion: "Inscripción abierta",
  en_curso: "En curso",
  finalizado: "Finalizado",
  cancelado: "Cancelado",
};

// Heat solo para el torneo abierto o en curso; el resto vuelve a una tarjeta quieta
const estadoTone = {
  inscripcion: "heat",
  en_curso: "heat",
  finalizado: "neutral",
  cancelado: "danger",
};

const esActivo = (status) => status === "inscripcion" || status === "en_curso";

// Estado del vínculo con el club sede; aceptado (o sin club) no lleva badge
const badgeSede = (t) => {
  if (t.club?.estado === "pendiente") return <Badge tone="warning">Esperando confirmación</Badge>;
  if (t.club?.estado === "rechazado") return <Badge tone="danger">Sede rechazada</Badge>;
  return null;
};

const enlaceCard =
  "block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

export default function OrgTorneos() {
  const { user } = useAuthStore();
  const [torneos, setTorneos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    getTorneosByOrganizer(user.uid)
      .then(setTorneos)
      .finally(() => setLoading(false));
  }, [user]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="heading-lg m-0">Mis torneos</h1>
        <Button
          as="link"
          to="/org/torneos/nuevo"
          variant="primary"
          icon={<Plus className="pd-icon" size={20} aria-hidden="true" />}
        >
          Crear torneo
        </Button>
      </div>

      {loading && (
        <div
          className="grid gap-4 sm:grid-cols-[repeat(auto-fill,minmax(300px,1fr))]"
          aria-busy="true"
          aria-label="Cargando torneos"
        >
          {[0, 1, 2].map((i) => (
            <div key={i} className="pd-skeleton h-44 rounded-lg!" />
          ))}
        </div>
      )}

      {!loading && torneos.length === 0 && (
        <Card className="text-center py-12!">
          <span className="pd-ball mx-auto mb-3 block!" aria-hidden="true" />
          <p className="heading-sm m-0">Todavía no creaste ningún torneo.</p>
          <p className="body-sm text-ink-2 mt-1 mb-0">Creá el primero con "Crear torneo".</p>
        </Card>
      )}

      {!loading && torneos.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
          {torneos.map((t) => {
            const activo = esActivo(t.status);
            const sede = sedeDeTorneo(t);
            return (
              <Card
                key={t.id}
                as={Link}
                to={`/org/torneos/${t.id}`}
                variant={activo ? "torneo" : "default"}
                hover
                className={enlaceCard}
              >
                <Card.Row>
                  <Card.Eyebrow>{t.formato || "Torneo"}</Card.Eyebrow>
                  <span className="flex flex-wrap items-center justify-end gap-2">
                    {badgeSede(t)}
                    <Badge tone={estadoTone[t.status] || "neutral"}>{estadoLabel[t.status] || t.status}</Badge>
                  </span>
                </Card.Row>
                <Card.Title className="mt-2!">{t.nombre}</Card.Title>
                <Card.Meta>
                  {sede.nombre} · {ubicacionCorta(sede)}
                </Card.Meta>
                <Card.Meta>
                  {formatFecha(t.fechaInicio)} – {formatFecha(t.fechaFin)}
                </Card.Meta>
                <Card.Foot className="flex-wrap">
                  {Array.isArray(t.categoriaGenero) &&
                    t.categoriaGenero.map((g) => (
                      <Badge key={g} className="capitalize">
                        {g}
                      </Badge>
                    ))}
                  <span className="caption pd-ink-3 ml-auto pd-tnum">{t.maxParejas} parejas</span>
                </Card.Foot>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
