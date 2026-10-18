# SlotCell

One court at one time, inside the court × time grid that both the player (choosing) and the club (operating) look at. The grid ground is `surface-sunken`; cells are `radius-sm`, 44px minimum, `space-2` apart, with tabular numerals.

- **Libre** (`pd-slot-free`): `lime-soft` with `lime-text`, the price as a second line; it is a button. Hover outlines it in `lime-text`.
- **Elegido** (`aria-selected="true"`): the one `lime` fill on the screen, `on-lime` text. Only one at a time.
- **Reservada** (`pd-slot-booked`): `court-soft` with `court`, the pair's surnames; the club sees names, the player sees "Reservada".
- **Pendiente** (`pd-slot-pending`): `warning-soft`/`warning`, waiting for a seña or the club's approval; expires back to Libre.
- **Turno fijo** (`pd-slot-fixed`): `surface-raised` with a dashed `line-strong` border and the repeat icon.
- **Bloqueada** (`pd-slot-blocked`): a `slot-blocked` stripe over the grid ground; maintenance, closed, private.
- **Pasado** (`pd-slot-past`): the grid ground, `ink-3`, not interactive.
- Every state has a word: colour is never the only cue, and the states differ in lightness, not just hue.
- The club's operations view may add `pd-grid-quiet` to the grid so free cells are plain `surface-raised`: there, bookings are the figure and free is the ground.
- Wrap the grid in `pd-grid-scroll` when it is taller than the viewport or has more courts than fit: the time column sticks to the left and the court header to the top.
