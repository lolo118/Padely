# Sidebar

The club and organizer panels' navigation on desktop: 248px, `surface-raised` with a `line` right rule, the wordmark on top with a role badge ("Club", "Organizador").

- The current item is `lime-soft` ground with `lime-text` text and icon, marked `aria-current="page"`; others are `ink-2` and hover to `surface-hover`. No vertical accent bar.
- Items are a 20px icon plus a short noun: "Hoy", "Reservas", "Turnos fijos", "Torneos", "Staff", "Canchas y tarifas". Work waiting shows as a right-aligned badge count (`warning` for pending approvals).
- "Salir" and the account sit at the bottom (`pd-sidebar-foot`).
- Below 1024px the sidebar becomes a **drawer**: a `pd-topbar` (wordmark, role badge, bell and theme buttons, a menu button) and the same `pd-sidebar` inside `pd-drawer` over a `pd-backdrop`; it never becomes a bottom nav (panels are desk work).
- The panel is light by default (the Día theme); the Sidebar still works in Noche for staff who prefer it.
