# Avatar, spinner, status

Three small things every screen needs.

- **Avatar** (`pd-avatar`, `-sm` 24px, `-lg` 80px): initials in the display face on `surface-sunken`, or the photo. Initials come from the first letters of first name and surname; never a generic person icon where a name exists.
- **Spinner** (`pd-spinner`, inside `pd-loading` with the word "Cargando…"): only for a whole view that has nothing to show yet; inside a card or list use skeletons (`pd-skeleton`), and on a button swap the verb ("Guardando…"). Stops under reduced motion.
- **Status line** (`pd-status`, `pd-status-error`): the word after a save ("Guardado", "No se guardó"), with its icon, next to the control. It is not a toast and does not animate.
