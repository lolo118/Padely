# BottomNav

The player's four destinations on phones: Inicio, Reservar, Torneos, Perfil. Fixed to the bottom, `surface-raised` on a `line` hairline, 64px plus the safe area.

- Four items, never five; a fifth feature goes inside Perfil or Inicio.
- The current item is `lime-text` with a slightly heavier icon stroke, marked with `aria-current="page"`; the rest are `ink-3`. Labels are one word in `caption` weight 600.
- Icons are 24px Lucide outlines (see the brand book), `currentColor`.
- Hidden while a bottom sheet or dialog is open, and on desktop widths (≥ 768px), where the same links move to the AppBar.
- A badge count (unread notifications, a pending result) is a `lime` ball at the icon's top-right corner, no number.
