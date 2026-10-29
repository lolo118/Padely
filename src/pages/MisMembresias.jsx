import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { IdCard } from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { getMisMembresias } from "../services/membresiasService";
import { ESTADOS_SOCIO, estadoSocio, textosBeneficios } from "../utils/membresias";
import { svgQr } from "../utils/qr";
import { formatFechaLarga } from "../utils/formatDate";
import useTituloPagina from "../hooks/useTituloPagina";
import { Badge, Card } from "../components/ui";

// /membresias (P3-16): las membresías del jugador en todos los clubes, con el carnet digital (QR → /s/:token) para
// mostrar en el club (estacionamiento, exhibiciones, descuentos en el bar).
const TONO = { pendiente: "warning", activa: "success", vencida: "danger", cancelada: "neutral", rechazada: "neutral" };

export default function MisMembresias() {
  useTituloPagina("Mis membresías");
  const user = useAuthStore((s) => s.user);
  const [lista, setLista] = useState(null);

  useEffect(() => {
    if (!user?.uid) return undefined;
    let vivo = true;
    getMisMembresias(user.uid).then((l) => vivo && setLista(l));
    return () => {
      vivo = false;
    };
  }, [user?.uid]);

  const ordenadas = useMemo(() => {
    const peso = { activa: 0, pendiente: 1, vencida: 2, rechazada: 3, cancelada: 4 };
    return (lista || []).map((s) => ({ ...s, est: estadoSocio(s) })).sort((a, b) => (peso[a.est.estado] ?? 9) - (peso[b.est.estado] ?? 9));
  }, [lista]);

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-4">
      <header>
        <h1 className="heading-xl m-0">Mis membresías</h1>
        <p className="body-sm text-ink-2 mt-1 mb-0">Tus carnets de socio. Mostrá el QR en el club para tus beneficios.</p>
      </header>
      {lista === null ? (
        <div className="pd-skeleton h-40 rounded-lg" aria-busy="true" aria-label="Cargando" />
      ) : ordenadas.length === 0 ? (
        <Card>
          <Card.Title as="h2">Todavía no sos socio de ningún club</Card.Title>
          <Card.Meta className="mt-1!">Si tu club tiene planes de socio, los ves en su página, en la pestaña Socios.</Card.Meta>
          <div className="mt-3">
            <Link to="/canchas" className="underline font-semibold">
              Ver clubes
            </Link>
          </div>
        </Card>
      ) : (
        ordenadas.map((s) => <Carnet key={`${s.clubId}-${s.id}`} socio={s} />)
      )}
    </div>
  );
}

function Carnet({ socio }) {
  const { est } = socio;
  const link = socio.token ? `${window.location.origin}/s/${socio.token}` : "";
  const qr = useMemo(() => (link && est.activa ? svgQr(link, { titulo: "QR de socio" }) : ""), [link, est.activa]);
  const beneficios = textosBeneficios(socio.beneficios);
  return (
    <Card>
      <Card.Row>
        <span className="flex items-center gap-2">
          <IdCard className="pd-icon text-ink-3" size={20} aria-hidden="true" />
          <Link to={`/club/${socio.clubId}`} className="heading-md hover:underline">
            {socio.clubNombre || "Club"}
          </Link>
        </span>
        <Badge tone={TONO[est.estado] || "neutral"} dot>
          {ESTADOS_SOCIO[est.estado] || est.estado}
        </Badge>
      </Card.Row>
      <Card.Meta className="mt-1!">
        {[socio.planNombre, socio.numero ? `Socio Nº ${socio.numero}` : null, est.vence ? `${est.activa ? "Vence" : "Venció"} el ${formatFechaLarga(est.vence)}` : null].filter(Boolean).join(" · ")}
      </Card.Meta>
      {est.estado === "pendiente" && <p className="body-sm text-ink-2 mt-2 mb-0">El club tiene que aprobar tu pedido y cobrarte la cuota. Te avisamos cuando estés activo.</p>}
      {est.porVencer && <p className="body-sm text-warning mt-2 mb-0">Vence en {est.diasRestantes} {est.diasRestantes === 1 ? "día" : "días"}: renovala en el club.</p>}
      {est.activa && (
        <div className="mt-3 flex flex-col sm:flex-row gap-4 items-start">
          {qr ? (
            <div className="w-40 shrink-0 rounded-lg bg-white p-2 self-center" role="img" aria-label={`QR de socio de ${socio.clubNombre || "tu club"}`} dangerouslySetInnerHTML={{ __html: qr }} />
          ) : (
            <p className="body-sm text-ink-3 m-0">Tu QR se está generando…</p>
          )}
          {beneficios.length > 0 && (
            <div>
              <p className="pd-eyebrow m-0">Tus beneficios</p>
              <ul className="body-sm mt-1 mb-0 pl-5">
                {beneficios.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
