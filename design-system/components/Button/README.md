# Button

One lime button per view, for the thing the screen is for; everything else is quiet. Sentence case, verb first, voseo: "Reservar turno", "Anotarme", "Cargar resultado".

- **Primary** (`pd-btn-primary`): `lime` fill with `on-lime` text. The booking confirm, the inscription submit, the "Generar grupos" of a tab. Never two on one screen; never for cancel/back.
- **Secondary** (`pd-btn`, the default): `surface-raised` with a `line-strong` border. Navigation, "Ver detalle", the safe choice in a dialog.
- **Ghost** (`pd-btn-ghost`): no border; the third action, toolbar icons, "Cancelar" next to a primary.
- **Danger** (`pd-btn-danger`): `danger` fill, only for destructive confirmations (rechazar, eliminar, cancelar reserva) and only inside a confirm dialog or a row the user already expanded.
- Sizes: 44px default (the touch target); `pd-btn-sm` 36px inside cards, table rows and the slot grid toolbar. `pd-btn-icon` makes a square; give it an `aria-label`.
- States: hover is one step (`surface-hover` / `lime-hover`); pressed moves 1px down; disabled is 50% opacity and keeps its width; loading keeps the label and swaps the verb ("Guardando…"), never a spinner alone.
- Focus: the `focus` ring, 2px with a 2px offset, on every variant. Keyboard users work the club panel all day.
- Icons sit left of the label at 20px, `space-2` apart; never an icon on the right except a chevron for menus.
