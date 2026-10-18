import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Check, Plus } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { formatFecha } from "../../utils/formatDate";
import { ubicacionCorta } from "../../utils/format";
import { canchasDelTorneo, textoDeCanchas } from "../../utils/torneo";
import { getTorneosByOrganizer, getTorneosDeClub, responderSolicitudSede } from "../../services/torneoService";
import { getClubByOwner } from "../../services/canchaService";
import { notificarSedeRespondida } from "../../services/notificationService";
import { toast } from "../../components/Toast";
import { confirmar } from "../../components/ConfirmDialog";
import { Badge, Button, Card, Tabs } from "../../components/ui";

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

const enlaceCard =
  "block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

// "del 18/10/26 al 19/10/26", "el 18/10/26" si es un solo día, o "" si el torneo no tiene fechas
function rangoFechas(torneo) {
  const inicio = formatFecha(torneo?.fechaInicio);
  const fin = formatFecha(torneo?.fechaFin);
  if (inicio && fin && inicio !== fin) return `del ${inicio} al ${fin}`;
  const unica = inicio || fin;
  return unica ? `el ${unica}` : "";
}

function EstadoVacio({ titulo, detalle }) {
  return (
    <Card className="text-center py-12!">
      <span className="pd-ball mx-auto mb-3 block!" aria-hidden="true" />
      <p className="heading-sm m-0">{titulo}</p>
      {detalle && <p className="body-sm text-ink-2 mt-1 mb-0">{detalle}</p>}
    </Card>
  );
}

// Tarjeta de un torneo ajeno que se juega (o pide jugarse) en el club: organizador, estado, fechas y canchas.
// Los torneos viejos pueden no tener `canchas`: en ese caso no se muestran badges.
function CardTorneoClub({ torneo, children }) {
  const canchas = canchasDelTorneo(torneo);
  return (
    <Card>
      <Card.Row>
        <Card.Eyebrow>{torneo.organizadorNombre || "Organizador externo"}</Card.Eyebrow>
        <Badge tone={estadoTone[torneo.status] || "neutral"}>{estadoLabel[torneo.status] || torneo.status}</Badge>
      </Card.Row>
      <Card.Title className="mt-2!">{torneo.nombre}</Card.Title>
      <Card.Meta>
        {formatFecha(torneo.fechaInicio)} – {formatFecha(torneo.fechaFin)}
      </Card.Meta>
      {canchas.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {canchas.map((c) => (
            <Badge key={c.id}>{c.nombre}</Badge>
          ))}
        </div>
      )}
      {children && <Card.Foot className="flex-wrap">{children}</Card.Foot>}
    </Card>
  );
}

