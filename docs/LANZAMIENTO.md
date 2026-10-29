# Checklist de lanzamiento

Lo que falta para cobrarle al primer club real. Marcá cada punto cuando esté hecho.

## 1. Backend al día (padely-dev)

- [ ] Correr `.phase3-logs\17-p3-15-deploy.cmd` (acumulado: reglas + índices + Storage + 56 functions). Reemplaza 15 y 16.
- [ ] **Enseguida**: Super-admin → Planes → **Migrar privacidad**. Hasta que corra, los tickets numerados viejos no se
      leen públicamente (los QR impresos antes de P3-14 dejan de abrir: aceptado).
- [ ] Revisar el log `.phase3-logs\17-p3-15-deploy.log` y la consola de Functions (sin errores en la primera hora).
- [ ] Pasar las verificaciones C-P3-12 … C-P3-15 de `PADELY_PROMPTS_PHASE3.md`.

## 2. Producción separada

- [ ] Crear `padely-prod` y su sitio de Netlify (ver `docs/STAGING.md`).
- [ ] Credenciales **productivas** de Mercado Pago (app de Padely): OAuth redirect + webhook de prod, secretos cargados.
- [ ] Un pago real chico de punta a punta (seña de un turno) con un club propio, y su devolución.
- [ ] Backup semanal programado (Cloud Scheduler) y un export manual probado con `scripts\backup-firestore.cmd`.
- [ ] Alertas de presupuesto en Google Cloud (Blaze): por ejemplo aviso a USD 10 / 25 / 50.

## 3. Cobro a clubes (manual)

- [ ] Datos de cobro cargados (Planes → Datos de pago: alias/CBU, comisión FREE 2,5 %, comisión de torneos).
- [ ] Precios PRO confirmados: 1–4 canchas $35.000 · 5–8 $50.000 · 9+ $65.000 por mes; anual = 10 meses.
- [ ] Prueba de 1 mes desde la primera reserva confirmada: revisar el texto de Mi plan y del onboarding (Empezar).
- [ ] Facturación: alta como monotributista (o la figura que te recomiende tu contador) antes de cobrar el primer plan.

## 4. Legales y contacto

- [ ] Términos y condiciones y política de privacidad publicados (datos de jugadores, teléfonos, pagos con MP).
- [ ] `VITE_EMAIL_CONTACTO` y `VITE_WHATSAPP_CONTACTO` reales en Netlify.
- [ ] Página `/estado` con un aviso de prueba y sacarlo (Super-admin → Estado).

## 5. Funciones ocultas (flags)

Se prenden en Super-admin → Planes → Flags, cuando el backend está deployado y probado:

- [ ] `inscripcionesOnline`: inscripciones de torneos con pago por Mercado Pago (el organizador conecta su cuenta).
- [ ] `partidosAbiertos`: "Me faltan N jugadores" en Mis reservas, lista en el Hub y en la página del club.

## 6. Monitoreo

- [ ] `VITE_SENTRY_DSN` cargado en prod y un error de prueba visto en Sentry.
- [ ] Revisar una vez por semana: Functions con error, pagos MP sin aplicar (`pagosMp` en estado pendiente), clubes en
      gracia (Super-admin → Planes).

## 7. Primeros clubes

- [ ] Club piloto con tus datos (canchas, tarifas, horarios) y una semana de uso real.
- [ ] Guía corta para el dueño (cómo cargar canchas, cobrar seña, abrir caja) y un WhatsApp de soporte.
- [ ] Recién después, invitar a los siguientes 3–5 clubes.

## 8. Lessons from deploys
- If a deploy gets cut off (Ctrl+C, a closed window), run it again until it says "Fin". Then check the **callables** created in that run: a 403 to an anonymous POST means they have no public invoker. Fix it in Cloud Run → service → Security → "Allow public access" (it happened with cerrarPartido/quitarDePartido on 28/10).
- Flags turned on so far: `partidosAbiertos` (28/10). Pending: `inscripcionesOnline`, `membresias` (after deploy 18 and C-P3-16).
