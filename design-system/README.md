# Padely — design system

Padely is the padel app for Argentina: players book courts and play tournaments; clubs and organizers run them. One product, two lights. The player side is **Noche**: a floodlit court at night, deep navy ground, and the ball — a lime disc — as the one bright thing on it. The club and organizer panels are **Día**: paper-light, dense, built for a desk and a long shift. Both run on the same tokens; nothing in this system is "the dark version" of something else.

Themes in `tokens.json`: `light` = Día (clubs, organizers, the default for panels) and `dark` = Noche (players and public pages by default). The app switches with `data-theme="light|dark"` on `<html>`.

## Principles

1. **La pelota es lo único que brilla.** Lime (`lime`) is spent on one thing per screen: the primary button, the chosen slot, the ball that marks a qualifier. Never two lime buttons on one screen; never lime as decoration. Two more lights exist and are rationed harder: the **heat** frame for a tournament that is open or in play, and **gold** for champions and the final — never on booking or panel surfaces.
2. **Números grandes, palabras cortas.** Padel is scores, times and prices. Numerals and titles are set in Barlow Condensed at 700–800 — scoreboard type — and carry the screen; labels are short and in voseo.
3. **Un sistema, dos luces.** Every component is designed in Día and Noche at once. A night-only surface (app bar, toast, champion card) carries `data-theme="dark"` in its markup so its tokens resolve to Noche values on any page.
4. **Bordes, no sombras.** Surfaces separate with the `line` hairline. `shadow-card` is nearly nothing; `shadow-overlay` exists only for things that float. At night, elevation is one lighter surface step, not a shadow.
5. **Rioplatense y directo.** Voseo, verbs first, no filler. The app tells people what happens next, with the real data (court, time, amount).

## Content fundamentals

### Voice

- Second person singular **vos**, always: "Reservá tu cancha", "Anotate al torneo", "Cargá el resultado", "Revisá la conexión y volvé a intentar". Never "usted", never the Spain "tú/vosotros", never "haz clic".
- Verb first in anything clickable: "Reservar turno", "Generar grupos", "Ver cuadros". Nouns for destinations: "Reservas", "Torneos", "Turnos fijos".
- Plain and specific. Not "Operación exitosa" but "Reserva confirmada · Cancha 2, mié 15 oct a las 20:00".
- One exclamation mark in the whole product: the champion card ("¡Campeones!"). Nowhere else, no emoji in the UI.
- Sentence case everywhere: buttons, tabs, titles, labels ("Pendiente de seña", not "Pendiente De Seña"). Uppercase belongs to the `label` type style only (table headers, eyebrows, bottom-nav labels).
- Questions as dialog titles name the object: "¿Cancelar la reserva?", "¿Generar los grupos de nuevo?". Never "¿Estás seguro?".

### Vocabulary

| say | not |
| --- | --- |
| cancha, turno | pista, slot |
| seña | depósito, anticipo |
| torneo, cuadro, categoría (4ta…8va), zona o grupo, llave → "cuadro" | bracket, draw, división |
| pareja ("Gómez / Pérez") | equipo, dupla |
| turno fijo | abono, reserva recurrente |
| ranking, puntos | score, rating |
| club, organizador, jugador | usuario, admin |
| inscripción abierta · en curso · finalizado | activo, cerrado, done |

### Formats

- Times 24 h, "19:30"; durations "90 min"; a turno "19:30 – 21:00" with spaced en dashes.
- Dates short "mié 15 oct", long "15 de octubre de 2026"; relative only for today and tomorrow ("Hoy 20:00").
- Money es-AR: "$ 15.000" (space after the sign, dot thousands, no decimals). Señas the same, with the word: "seña $ 5.000".
- Scores: one chip per set, "6 4 7" over "3 6 5"; in text "6–4 · 6–3" with middle dots; a time-limited set "6–5 por tiempo"; walkover "W.O.".
- Pairs "Apellido / Apellido"; a player alone by first name and surname. Positions "1°", categories "7ma", "6ta", "4ta".
- Counts after the noun, lighter: "Reclamos 2", "Sin cuadro 3"; never "(3)".

### Empty states, errors, loading

