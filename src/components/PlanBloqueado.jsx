import { Link } from "react-router-dom";
import { Check, Lock, Mail, MessageCircle } from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { ESCALONES_PRO, INCLUYE_PRO, estadoPlan } from "../utils/planes";
import { formatPrecio } from "../utils/format";
import { Button, Card } from "./ui";

const whatsappPadely = () => (import.meta.env.VITE_WHATSAPP_CONTACTO || "").replace(/\D/g, "");
const EMAIL_PADELY = import.meta.env.VITE_EMAIL_CONTACTO || "hola@padely.app";

// Contacto con Padely para pasar a PRO: WhatsApp (si está configurado) y mail
export function ContactoPadely({ clubNombre = "" }) {
  const wa = whatsappPadely();
  const texto = encodeURIComponent(`Hola, quiero pasar ${clubNombre ? `${clubNombre} ` : ""}al plan PRO de Padely.`);
  return (
    <div className="flex flex-wrap gap-2">
      {wa && (
        <a href={`https://wa.me/${wa}?text=${texto}`} target="_blank" rel="noopener noreferrer" className="pd-btn pd-btn-primary">
          <MessageCircle className="pd-icon" size={20} aria-hidden="true" />
          Hablá con Padely
        </a>
      )}
      <a href={`mailto:${EMAIL_PADELY}?subject=${encodeURIComponent("Plan PRO")}&body=${texto}`} className={wa ? "pd-btn" : "pd-btn pd-btn-primary"}>
        <Mail className="pd-icon" size={20} aria-hidden="true" />
        {wa ? "Escribinos" : "Hablá con Padely"}
      </a>
    </div>
  );
}

// Pantalla "Disponible en PRO" para una sección bloqueada en FREE
export function PantallaPro({ titulo = "Esta sección" }) {
  const club = useAuthStore((s) => s.clubActual);
  return (
    <div className="max-w-2xl">
      <Card>
        <div className="flex items-center gap-2">
          <Lock className="pd-icon text-ink-3" size={20} aria-hidden="true" />
          <p className="pd-eyebrow m-0">Disponible en PRO</p>
        </div>
        <h1 className="heading-md mt-2 mb-1">{titulo} es parte del plan PRO</h1>
        <p className="body-sm text-ink-2">Tu club está en el plan FREE: las canchas, las reservas y la seña online siguen andando. Con PRO sumás:</p>
        <ul className="mt-3 flex flex-col gap-2">
          {INCLUYE_PRO.map((item) => (
            <li key={item} className="flex items-start gap-2 body-sm text-ink-2">
              <Check className="pd-icon text-ink-3 shrink-0" size={20} aria-hidden="true" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <p className="body-sm text-ink-2 mt-3">
          Desde {formatPrecio(ESCALONES_PRO[0].precio)} por mes según tus canchas.{" "}
          <Link to="/admin/plan" className="underline font-semibold">
            Ver Mi plan
          </Link>
        </p>
        <div className="mt-4">
          <ContactoPadely clubNombre={club?.nombre} />
        </div>
      </Card>
    </div>
  );
}

// Envuelve una ruta PRO: con el plan activo (o un club de antes, sin plan) muestra la página; en FREE, la pantalla PRO
export function RequierePro({ titulo, children }) {
  const club = useAuthStore((s) => s.clubActual);
  if (!club || estadoPlan(club).pro) return children;
  return <PantallaPro titulo={titulo} />;
}

export function PlanBadgeLink() {
  return (
    <Button as="link" to="/admin/plan" size="sm">
      Ver planes
    </Button>
  );
}
