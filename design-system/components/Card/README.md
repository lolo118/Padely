# Card

The container for one thing with a name: a reservation, a tournament, a group, a court. `surface-raised` on `line`, `radius-lg`, `space-5` padding, the near-invisible `shadow-card`. Borders separate; shadows do not.

- Structure, top to bottom: an eyebrow (`pd-eyebrow`: date, category or type), the title in `heading-md` (`pd-card-title`), one meta line in `ink-2`, then the number or the actions.
- A status badge sits on the eyebrow line, right-aligned, never in the title.
- `pd-card-hover` only when the whole card is a link; then it has no buttons inside.
- The **tournament card** (`pd-card-torneo`, with `data-theme="dark"`) is the one card that shouts: `night` ground, the heat frame (`heat-red` → `heat-orange` → `heat-pink` → `heat-purple`) turning once every 8 s, faint speed stripes, the title in uppercase italic display type, a `pd-badge-heat` for urgency ("Cierra en 5 días", "Últimos 3 cupos") and the pairs count. One per screen, and only for a tournament that is open or in play; a finished tournament goes back to a plain card. The frame stops under `prefers-reduced-motion`.
- A **night card** (`pd-card-night`) is the quiet dark card for a hero block without the tournament energy.
- No left accent borders and no gradients anywhere else: the heat frame is reserved for tournament moments.
- On phones cards are full-width with `space-4` between them; on desktop they sit in a grid of 280–340px columns.
