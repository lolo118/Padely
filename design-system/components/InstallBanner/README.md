# InstallBanner

The PWA install prompt, docked above the bottom nav on phones: the app icon tile (`night` with the P and the ball), one line of benefit and the actions. Two modes: Android/desktop with an "Instalar" primary button, and iOS with the share-sheet instruction and only a dismiss.

- Appears after the second visit or the first completed reservation, never on the landing page or during a form.
- "Ahora no" hides it for 14 days (the `padely-install-dismissed` key); after installing it never returns.
- Copy is voseo and concrete: "Reservá en dos toques desde tu pantalla de inicio". The iOS line shows the real share glyph inline.
- `surface-raised`, `radius-lg`, `shadow-overlay`: it floats, but stays below toasts and dialogs.
