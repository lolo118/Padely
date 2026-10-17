import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import { getReclamos, resolverReclamo } from "../../services/torneoService";
import { getNombrePareja } from "../../utils/torneo";
import { toast } from "../../components/Toast";
import { Badge, Button, Card, Field, Textarea } from "../../components/ui";

const motivoLabel = {
  categoria_incorrecta: "Categoría incorrecta",
  conducta_antideportiva: "Conducta antideportiva",
};

export default function TabReclamos({ torneoId, torneo }) {
  const [reclamos, setReclamos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [motivoDecision, setMotivoDecision] = useState("");
  const [resolviendo, setResolviendo] = useState(null);
  const [ahora] = useState(() => Date.now());

  useEffect(() => {
    getReclamos(torneoId).then((data) => {
      setReclamos(data);
      setLoading(false);
    });
  }, [torneoId]);

  const handleResolver = async (reclamoId, decision) => {
    if (!motivoDecision.trim() && decision === "descalificar") {
      toast.error("Ingresá un motivo para la descalificación");
      return;
    }
    setResolviendo(reclamoId);
    try {
      await resolverReclamo(torneoId, reclamoId, decision, motivoDecision || "Sin motivo especificado");
      const actualizados = await getReclamos(torneoId);
      setReclamos(actualizados);
      setMotivoDecision("");
      toast.success("Reclamo resuelto");
    } catch (err) {
      console.error("Error al resolver:", err);
      toast.error("No pudimos resolver el reclamo. Intentá de nuevo.");
    }
    setResolviendo(null);
  };

  if (loading)
    return (
      <div className="flex flex-col gap-4" role="status" aria-busy="true" aria-label="Cargando reclamos">
        <div className="pd-skeleton h-40" />
        <div className="pd-skeleton h-40" />
      </div>
    );

  if (!torneo.habilitarReclamos) {
    return (
      <Card className="text-center py-12">
        <div className="mb-3">
          <span className="pd-ball" aria-hidden="true" />
        </div>
        <p className="heading-sm">Sistema de reclamos deshabilitado</p>
        <p className="body-sm text-ink-2 mt-1">Podés habilitarlo editando la configuración del torneo</p>
      </Card>
    );
  }

  if (reclamos.length === 0) {
    return (
      <Card className="text-center py-12">
        <div className="mb-3">
          <span className="pd-ball" aria-hidden="true" />
        </div>
        <p className="heading-sm">No hay reclamos</p>
        <p className="body-sm text-ink-2 mt-1">Ninguna pareja ha iniciado un reclamo</p>
      </Card>
    );
  }

  const abiertos = reclamos.filter((r) => r.estado === "abierto");
  const resueltos = reclamos.filter((r) => r.estado === "resuelto");

  return (
    <div className="flex flex-col gap-4">
      {/* Tip */}
      <p className="flex items-start gap-2 rounded-md bg-surface-sunken px-3 py-2 body-sm text-ink-2">
        <Info className="pd-icon text-ink-3" size={20} aria-hidden="true" />
        <span>
          Revisá cada reclamo, leé el descargo de la pareja denunciada y las parejas adheridas antes de tomar una
          decisión. Tu decisión es final.
        </span>
      </p>

      {/* Reclamos abiertos */}
      {abiertos.length > 0 && (
        <section>
          <h3 className="heading-sm mb-2">
            Reclamos abiertos <span className="pd-count text-ink-3 font-medium">{abiertos.length}</span>
          </h3>
          <div className="flex flex-col gap-4">
            {abiertos.map((r) => {
              const minutosRestantes = Math.max(0,
                (Number(torneo.plazoReclamosMinutos) || 30) -
                Math.floor((ahora - new Date(r.creadoEn).getTime()) / 60000)
              );
              // "Grupo A · 7ma Masculino": grupo y cuadro del partido reclamado, cuando el reclamo los trae
              const contexto = [r.grupoNombre, r.cuadroLabel].filter(Boolean).join(" · ");
              const plazo = minutosRestantes > 0 ? `${minutosRestantes} min restantes` : "Plazo vencido";
              return (
                <Card key={r.id}>
                  <Card.Row className="items-start!">
                    <Card.Eyebrow>{[contexto, plazo].filter(Boolean).join(" · ")}</Card.Eyebrow>
                    <Badge tone="warning" dot>
                      Abierto
                    </Badge>
                  </Card.Row>
                  <Card.Title className="mt-2!">{motivoLabel[r.motivo] || r.motivo}</Card.Title>

                  <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 rounded-md bg-surface-sunken p-3 mt-3">
                    <div>
                      <dt className="body-sm text-ink-3">Denunciante</dt>
                      <dd className="body-md font-semibold!">{getNombrePareja(r.parejaDenunciante)}</dd>
                    </div>
                    <div>
                      <dt className="body-sm text-ink-3">Denunciada</dt>
                      <dd className="body-md font-semibold!">{getNombrePareja(r.parejaDenunciada)}</dd>
                    </div>
                  </dl>

                  {r.comentario && (
                    <div className="mt-3">
                      <p className="pd-eyebrow mb-1!">Comentario del denunciante</p>
                      <p className="body-sm text-ink-2">{r.comentario}</p>
                    </div>
                  )}

                  {/* Adheridos */}
                  {(r.adheridos || []).length > 0 && (
                    <div className="mt-3">
                      <p className="pd-eyebrow mb-1!">
                        Parejas adheridas <span className="pd-count font-medium">{r.adheridos.length}</span>
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {r.adheridos.map((a, i) => (
                          <Badge key={i}>{getNombrePareja(a)}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Descargo */}
                  {r.descargo ? (
                    <div className="mt-3 rounded-md border border-line p-3">
                      <p className="pd-eyebrow mb-1!">Descargo de la pareja denunciada</p>
                      <p className="body-sm text-ink-2">{r.descargo}</p>
                    </div>
                  ) : (
                    <p className="body-sm text-ink-3 mt-3">La pareja denunciada aún no dejó descargo</p>
                  )}

                  {/* Decisión */}
                  <div className="border-t border-line pt-4 mt-4 flex flex-col gap-3">
                    <Field label="Motivo de la decisión">
                      <Textarea
                        value={motivoDecision}
                        onChange={(e) => setMotivoDecision(e.target.value)}
                        placeholder="Explicá brevemente tu decisión..."
                        rows={2}
                      />
                    </Field>
                    <div className="pd-btn-group">
                      <Button size="sm" onClick={() => handleResolver(r.id, "desestimar")} disabled={resolviendo === r.id}>
                        Desestimar
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => handleResolver(r.id, "descalificar")}
                        disabled={resolviendo === r.id}
                      >
                        Descalificar pareja
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* Reclamos resueltos */}
      {resueltos.length > 0 && (
        <section>
          <h3 className="heading-sm mb-2">
            Reclamos resueltos <span className="pd-count text-ink-3 font-medium">{resueltos.length}</span>
          </h3>
          <div className="flex flex-col gap-4">
            {resueltos.map((r) => {
              const contexto = [r.grupoNombre, r.cuadroLabel].filter(Boolean).join(" · ");
              const adheridos = r.adheridos?.length || 0;
              return (
                <Card key={r.id}>
                  <Card.Row className="items-start!">
                    <Card.Eyebrow>{contexto || "Reclamo"}</Card.Eyebrow>
                    {r.decision === "descalificar" ? (
                      <Badge tone="danger" dot>
                        Descalificada
                      </Badge>
                    ) : (
                      <Badge tone="success" dot>
                        Desestimado
                      </Badge>
                    )}
                  </Card.Row>
                  <Card.Title className="mt-2!">{motivoLabel[r.motivo] || r.motivo}</Card.Title>
                  <Card.Meta>
                    {getNombrePareja(r.parejaDenunciante)} → {getNombrePareja(r.parejaDenunciada)}
                  </Card.Meta>
                  {r.motivoDecision && <p className="body-sm text-ink-2 mt-2">Decisión: {r.motivoDecision}</p>}
                  <p className="body-sm text-ink-3 mt-1">
                    {adheridos} pareja{adheridos !== 1 ? "s" : ""} adherida{adheridos !== 1 ? "s" : ""}
                  </p>
                </Card>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
