import { NavLink } from "react-router-dom";

// Navegación inferior del jugador en teléfonos (pd-bottomnav): cuatro destinos, nunca cinco.
// items: [{ to, label, icon: ComponenteLucide, end? }] · NavLink marca aria-current="page" en el activo.
export default function BottomNav({ items = [], className = "", ...rest }) {
  return (
    <nav className={["pd-bottomnav", className].filter(Boolean).join(" ")} aria-label="Principal" {...rest}>
      {items.map(({ to, label, icon: Icono, end }) => (
        <NavLink key={to} to={to} end={end} className="pd-bottomnav-item">
          {Icono && <Icono className="pd-icon pd-icon-lg" size={24} aria-hidden="true" />}
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