export default function Torneos() {
  const { user } = useAuthStore();
  const [torneos, setTorneos] = useState([]);
  // Club del que el usuario es dueño (null si no tiene): habilita las pestañas de sede
  const [club, setClub] = useState(null);
  // Torneos vinculados al club en cualquier estado; de acá salen "En mi club" y "Solicitudes"
  const [torneosClub, setTorneosClub] = useState([]);
  const [loading, setLoading] = useState(true);
  // ?tab=club | solicitudes (los links del panel y de las notificaciones llegan a la pestaña justa)
  const [searchParams] = useSearchParams();
  const tabInicial = ["club", "solicitudes"].includes(searchParams.get("tab")) ? searchParams.get("tab") : "mios";
  const [tab, setTab] = useState(tabInicial);
  // { id, estado } del pedido que se está respondiendo
  const [respondiendo, setRespondiendo] = useState(null);

  const cargarTorneosClub = useCallback(async (clubId) => {
    try {
      setTorneosClub(await getTorneosDeClub(clubId));
    } catch (err) {
      console.error("Error al cargar los torneos del club:", err);
      setTorneosClub([]);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    const cargar = async () => {
      try {
        const [misTorneos, clubData] = await Promise.all([
          getTorneosByOrganizer(user.uid),
          getClubByOwner(user.uid).catch((err) => {
            console.error("Error al buscar el club:", err);
            return null;
          }),
        ]);
        setTorneos(misTorneos);
        setClub(clubData);
        if (clubData) await cargarTorneosClub(clubData.id);
      } catch (err) {
        console.error("Error al cargar torneos:", err);
      }
      setLoading(false);
    };
    cargar();
  }, [user, cargarTorneosClub]);

  const uid = user?.uid;
  const enMiClub = torneosClub.filter((t) => t.club?.estado === "aceptado" && t.organizerId !== uid);
  const solicitudes = torneosClub.filter((t) => t.club?.estado === "pendiente");

  const responder = async (t, estado) => {
    const acepta = estado === "aceptado";
    const rango = rangoFechas(t);
    const canchas = textoDeCanchas(canchasDelTorneo(t)) || "tus canchas";
    const ok = await confirmar({
      titulo: acepta ? "¿Aceptar la sede?" : "¿Rechazar la sede?",
      mensaje: acepta
        ? `${t.nombre} se jugaría en tu club${rango ? ` ${rango}` : ""} en ${canchas}. Los partidos programados bloquean esos turnos.`
        : "El organizador tendrá que elegir otra sede.",
      confirmText: acepta ? "Aceptar sede" : "Rechazar sede",
      danger: !acepta,
    });
    if (!ok) return;
    setRespondiendo({ id: t.id, estado });
    try {
      await responderSolicitudSede(t.id, estado);
      if (t.organizerId) {
        try {
          await notificarSedeRespondida(t.organizerId, club?.nombre || "", estado, t.id);
        } catch (err) {
          console.error("No pudimos avisar al organizador:", err);
        }
      }
      toast.success(acepta ? "Sede aceptada" : "Sede rechazada");
      await cargarTorneosClub(club.id);
    } catch (err) {
      console.error(err);
      toast.error("No pudimos responder el pedido. Intentá de nuevo.");
    }
    setRespondiendo(null);
  };

  const tabs = [
    { value: "mios", label: "Mis torneos" },
    { value: "club", label: "En mi club" },
    { value: "solicitudes", label: "Solicitudes", count: solicitudes.length },
  ];
  const tabActiva = club ? tab : "mios";
  const rolPanel = club ? "tabpanel" : undefined;

  const renderMisTorneos = () => {
    if (torneos.length === 0) {
      return (
        <EstadoVacio titulo="Todavía no creaste ningún torneo." detalle='Creá el primero con "Crear torneo".' />
      );
    }
    return (
      <div className="grid gap-4 sm:grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
        {torneos.map((t) => {
          const activo = esActivo(t.status);
          return (
            <Card
              key={t.id}
              as={Link}
              to={`/admin/torneos/${t.id}`}
              variant={activo ? "torneo" : "default"}
              hover
              className={enlaceCard}
            >
              <Card.Row>
                <Card.Eyebrow>{t.formato || "Torneo"}</Card.Eyebrow>
                <Badge tone={estadoTone[t.status] || "neutral"}>{estadoLabel[t.status] || t.status}</Badge>
              </Card.Row>
              <Card.Title className="mt-2!">{t.nombre}</Card.Title>
              <Card.Meta>
                {t.sede} · {ubicacionCorta(t)}
              </Card.Meta>
              <Card.Meta>
                {formatFecha(t.fechaInicio)} – {formatFecha(t.fechaFin)}
              </Card.Meta>
              <Card.Foot className="flex-wrap">
                {t.categoria && <Badge className="capitalize">{t.categoria}</Badge>}
                <span className="caption pd-ink-3 ml-auto pd-tnum">{t.maxParejas} parejas</span>
              </Card.Foot>
            </Card>
          );
        })}
      </div>
    );
  };

  const renderEnMiClub = () => {
    if (enMiClub.length === 0) {
      return (
        <EstadoVacio
          titulo="Ningún torneo de otros organizadores se juega en tu club."
          detalle="Cuando aceptes un pedido de sede, el torneo aparece acá."
        />
      );
    }
    return (
      <div className="grid gap-4 sm:grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
        {enMiClub.map((t) => (
          <CardTorneoClub key={t.id} torneo={t}>
            <Button as="link" to={`/torneos/${t.id}`} size="sm">
              Ver página pública
            </Button>
          </CardTorneoClub>
        ))}
      </div>
    );
  };

  const renderSolicitudes = () => {
    if (solicitudes.length === 0) {
      return (
        <EstadoVacio
          titulo="No tenés pedidos de sede pendientes."
          detalle="Cuando un organizador elija tu club como sede, el pedido aparece acá."
        />
      );
    }
    return (
      <div className="grid gap-4 sm:grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
        {solicitudes.map((t) => {
          const enCurso = respondiendo?.id === t.id;
          return (
            <CardTorneoClub key={t.id} torneo={t}>
              <Button
                size="sm"
                icon={<Check className="pd-icon" size={20} aria-hidden="true" />}
                cargando={enCurso && respondiendo.estado === "aceptado" ? "Aceptando…" : ""}
                disabled={enCurso}
                onClick={() => responder(t, "aceptado")}
              >
                Aceptar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                cargando={enCurso && respondiendo.estado === "rechazado" ? "Rechazando…" : ""}
                disabled={enCurso}
                onClick={() => responder(t, "rechazado")}
              >
                Rechazar
              </Button>
            </CardTorneoClub>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="heading-lg m-0">{club ? "Torneos" : "Mis torneos"}</h1>
        <Button
          as="link"
          to="/admin/torneos/nuevo"
          variant="primary"
          icon={<Plus className="pd-icon" size={20} aria-hidden="true" />}
        >
          Crear torneo
        </Button>
      </div>

      {!loading && club && <Tabs items={tabs} value={tabActiva} onChange={setTab} ariaLabel="Secciones de torneos" />}

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

      {!loading && tabActiva === "mios" && (
        <div role={rolPanel} aria-label={rolPanel ? "Mis torneos" : undefined}>
          {renderMisTorneos()}
        </div>
      )}

      {!loading && tabActiva === "club" && (
        <div role="tabpanel" aria-label="En mi club">
          {renderEnMiClub()}
        </div>
      )}

      {!loading && tabActiva === "solicitudes" && (
        <div role="tabpanel" aria-label="Solicitudes de sede">
          {renderSolicitudes()}
        </div>
      )}
    </div>
  );
}