- An empty list says what to do next, with the action: "Todavía no hay turnos. Creá el primero." — "Ningún torneo abierto por ahora. Mirá el ranking mientras tanto."
- Validation sits under the field (`pd-error`) and says what to change: "La seña no puede superar el precio del turno."
- Failures are toasts with a next step; no error codes, no "algo salió mal".
- Loading keeps the layout: skeleton blocks (`surface-sunken`) in the shape of the content; buttons keep their width and swap the verb ("Guardando…").

## Visual foundations

### Colour

Semantic tokens, two themes, the first theme (`light`, Día) is the fallback. Every token's `usage` in `tokens.json` names the grounds it is legible on.

- **Grounds**: `surface` (page), `surface-raised` (cards, bars, inputs), `surface-sunken` (table headers, the court grid, skeletons), `surface-hover`. By day they step down from white; by night they step up from navy, which is how elevation works at night.
- **Lines**: `line` for every hairline; `line-strong` for input and quiet-button borders (3:1 on `surface-raised`).
- **Ink**: `ink`, `ink-2`, `ink-3`; `ink-3` is the floor for text and never goes below 13px.
- **Lime**, the ball (`#84cc16`, taken from the logo): `lime` is a **fill** — primary buttons, the selected slot, the ball dot, the champion mark — with `on-lime` text, never white on lime. By day lime is never text (2:1 on white): lime as an ink is `lime-text` (olive by day, bright lime by night) on `surface` or `lime-soft`. At night `lime` itself may be an ink (9:1 on `surface`), which is why night surfaces get the lime eyebrow.
- **Court blue** (`court`, `court-soft`, `on-court`): the second colour, from the court itself. Information and confirmed states: reserved slots, "Inscripción abierta", links in running text, the focus halo on inputs. Never for actions.
- **Night** (`night`, `on-night`, `on-night-muted`): the brand navy, equal to the Noche `surface`, for a single night element inside a Día page (app bar, install tile, "Turno fijo" badge). A night **block that holds other components** (toast, champion card, night card) uses `data-theme="dark"` instead, so everything inside resolves to Noche tokens.
- **Status**: `success`, `warning`, `danger`, each with a `*-soft` ground, each paired with a word. Success and danger differ in lightness, not only hue; blue (court) carries "information" so green is free to mean "good".
- **Heat** (`heat-red`, `heat-orange`, `heat-pink`, `heat-purple`): the tournament's energy. One use: the frame of the tournament card (a conic gradient through the four stops, turning once every 8 s) and the 3px band of a semifinal. Fills only; `heat-orange` may be an eyebrow on `night`. Never on reservations, the club panel or body text, and never as a button.
- **Gold** (`gold-light`, `gold`, `gold-deep`) on **`black`**: champions. The champion card and the final match card only: double gold frame, gold eyebrow and trophy, names filled with the gold gradient, the ball turned to gold. Gold is never a button, never on a Día surface, never next to lime.
- **Focus**: `focus`, a solid 2px ring with a 2px offset, on every control, both themes. `overlay` for backdrops (the one place blur is allowed, 6px). `slot-blocked` for the stripe of a blocked court.

Contrast: all text pairs named in the usage notes are ≥ 4.5:1 in both themes; `ink-3` on `surface` by day is the tightest (4.5:1), so it stays at 13px or larger and weight 500+.

### Type

Two Google-hosted families, no files: **Barlow Condensed** (`display`) for anything that must read first — page titles, card titles, numerals, scores, prices, the wordmark — and **Figtree** (`sans`) for everything else. Barlow Condensed is the scoreboard and jersey face: tall, heavy, efficient, so a long tournament name fits a card and a score reads from across the room; Figtree is friendly and even at 13–15px. Display styles are never tracked tighter than 0 and never go below 20px; italics (available) are for one word of emphasis in a hero, never in the UI.

