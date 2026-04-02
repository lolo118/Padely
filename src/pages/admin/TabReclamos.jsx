import { useEffect, useState } from "react";
import { getReclamos, resolverReclamo } from "../../services/torneoService";

function getNombrePareja(p) {
  if (!p) return "—";
  return p.nombrePareja || `${p.jugador1} / ${p.jugador2}`;
}

const motivoLabel = {
  categoria_incorrecta: "Categoría incorrecta",
  conducta_antideportiva: "Conducta antideportiva",
};

export default function TabReclamos({ torneoId, torneo }) {
  const [reclamos, setReclamos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [motivoDecision, setMotivoDecision] = useState("");
  const [resolviendo, setResolviendo] = useState(null);

  useEffect(() => {
    getReclamos(torneoId).then((data) => {
      setReclamos(data);
      setLoading(false);
    });
  }, [torneoId]);

  const handleResolver = async (reclamoId, decision) => {
    if (!motivoDecision.trim() && decision === "descalificar") {
      alert("Ingresá un motivo para la descalificación");
      return;
    }
    setResolviendo(reclamoId);
    try {
      await resolverReclamo(torneoId, reclamoId, decision, motivoDecision || "Sin motivo especificado");
      const actualizados = await getReclamos(torneoId);
      setReclamos(actualizados);
      setMotivoDecision("");
    } catch (err) {
      console.error("Error al resolver:", err);
    }
    setResolviendo(null);
  };

  if (loading) return <div className="text-center py-12" style={{ color: "var(--text-muted)" }}>Cargando reclamos...</div>;

  if (!torneo.habilitarReclamos) {
    return (
      <div className="themed-card rounded-2xl p-5 border text-center py-12">
        <div className="text-4xl mb-3">🛡️</div>
        <p className="font-medium" style={{ color: "var(--text-secondary)" }}>Sistema de reclamos deshabilitado</p>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
          Podés habilitarlo editando la configuración del torneo
        </p>
      </div>
    );
  }

  if (reclamos.length === 0) {
    return (
      <div className="themed-card rounded-2xl p-5 border text-center py-12">
        <div className="text-4xl mb-3">✅</div>
        <p className="font-medium" style={{ color: "var(--text-secondary)" }}>No hay reclamos</p>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
          Ninguna pareja ha iniciado un reclamo
        </p>
      </div>
    );
  }

  const abiertos = reclamos.filter((r) => r.estado === "abierto");
  const resueltos = reclamos.filter((r) => r.estado === "resuelto");

  return (
    <div className="flex flex-col gap-4">
      {/* Tip */}
      <div className="text-xs text-blue-500 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
        💡 Revisá cada reclamo, leé el descargo de la pareja denunciada y las parejas adheridas antes de tomar una decisión. Tu decisión es final.
      </div>

      {/* Reclamos abiertos */}
      {abiertos.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
            Reclamos abiertos ({abiertos.length})
          </h3>
          <div className="flex flex-col gap-3">
            {abiertos.map((r) => {
              const horasRestantes = Math.max(0,
                (Number(torneo.plazoReclamosHoras) || 2) -
                Math.floor((Date.now() - new Date(r.creadoEn).getTime()) / 3600000)
              );
              return (
                <div key={r.id} className="themed-card rounded-2xl p-5 border">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <span className="text-xs font-semibold px-2 py-1 rounded-full bg-red-100 text-red-600">
                        {motivoLabel[r.motivo] || r.motivo}
                      </span>
                      <span className="text-xs ml-2" style={{ color: "var(--text-muted)" }}>
                        {horasRestantes > 0 ? `${horasRestantes}h restantes` : "Plazo vencido"}
                      </span>
                    </div>
                    <span className="text-xs font-semibold px-2 py-1 rounded-full bg-amber-100 text-amber-700">Abierto</span>
                  </div>

                  <div className="rounded-xl p-3 mb-3" style={{ backgroundColor: "var(--bg-card-hover)" }}>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>Denunciante</p>
                    <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{getNombrePareja(r.parejaDenunciante)}</p>
                    <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>Denunciada</p>
                    <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{getNombrePareja(r.parejaDenunciada)}</p>
                  </div>

                  {r.comentario && (
                    <div className="mb-3">
                      <p className="text-xs font-semibold mb-1" style={{ color: "var(--text-muted)" }}>Comentario del denunciante</p>
                      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{r.comentario}</p>
                    </div>
                  )}

                  {/* Adheridos */}
                  {(r.adheridos || []).length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs font-semibold mb-1" style={{ color: "var(--text-muted)" }}>
                        Parejas adheridas ({r.adheridos.length})
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {r.adheridos.map((a, i) => (
                          <span key={i} className="text-xs px-2 py-1 rounded-full bg-red-50 text-red-600">
                            {getNombrePareja(a)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Descargo */}
                  {r.descargo ? (
                    <div className="mb-3 rounded-xl p-3" style={{ backgroundColor: "rgba(59,130,246,0.08)" }}>
                      <p className="text-xs font-semibold mb-1" style={{ color: "#3b82f6" }}>Descargo de la pareja denunciada</p>
                      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{r.descargo}</p>
                    </div>
                  ) : (
                    <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
                      La pareja denunciada aún no dejó descargo
                    </p>
                  )}

                  {/* Decisión */}
                  <div className="border-t pt-3 mt-2" style={{ borderColor: "var(--border-card)" }}>
                    <label className="text-xs font-semibold mb-1 block" style={{ color: "var(--text-muted)" }}>
                      Motivo de la decisión
                    </label>
                    <textarea
                      value={motivoDecision}
                      onChange={(e) => setMotivoDecision(e.target.value)}
                      placeholder="Explicá brevemente tu decisión..."
                      rows={2}
                      className="themed-input w-full rounded-xl px-4 py-2 text-sm border resize-none mb-2"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleResolver(r.id, "desestimar")}
                        disabled={resolviendo === r.id}
                        className="flex-1 py-2 rounded-xl text-sm font-semibold transition disabled:opacity-50"
                        style={{ backgroundColor: "var(--bg-card-hover)", color: "var(--text-secondary)" }}
                      >
                        Desestimar
                      </button>
                      <button
                        onClick={() => handleResolver(r.id, "descalificar")}
                        disabled={resolviendo === r.id}
                        className="flex-1 py-2 rounded-xl text-sm font-semibold text-white transition disabled:opacity-50 bg-red-600 hover:bg-red-700"
                      >
                        Descalificar pareja
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Reclamos resueltos */}
      {resueltos.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
            Reclamos resueltos ({resueltos.length})
          </h3>
          <div className="flex flex-col gap-3">
            {resueltos.map((r) => (
              <div key={r.id} className="themed-card rounded-2xl p-5 border opacity-75">
                <div className="flex items-start justify-between mb-2">
                  <span className="text-xs font-semibold px-2 py-1 rounded-full bg-red-100 text-red-600">
                    {motivoLabel[r.motivo] || r.motivo}
                  </span>
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                    r.decision === "descalificar" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
                  }`}>
                    {r.decision === "descalificar" ? "Descalificada" : "Desestimado"}
                  </span>
                </div>
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  {getNombrePareja(r.parejaDenunciante)} → {getNombrePareja(r.parejaDenunciada)}
                </p>
                {r.motivoDecision && (
                  <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
                    Decisión: {r.motivoDecision}
                  </p>
                )}
                <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                  {r.adheridos?.length || 0} pareja{(r.adheridos?.length || 0) !== 1 ? "s" : ""} adherida{(r.adheridos?.length || 0) !== 1 ? "s" : ""}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
