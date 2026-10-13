// Tarjeta del design system (pd-card) y sus partes.
// variant: "default" | "hover" (toda la tarjeta es un link) | "night" (bloque oscuro quieto) | "torneo"
// (el único que grita: marco heat girando). night y torneo llevan data-theme="dark".
export default function Card({ variant = "default", hover = false, as = "article", className = "", children, ...rest }) {
  const Tag = as;
  const clases = [
    "pd-card",
    (variant === "hover" || hover) && "pd-card-hover",
    variant === "night" && "pd-card-night",
    variant === "torneo" && "pd-card-torneo",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const tema = variant === "night" || variant === "torneo" ? { "data-theme": "dark" } : {};
  return (
    <Tag className={clases} {...tema} {...rest}>
      {children}
    </Tag>
  );
}

function Eyebrow({ className = "", ...rest }) {
  return <p className={["pd-eyebrow", className].filter(Boolean).join(" ")} {...rest} />;
}
function Title({ as = "h3", className = "", ...rest }) {
  const Tag = as;
  return <Tag className={["pd-card-title", className].filter(Boolean).join(" ")} {...rest} />;
}
function Meta({ className = "", ...rest }) {
  return <p className={["pd-card-meta", className].filter(Boolean).join(" ")} {...rest} />;
}
function Row({ className = "", ...rest }) {
  return <div className={["pd-card-row", className].filter(Boolean).join(" ")} {...rest} />;
}
function Foot({ className = "", ...rest }) {
  return <div className={["pd-card-foot", className].filter(Boolean).join(" ")} {...rest} />;
}

Card.Eyebrow = Eyebrow;
Card.Title = Title;
Card.Meta = Meta;
Card.Row = Row;
Card.Foot = Foot;
