import { ChevronDown } from "lucide-react";

// Select nativo del design system: wrapper pd-select con el chevron del sistema. Las categorías NO van acá
// (usar CategorySelect, que lleva las marcas de rango).
export default function Select({ className = "", wrapperClassName = "", children, ...rest }) {
  return (
    <span className={["pd-select", wrapperClassName].filter(Boolean).join(" ")}>
      <select className={["pd-input", className].filter(Boolean).join(" ")} {...rest}>
        {children}
      </select>
      <ChevronDown className="pd-icon" size={20} aria-hidden="true" />
    </span>
  );
}
