import { Link } from "react-router-dom";

// Barra superior del jugador (pd-appbar): night en los dos temas (data-theme="dark"), el wordmark con la
// pelota a la izquierda y hasta dos o tres botones ghost a la derecha (children).
// left: reemplaza al wordmark (por ejemplo un botón de volver en una página de detalle)
// wordmarkTo: a dónde lleva el wordmark (por defecto "/")
export default function AppBar({ wordmarkTo = "/", left = null, className = "", children, ...rest }) {
  return (
    <header className={["pd-appbar", className].filter(Boolean).join(" ")} data-theme="dark" {...rest}>
      {left || <Wordmark to={wordmarkTo} />}
      <div className="pd-appbar-actions">{children}</div>
    </header>
  );
}

// El wordmark en texto vivo: Barlow Condensed 800, mayúsculas, con la pelota como punto
export function Wordmark({ to = "/", className = "", ...rest }) {
  return (
    <Link to={to} className={["pd-wordmark", className].filter(Boolean).join(" ")} aria-label="Padely, inicio" {...rest}>
      Padely
      <span className="pd-ball" aria-hidden="true" />
    </Link>
  );
}
