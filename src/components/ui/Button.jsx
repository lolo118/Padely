import { Link } from "react-router-dom";

// Botón del design system (pd-btn). Un solo primary por pantalla.
// variant: "primary" | "secondary" (default) | "ghost" | "danger" · size: "md" | "sm"
// icon: elemento Lucide a la izquierda del texto · iconOnly: solo ícono (requiere aria-label)
// block: ancho completo · cargando: texto que reemplaza al label, deshabilita y conserva el ancho
// as: "button" (default) | "link" (react-router Link, con `to`)
export default function Button({
  variant = "secondary",
  size = "md",
  icon = null,
  iconOnly = false,
  block = false,
  cargando = "",
  as = "button",
  className = "",
  type = "button",
  disabled = false,
  children,
  ...rest
}) {
  const clases = [
    "pd-btn",
    variant !== "secondary" && `pd-btn-${variant}`,
    size === "sm" && "pd-btn-sm",
    iconOnly && "pd-btn-icon",
    block && "pd-btn-block",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const contenido = (
    <>
      {icon}
      {!iconOnly &&
        (cargando ? (
          // El label original queda invisible debajo para que el botón no cambie de ancho
          <span className="grid">
            <span className="col-start-1 row-start-1 invisible" aria-hidden="true">
              {children}
            </span>
            <span className="col-start-1 row-start-1">{cargando}</span>
          </span>
        ) : (
          children
        ))}
    </>
  );

  if (as === "link" || as === Link) {
    const inactivo = disabled || !!cargando;
    return (
      <Link className={clases} aria-disabled={inactivo || undefined} tabIndex={inactivo ? -1 : undefined} {...rest}>
        {contenido}
      </Link>
    );
  }
  return (
    <button type={type} className={clases} disabled={disabled || !!cargando} aria-busy={cargando ? "true" : undefined} {...rest}>
      {contenido}
    </button>
  );
}
