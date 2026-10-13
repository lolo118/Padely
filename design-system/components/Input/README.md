# Input

Text fields, selects and textareas share one box: 44px tall, `surface-raised` ground, `line-strong` border, `radius-sm`. The form label is `body-sm` at weight 600 in `ink-2`, sentence case, above the field; the uppercase `label` style is for table headers and eyebrows, not forms.

- Placeholder is an example, never the label ("Buscar jugador por nombre o DNI"), in `ink-3`.
- Help text (`pd-help`) explains consequences in one line. Errors (`pd-error`) say what to change, not what went wrong internally, and set `aria-invalid="true"` on the field so the border turns `danger`.
- Focus: `focus` border plus a 3px `court-soft` halo. Hover darkens the border to `ink-3`.
- Money and times are typed with `inputmode="numeric"`; the form formats on blur ("$ 5.000", "19:30"), never while typing.
- Selects wrap in `pd-select` so the chevron is the system's icon; `pd-input-icon` puts a search or calendar icon inside the field. A category is never a plain select: use CategorySelect, whose options carry the rank marks.
- Disabled fields sit on `surface-sunken` with `ink-3` text; prefer read-only text over a disabled field when a value cannot change (a player's category is set by the points system).
- Group fields in a two-column `row` on desktop only; phones stack everything.
