import { NavLink } from "react-router-dom";
import { Wordmark } from "./AppBar";
import Badge from "./Badge";

// Navegación de los paneles de club y organizador en escritorio (pd-sidebar): wordmark con el badge de rol
// arriba, ítems con ícono Lucide (aria-current="page" en el activo) y el pie (pd-sidebar-foot) con children.
// items: [{ to, label, icon: ComponenteLucide, end?, count? }] · rol: "Club" | "Organizador"
// onNavigate: se llama al tocar un ítem (para cerrar el drawer en móvil)
export default function Sidebar({ rol, items = [], onNavigate, wordmarkTo = "/", className = "", children, ...rest }) {
  return (
    <aside className={["pd-sidebar", className].filter(Boolean).join(" ")} {...rest}>
      <div className="pd-sidebar-brand">
        <Wordmark to={wordmarkTo} />
        {rol && <Badge>{rol}</Badge>}
      </div>
      {items.map(({ to, label, icon: Icono, end, count }) => (
        <NavLink key={to} to={to} end={end} className="pd-sidebar-item" onClick={onNavigate}>
          {Icono && <Icono className="pd-icon" size={20} aria-hidden="true" />}
          {label}
          {count ? <Badge tone="warning">{count}</Badge> : null}
        </NavLink>
      ))}
      {children && <div className="pd-sidebar-foot">{children}</div>}
    </aside>
  );
}
