import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Users } from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { cargarFlags } from "../services/flagsService";
import { getPartidosAbiertos, sumarmePartido } from "../services/partidosService";
import { formatDiaCorto } from "../utils/formatDate";
import { toast } from "./Toast";
import { Badge, Button, Card } from "./ui";

// Partidos abiertos (P3-15) en el Hub (todos, filtrados por ciudad) y en la página del club (los de ese club).
// Oculto hasta que la plataforma prenda configuracionPadely/flags.partidosAbiertos.
export default function PartidosAbiertos({ clubId = null, ciudad = "", titulo = "Partidos abiertos", className = "" }) {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [activo, setActivo] = useState(false);
  const [partidos, setPartidos] = useState(null);
  const [sumando, setSumando] = useState("");

  useEffect(() => {
    let vivo = true;
    cargarFlags().then((f) => {
      if (!vivo || f?.partidosAbiertos !== true) return;
      setActivo(true);
      getPartidosAbiertos({ clubId }).then((l) => vivo && setPartidos(l));
    });
    return () => {
      vivo = false;
    };
  }, [clubId]);

  if (!activo || !partidos) return null;
  const c = String(ciudad || "").toLowerCase();
  const lista = c ? partidos.filter((p) => String(p.ciudad || "").toLowerCase().includes(c)) : partidos;
  if (!lista.length) return null;

  const sumarme = async (p) => {
    if (!user || user.isAnonymous) {
      navigate(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    setSumando(p.id);
    try {
      const r = await sumarmePartido({ clubId: p.clubId, reservaId: p.reservaId || p.id });
      toast.success("Listo, estás en el partido. Tu parte la pagás en el club o desde la cuenta del turno.");
      navigate(`/mi-cuenta/${p.clubId}/${r.grupoId}`);
    } catch (err) {
      console.error("No se pudo sumar al partido:", err);
      toast.error(err?.message || "No pudimos sumarte. Probá de nuevo.");
      setSumando("");
    }
  };

  return (
    <section className={["flex flex-col gap-3", className].filter(Boolean).join(" ")}>
      <h2 className="heading-md m-0 flex items-center gap-2">
        <Users className="pd-icon text-ink-3" size={20} aria-hidden="true" />
        {titulo}
        <span className="pd-count">{lista.length}</span>
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {lista.map((p) => (
          <Card key={p.id}>
            <Card.Row>
              <p className="pd-eyebrow m-0">
                {formatDiaCorto(p.fecha)} · {p.horaInicio}
                {p.horaFin ? `–${p.horaFin}` : ""}
              </p>
              <Badge tone="court">{p.libres === 1 ? "Falta 1" : `Faltan ${p.libres}`}</Badge>
            </Card.Row>
            <Card.Title as="h3" className="mt-1!">
              {clubId ? p.canchaNombre || "Cancha" : <Link to={`/club/${p.clubId}`} className="hover:underline">{p.clubNombre || "Club"}</Link>}
            </Card.Title>
            <Card.Meta className="mt-1!">
              {[clubId ? null : p.canchaNombre, p.ciudad, p.nivel ? `Nivel ${p.nivel}` : "Cualquier nivel"].filter(Boolean).join(" · ")}
            </Card.Meta>
            {p.nota && <p className="body-sm text-ink-2 mt-2 mb-0">{p.nota}</p>}
            <div className="mt-3">
              <Button size="sm" variant="primary" onClick={() => sumarme(p)} cargando={sumando === p.id ? "Sumándote…" : ""}>
                Sumarme
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
