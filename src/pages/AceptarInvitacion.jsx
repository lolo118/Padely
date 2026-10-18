import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { formatFecha } from "../utils/formatDate";
import { formatPrecio, ubicacionCorta } from "../utils/format";
import {
  getTorneoById,
  getInscripciones,
  actualizarInscripcion,
} from "../services/torneoService";
import { Badge, Button, MarcaCategoria } from "../components/ui";

// Una línea de la ficha del torneo: la etiqueta como eyebrow y el dato debajo
function Linea({ etiqueta, className = "", children }) {
  return (
    <div className={className}>
      <span className="pd-eyebrow block">{etiqueta}</span>
      <span className="block body-sm font-medium! text-ink mt-0.5">{children}</span>
    </div>
  );
}

export default function AceptarInvitacion() {
  const { torneoId, inscripcionId } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuthStore();
  const [torneo, setTorneo] = useState(null);
  const [inscripcion, setInscripcion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [estado, setEstado] = useState(null); // "pendiente_aprobacion", "confirmada", "rechazada", "error"

  // Aceptar la invitación requiere estar logueado: guardamos a dónde volver y vamos al login
  useEffect(() => {
    if (authLoading || user) return;
    localStorage.setItem("padely-vincular-redirect", window.location.pathname);
    navigate("/login");
  }, [authLoading, user, navigate]);

  useEffect(() => {
    const cargar = async () => {
      try {
        const [torneoData, inscData] = await Promise.all([
          getTorneoById(torneoId),
          getInscripciones(torneoId),
        ]);
        setTorneo(torneoData);
        const insc = inscData.find((i) => i.id === inscripcionId);
        if (insc) {
          setInscripcion(insc);
          if (insc.status !== "esperando_companero") {
            setEstado(insc.status);
          }
        }
      } catch (err) {
        console.error("Error al cargar invitación:", err);
      }
      setLoading(false);
    };
    cargar();
  }, [torneoId, inscripcionId]);

  const aceptarInvitacion = async () => {
    if (!user) return;
    setProcesando(true);
    try {
      // Una sola actualización con exactamente las claves que permiten las reglas
      await actualizarInscripcion(torneoId, inscripcionId, {
        status: "pendiente_aprobacion",
        jugador2Uid: user.uid,
        jugador2Confirmado: true,
      });
      setInscripcion({ ...inscripcion, status: "pendiente_aprobacion", jugador2Uid: user.uid, jugador2Confirmado: true });
      setEstado("pendiente_aprobacion");
    } catch (err) {
      console.error("Error al aceptar:", err);
      setEstado("error");
    }
    setProcesando(false);
  };

  if (loading || authLoading || !user) {
    return (
      <div className="min-h-screen bg-surface px-4 py-8">
        <div className="pd-card max-w-md mx-auto flex flex-col gap-3" aria-busy="true">
          <span className="sr-only">Cargando invitación…</span>
          <div className="pd-skeleton h-4 w-1/3" />
          <div className="pd-skeleton h-7 w-2/3" />
          <div className="pd-skeleton h-40" />
          <div className="pd-skeleton h-11" />
        </div>
      </div>
    );
  }

  if (!torneo || !inscripcion) {
    return (
      <div className="min-h-screen bg-surface px-4 py-8">
        <div className="pd-card max-w-md mx-auto text-center">
          <div className="flex justify-center mb-4">
            <span className="pd-ball" aria-hidden="true" />
          </div>
          <h1 className="heading-md">Invitación no encontrada</h1>
          <p className="body-sm text-ink-2 mt-1">El link puede estar vencido o ser incorrecto</p>
          <Button variant="primary" className="mt-4" onClick={() => navigate("/torneos")}>
            Ver torneos
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface px-4 py-8">
      <div className="pd-card max-w-md mx-auto">
        <div className="mb-4">
          <p className="pd-eyebrow mb-1!">Invitación a torneo</p>
          <h1 className="heading-md">{torneo.nombre}</h1>
        </div>

        {/* Ficha del torneo */}
        <div className="rounded-md bg-surface-sunken p-4 mb-4">
          <div className="grid grid-cols-2 gap-3">
            <Linea etiqueta="Sede">{torneo.sede}</Linea>
            <Linea etiqueta="Ubicación">
              {ubicacionCorta(torneo)}
            </Linea>
            {torneo.direccionSede && (
              <Linea etiqueta="Dirección" className="col-span-2">
                {torneo.direccionSede}
              </Linea>
            )}
            <Linea etiqueta="Fechas">
              {formatFecha(torneo.fechaInicio)} – {formatFecha(torneo.fechaFin)}
            </Linea>
            <Linea etiqueta="Inscripción">
              {torneo.inscripcion > 0 ? formatPrecio(torneo.inscripcion) : "Gratuita"}
            </Linea>
            <Linea etiqueta="Formato" className="capitalize">
              {torneo.formato}
            </Linea>
            <Linea etiqueta="Máx. parejas">{torneo.maxParejas}</Linea>
            {Array.isArray(torneo.categoriaGenero) && (
              <Linea etiqueta="Género" className="capitalize">
                {torneo.categoriaGenero.join(", ")}
              </Linea>
            )}
            {torneo.categoriasConfig && (
              <div className="col-span-2">
                <span className="pd-eyebrow block">Categorías</span>
                <div className="flex flex-col gap-1 mt-1">
                  {Object.entries(torneo.categoriasConfig).map(([g, niveles]) => (
                    <div key={g} className="flex flex-wrap items-center gap-2">
                      <span className="body-sm font-medium! text-ink capitalize">{g}</span>
                      {niveles.map((n) => (
                        <Badge key={n}>
                          <MarcaCategoria cat={n} size={20} />
                          {n}
                        </Badge>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          {torneo.reglamento && (
            <div className="mt-3 pt-3 border-t border-line">
              <span className="pd-eyebrow block mb-1!">Reglamento</span>
              <p className="body-sm text-ink whitespace-pre-line">{torneo.reglamento}</p>
            </div>
          )}
        </div>

        {/* Estado: esperando confirmación */}
        {!estado && inscripcion.status === "esperando_companero" && (
          <div className="flex flex-col gap-2">
            <Button
              variant="primary"
              block
              onClick={aceptarInvitacion}
              disabled={procesando || !user}
              cargando={procesando ? "Aceptando…" : ""}
            >
              Aceptar invitación
            </Button>
            <Button block onClick={() => navigate("/torneos")}>
              Rechazar
            </Button>
          </div>
        )}

        {/* Estado: pendiente de aprobación */}
        {estado === "pendiente_aprobacion" && (
          <div className="rounded-md border border-line p-4 text-center">
            <Badge tone="warning" dot>
              Invitación aceptada
            </Badge>
            <p className="body-sm text-ink-2 mt-2">
              Tu inscripción quedó pendiente de aprobación del organizador. Te
              notificaremos cuando sea confirmada.
            </p>
            <Button variant="primary" className="mt-3" onClick={() => navigate(`/torneos/${torneoId}`)}>
              Ver torneo
            </Button>
          </div>
        )}

        {/* Estado: confirmada */}
        {estado === "confirmada" && (
          <div className="rounded-md border border-line p-4 text-center">
            <Badge tone="success" dot>
              Inscripción confirmada
            </Badge>
            <p className="body-sm text-ink-2 mt-2">Ya están inscriptos en el torneo. ¡Éxitos!</p>
            <Button variant="primary" className="mt-3" onClick={() => navigate(`/torneos/${torneoId}`)}>
              Ver torneo
            </Button>
          </div>
        )}

        {/* Estado: rechazada */}
        {estado === "rechazada" && (
          <div className="rounded-md border border-line p-4 text-center">
            <Badge tone="danger" dot>
              Inscripción rechazada
            </Badge>
            {inscripcion.motivoRechazo && (
              <p className="body-sm text-ink-2 mt-2">Motivo: {inscripcion.motivoRechazo}</p>
            )}
            <Button variant="primary" className="mt-3" onClick={() => navigate("/torneos")}>
              Ver otros torneos
            </Button>
          </div>
        )}

        {estado === "error" && (
          <p className="body-sm text-danger text-center" role="alert">
            Hubo un error. Intentá de nuevo.
          </p>
        )}
      </div>
    </div>
  );
}
