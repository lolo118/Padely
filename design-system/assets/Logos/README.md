# Logos

The wordmark is "PADELY" in a heavy grotesque with the ball — a lime (`lime`, #84cc16) disc — set at the top right of the Y, and the slogan "VIVÍ EL PADEL" beneath in a light grey. Three files, taken from the app's `public/` folder as they are.

- `logo.png` — wordmark in white with the ball and the slogan, for night grounds (`night`, the Noche `surface`, the app bar, the PWA splash). 1279×418, transparent background. Never on a light ground: the wordmark disappears.
- `logo-dark.png` — the same wordmark in navy (`ink` by day) for light grounds: the club panel sidebar, emails, print. 1279×418, transparent.
- `icon-192.png` — the app icon: a white P with the ball on `night`, 192×192. Use the PWA manifest's own sizes for anything else; do not scale this one up.

Rules

- Minimum width 120px for the wordmark files on screen; below that, use the live-text wordmark of the AppBar (`pd-wordmark`) with the `pd-ball`.
- Clear space around the mark: the ball's diameter on every side.
- Do not recolour, outline, add a shadow, or put the wordmark on `lime` or `court`.
- In the UI the live-text wordmark (Barlow Condensed 800, uppercase, +0.02em, ball at the top right) is preferred over the PNG; the PNGs are for places that cannot load the fonts.
