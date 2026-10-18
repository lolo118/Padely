# Badge

One or two words of status or classification beside a name: a reservation's state, a tournament's phase, a player's category.

- Each tone is a `*-soft` ground with its text colour, so it passes 4.5:1 in both themes: `success` (confirmada, finalizado con resultado), `warning` (pendiente, por vencer), `danger` (cancelada, rechazada), `court` (informational: inscripción abierta, cuadro), `lime` (live and good: en curso, clasifica), neutral (`surface-sunken`: categories, finalizado), `night` (turno fijo).
- The dot (`pd-badge-dot`) goes only on states that change over time (confirmada / pendiente / cancelada), so the three can be told apart without colour.
- Always a word; never a coloured dot alone. Sentence case, no icons inside.
- A badge is not a button: nothing happens on click. If it must filter, it is a Pill. The one exception is a **checklist of short items** (the courts a tournament uses, category chips): `button.pd-badge` with `aria-pressed`, pressed = `lime-soft`/`lime-text`, 24px tall, focus ring. Long labels use `pd-badge-wrap`; a set of badges sits in `pd-badge-group`.
