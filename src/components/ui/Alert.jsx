import { AlertTriangle, Check, Clock, Info } from "lucide-react";

// Mensaje en línea que pertenece a la página (pd-alert): un consejo, algo pendiente, un problema que bloquea.
// tone: "neutral" (default) | "warning" | "danger" | "success" | "court" · icon: elemento Lucide (uno por tono por defecto)
// Nunca para validación (eso es pd-error bajo el campo) ni más de dos por pantalla.
const ICONO = {
  neutral: Info,
  warning: Clock,
  danger: AlertTriangle,
  success: Check,
  court: Info,
};

export default function Alert({ tone = "neutral", icon, className = "", children, ...rest }) {
  const Icono = ICONO[tone] || Info;
  const clases = ["pd-alert", tone !== "neutral" && `pd-alert-${tone}`, className].filter(Boolean).join(" ");
  return (
    <div className={clases} role={tone === "danger" ? "alert" : undefined} {...rest}>
      {icon === null ? null : icon || <Icono className="pd-icon" size={20} aria-hidden="true" />}
      <div>{children}</div>
    </div>
  );
}
