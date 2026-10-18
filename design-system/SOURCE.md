# Source of truth

This folder is an export of the Padely Design System (a Claude design-system artifact, owned by Sebastian): https://claude.ai/artifact/Pfb52KRapDFdPvKdAjwh3C

Exported 2026-10-18 from version 9 ("Port patterns"; v8 added Alert and Avatar, v9 the patterns the app port needed — drawer, toast stack, avatar, spinner, alert tones, badge toggles, sticky grid, steps). Edit the system there (or ask Cowork to); then re-export this folder. `tokens.css` is compiled from `tokens.json`.

- `README.md` — the brand book: principles, voice, formats, colour, type, spacing, iconography, layout, and "Porting the app".
- `tokens.json` / `tokens.css` — the tokens (light = Día, dark = Noche) and the type-style classes.
- `components/bundle.css` — the reference stylesheet (`pd-*` classes); `components/bundle.js` — the (empty) runtime the artifact's previews expect; `components/<Comp>/preview.html` + `README.md` — each component's live example and guidelines.
- `assets/Ranks/*.svg` — the rank ladder marks; `assets/Logos/README.md` — rules for the logos already in `public/`.
