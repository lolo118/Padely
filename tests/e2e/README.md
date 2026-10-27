# Humo e2e (P3-13)

`npm run test:e2e` hace `vite build`, levanta `vite preview` en :4173 y corre Playwright (escritorio y celular) sobre
las páginas públicas: landing (precios), /club/:id, /torneos/:id, /estado, /terminos y un 404. Cada página revisa
que no haya errores en la consola. Solo LEE datos públicos de padely-dev (Club Padely Central y el torneo "Prueba
Sede"; se cambian con E2E_CLUB_ID / E2E_TORNEO_ID). Nunca corre contra padely.netlify.app.

Primera vez: `npx playwright install chromium`.

Pendiente: los flujos con sesión (jugador reserva, club crea cancha, organizador crea torneo, super-admin abre
Planes) necesitan los emuladores de Auth + Firestore con datos sembrados; el de Firestore pide Java (ver
tests/rules/README.md). Con Java instalado se agregan como tests/e2e/roles.spec.js contra el emulador.
