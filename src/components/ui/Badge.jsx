// Estado o clasificación en una o dos palabras (pd-badge). Siempre con texto; nunca un botón.
// tone: "neutral" (default) | "success" | "warning" | "danger" | "court" | "lime" | "night" | "heat"
// dot: el punto que distingue los estados que cambian con el tiempo (confirmada / pendiente / cancelada)
export default function Badge({ tone = "neutral", dot = false, className = "", children, ...rest }) {
  const clases = ["pd-badge", tone !== "neutral" && `pd-badge-${tone}`, dot && "pd-badge-dot", className]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={clases} {...rest}>
      {children}
    </span>
  );
}
