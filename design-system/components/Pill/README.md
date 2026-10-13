# Pill

A row of pills is a single-choice filter: the category list on the ranking, the cuadro selector on a tournament, the day picker on the booking screen. One is always selected.

- Selected pills invert: `ink` ground, `surface-raised` text. Nothing lime: pills are navigation, not the action.
- 36px tall, `radius-pill`, `button` type style. A count after the label (`pd-count`) is lighter, never in parentheses.
- Keep labels short: "7ma", "Sin cuadro", "Hoy", "Mañana". Over six pills, the row scrolls horizontally on phones; never wrap it into three lines there.
- Mark the set with `role="tablist"` and each pill with `role="tab"` and `aria-selected`; a multi-select filter uses `aria-pressed` instead and may have several on.