| style | family | size / line | weight | where |
| --- | --- | --- | --- | --- |
| `display-xl` | display | 44 / 48 | 800 | landing hero, public tournament name on desktop |
| `display-lg` | display | 36 / 40 | 800 | page titles on phones, champion names |
| `heading-lg` | display | 26 / 32 | 700 | panel and section titles |
| `heading-md` | display | 22 / 28 | 700 | card and dialog titles |
| `numeral-lg` | display | 32 / 36 | 800 | stat tiles, prices in the booking sheet |
| `numeral-md` | display | 22 / 26 | 700 | scores |
| `heading-sm` | sans | 17 / 22 | 600 | group names, list card titles |
| `body-md` | sans | 15 / 22 | 400 | running text, inputs, dialogs |
| `body-sm` | sans | 13 / 18 | 400 | meta lines, help, table cells; **form labels at 600** |
| `label` | sans | 12 / 16 | 600, +0.04em, uppercase | table headers, eyebrows, bottom-nav labels |
| `button` | sans | 14 / 20 | 600 | buttons, pills, tabs |
| `caption` | sans | 12 / 16 | 500 | badges, timestamps, stat labels |

Numerals are tabular (`font-variant-numeric: tabular-nums`) wherever they line up: grids, tables, scores, prices. The wordmark is the display face at 800, uppercase, +0.02em.

Load the faces with one link: `https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Figtree:wght@400;500;600;700&display=swap`.

### Spacing, radius, elevation

- A 4px base: `space-1` 4 … `space-12` 48. Touch targets 44px; page gutter `space-4` on phones and `space-6` on desktop; `space-4` between cards; `space-5` inside a card; `space-6` inside a dialog; `space-8` between sections on desktop.
- Radii: `radius-sm` 8 (slot cells, inputs, score chips), `radius-md` 12 (buttons, toasts, match cards, sidebar items), `radius-lg` 16 (cards, stat tiles), `radius-xl` 24 (dialogs, sheets, the champion card), `radius-pill` for pills and badges. Soft, never round.
- Elevation by day: a `line` border and `shadow-card`; by night: the next surface step and a `line` border. `shadow-overlay` only on dialogs, toasts and the install banner.
- Motion: 150 ms ease-out for hover and press, 200 ms for sheets and toasts, none under `prefers-reduced-motion`. Nothing bounces.

### Iconography

