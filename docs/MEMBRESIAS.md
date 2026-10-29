# Socios y membresías (P3-16)

## Why
Competitors (Playtomic Manager, Padelista) sell club memberships: a monthly or annual fee in exchange for cheaper courts, a longer booking window and perks. Clubs in the NOA already have "socios" on paper or in WhatsApp lists. Padely makes it digital without forcing every club into the same model.

## The idea: building blocks, not one fixed plan per club
Each club creates **its own plans** (name, price, period, optional cap) and picks benefits from two groups:

| Block | What Padely does |
|---|---|
| Court discount (%) | Applied to the price when the member books from Padely. Optional **time band** (days + from/to, e.g. Mon–Fri 08–17) |
| No seña | Members book with seña $ 0 |
| Book earlier (+N days) | The member's booking window is the club's days + N |
| Bar discount (%) | In Vender, **Socio** button → the % goes on the ticket (the rules add it to the cashier's discount cap) |
| Club extras (free text) | "Estacionamiento para socios", "Lugar reservado en exhibiciones", "Toalla y agua"… Shown on the card and when the QR is scanned. The club honours them in person |

This covers "some clubs offer parking, others exhibition spots, others bar discounts" without special code per club.

## Flow (v1, manual payment)
1. **Club** → Admin → Socios → Planes → "Nuevo plan" (with a live preview of what the player will see).
2. **Player** → club page → **Socios** tab → "Quiero ser socio" → request (estado `pendiente`). The club gets a notification.
3. **Club** → Socios → Pedidos → **Aprobar y cobrar** (plan, amount, payment method) → `activa` from today for the plan's period. Or **Rechazar**.
4. **Renewal**: "Registrar pago". If the membership is still current, the period is added from the expiry date; if expired, from today.
5. **Manual signup**: "Agregar socio" for someone who pays at the counter (with or without a Padely account).
6. **Expiry**: a daily job (04:40 ART) marks overdue memberships `vencida` and notifies; 5 days before, it sends an "expires soon" notice (once per expiry date).
7. **Card**: Mis membresías → QR → `/s/<token>` shows "Socio al día · Nº · plan · vence · beneficios", with a short name only (no phone or email).

## Data
- `clubs/{c}/planesSocio/{planId}`: `{ nombre, descripcion, precio, periodo, visible, cupo, orden, beneficios }`.
- `clubs/{c}/socios/{uid | id}`: `{ uid, nombre, clubNombre, planId, planNombre, periodo, beneficios (snapshot), estado, desde, vence, numero, token, historial[], avisoVencimiento }`.
- `sociosPublicos/{token}`: the QR verification. Written only by Functions.
- `reservas.socio = { id, planId, descuentoPct, descuento, sinSeña }` and `ventas.socio = { id, nombre, numero, pct }`, for traceability.
- Counter: `clubs/{c}/contadoresDispositivos/SOCIOS` (member numbers 1, 2, 3…).
- Logic: `src/utils/membresias.js` (tested), copied to `functions/lib/membresias.mjs`.

## Rules (summary)
- Plans: public read; `configurarClub` + PRO can write.
- Members:
  - Readable by staff with `gestionarReservas` or `vender`, by the member themself and by the super-admin.
  - The player can only request (`pendiente`, visible plan, only those fields), withdraw a pending request, or request again after a cancellation, rejection or expiry.
  - `gestionarReservas` + PRO manages everything except `token`, `numero` and `uid`.
- Bar sales: `descuentoTotal ≤ subtotal × (staff descuentoMax + the active member's descuentoBarPct)`.

## Plan and flag
- PRO only (and the trial). In FREE the "Socios" item shows the padlock.
- Hidden behind `configuracionPadely/flags.membresias` (Super-admin → Planes → Funciones).

## v2 (not built yet)
- Online payment with Mercado Pago (plan preference; webhook activates/renews), auto-renewal (MP subscriptions) and a Padely commission on online payments.
- Family/group plans (one payer, several people).
- Member discount on the **cuenta del turno** (today: Vender only).
- Bookings only for members (time slots reserved for members).
- Members-only events with limited places (exhibitions).
- Reports: active members, income from memberships, churn.
- Linking a manual member to the account they create later (by email).