[Lucide](https://lucide.dev) outlines (ISC licence): 24px grid, 2px stroke, round caps and joins, `currentColor`. 20px inside buttons and inputs, 24px in the bottom nav and sidebar. One icon per concept across the product: calendar = reservas, repeat = turno fijo, trophy = torneos, users = staff, sliders = canchas y tarifas, lock = bloqueada, clock = sin horario, share (arrow out of a tray) = the iOS install hint.

The brand has one pictogram of its own: **the ball**, a filled `lime` disc (`pd-ball`). It is the dot of the wordmark, the marker of a qualifying row, the winner mark in a match card and, large, the corner of the tournament hero; on the champion card it turns to gold. It is never a bullet, never a loading spinner, and never appears twice in one component.

The ball also tells a player's level. The **rank ladder** (`assets/Ranks/`, nine 24px SVGs) is the same ball, faster at every step: 8va still in its wrapper (dashed), 7ma the ball, 6ta one speed line, 5ta two, 4ta three, 3era the comet tail, 2da the bolt, 1era the star, Libre the golden ball in its ring. A category is shown with its mark wherever it appears — CategorySelect, the ranking, the profile, next to names in a draw — and the mark never goes without the level's name.

### Layout

- **Players (phones first)**: the night AppBar, content in one column with `space-4` gutters, the BottomNav. From 768px the bottom nav folds into the app bar and content centers at 640px; the public tournament page grows to 960px for brackets.
- **Clubs and organizers (desk first)**: the Sidebar (248px) and a content column up to 1200px with `space-6` gutters; tables and the court grid scroll inside their card, with the first column and the header sticky. Below 1024px the sidebar becomes a top bar with a menu button. Light by default; Noche remains available.
- The public tournament page is the one place both audiences meet: night hero (name, club, dates, the cuadro pills), then light-or-dark content following the viewer's theme.

## Components

The reference implementation is `components/bundle.css` (`pd-*` classes, plain CSS on the tokens); each component folder has a live preview and its guidelines. The consumer provides the markup, the data and the icons; the stylesheet provides every colour, size and state.

| group | components |
| --- | --- |
| Actions | Button |
| Forms | Input, CategorySelect |
| Surfaces | Card (reservation, night, tournament, danger and link variants), Avatar (+ spinner, status line) |
| Navigation | AppBar, BottomNav, Sidebar, Pill, Tabs |
| Status | Badge |
| Feedback | Toast, Dialog, Alert |
| Booking | SlotCell |
| Tournaments | Standings, MatchCard, ChampionCard |
| Data | StatTile |
| Growth | InstallBanner |

Patterns the components share (all in `bundle.css`): `pd-count` for a count after a heading; `pd-alert` tones for inline messages; `pd-dl` for the label/value pairs of a detail page; `pd-steps` for a process (Badges with `aria-current="step"` and `is-done`); `pd-check` for native checkboxes (accent `ink`); `pd-drawer` + `pd-topbar` for the panel on phones; `pd-grid-scroll` for a sticky slot grid; `pd-toast-stack` for toasts. Layers: `pd-backdrop` 50, `pd-drawer` 60, `pd-toast-stack` 100.

States, everywhere: hover is one surface step; pressed moves 1px; disabled is 50% opacity at full width; selected is inverted ink (pills) or lime (slots); focus is the `focus` ring; error is a `danger` border plus a line of text; loading is a skeleton or a verb in progress.

## Porting the app

The app (React 19 + Vite, Tailwind utilities plus CSS custom properties in `src/index.css`, theme by `data-theme` on `<html>`) adopts this system in three moves, in this order:

1. **Tokens.** Replace the `:root`/`[data-theme]` blocks of `src/index.css` with the compiled `tokens.css` of this system, then add the Google Fonts link and set `body { font-family: var(--font-sans) }`. Old names map to new ones; keep the old names as aliases for one release, then delete them.

| old variable | new token |
| --- | --- |
| `--bg-primary` | `--surface` |
| `--bg-card` | `--surface-raised` |
| `--bg-card-hover` | `--surface-hover` |
| `--bg-input` | `--surface-raised` |
| `--border-card` | `--line` |
| `--border-input` | `--line-strong` |
| `--text-primary` | `--ink` |
| `--text-secondary` | `--ink-2` |
| `--text-muted` | `--ink-3` |
| `--sidebar-bg` | `--surface-raised` |
| `--sidebar-active-bg`, `--accent-light` | `--lime-soft` |
| `--sidebar-active-text` | `--lime-text` |
| `--accent` (as a fill) | `--lime` with `--on-lime` text |
| `--accent` (as text or a border) | `--lime-text` |
| focus ring `rgba(5,150,105,.2)` | `--focus` ring, 2px + 2px offset |

**Tailwind cascade.** `components.css` is plain, unlayered CSS, so a Tailwind utility on a property a `pd-*` class already sets loses unless it is marked important (`py-1!`). The cleaner fix is to import the stylesheet into the components layer — `@import "./styles/components.css" layer(components);` — after which utilities win by default; the existing `!` marks keep working either way. Do this in a dedicated clean-up commit, not mixed with a feature.

2. **Shared components.** `.themed-card` → `pd-card`; `.themed-input` → `pd-input` with `pd-field`/`pd-label`; buttons → `pd-btn` variants (the emerald primary becomes lime with dark text); `ConfirmDialog` → `pd-dialog`; `Toast` → `pd-toast` with `data-theme="dark"`; the sidebar and the mobile nav → `pd-sidebar` / `pd-bottomnav`; `InstallBanner` → `pd-install`. Either import `bundle.css` as is or translate each rule into Tailwind `@apply` — the tokens are the contract, the class names are not.
3. **Screens, by audience.** Player and public pages first (home, booking grid, tournament detail, profile), Noche by default; then the club panel (today, reservas, turnos fijos, canchas), Día by default; then the organizer panel (tournament tabs: parejas, grupos, cuadro, reclamos). Each screen keeps its behaviour and only changes what it is made of.

Animation budget: the heat frame of the tournament card is the only continuous animation in the product; everything else moves once, on interaction.

What this baseline does not decide yet: the landing page (a marketing surface, designed later on these tokens), empty-state and onboarding illustrations (none for now: type and the ball only), and the Mercado Pago payment screens (phase 3).
