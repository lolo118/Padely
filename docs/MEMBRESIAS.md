# Pases: membresías de cada club (P3-16)

> Name chosen by Sebastián (29/10): the player sees **"Pase"** (Pase tab, Mis pases, Pase Nº, Pase al día). The panel says **Pases**. Internally, collections and code keep `socios` / `planesSocio`.

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

## Flow (v1)
1. **Club** → Admin → **Pases** → Planes → "Nuevo plan": price, period (1/3/6/12 months), **individual or family (up to 6 people, no extra charge)**, benefits, cap, visible.
2. **Player** → club page → **Pase** tab:
   - **"Pagar con Mercado Pago"** → once the payment is approved the Pase becomes **active automatically** (no club approval). The money goes to the club's MP account.
   - or "Prefiero pagar en el club" → request → Admin → Pases → **Aprobar y cobrar**.
3. **Renewal**: "Renovar con Mercado Pago" in Mis pases (or "Registrar pago" at the club). If the Pase is still current, the period is added from the expiry date.
4. **Family Pase**: the holder adds people **with a Padely account, by email** (and removes them) from Mis pases. Each member gets the same benefits and their own QR, and copies the holder's status and dates. Only the holder pays and renews.
5. **Club grants a Pase**: "Dar un Pase" asks for the email of a Padely account (**everyone with a Pase has an account**; the club doesn't add people without one).
6. **Expiry**: daily at 04:40, plus a notice 5 days before (holders only; members follow the holder).
7. **QR**: /s/<token> → "Pase al día · Nº · plan · (grupo de X) · vence · beneficios".
8. **Bookings the club enters by hand** don't get the Pase discount (it only applies when the player books from Padely).

## Data
- `clubs/{c}/planesSocio/{planId}`: `{ nombre, descripcion, precio, periodo, visible, cupo, orden, beneficios }`.
- `clubs/{c}/socios/{uid}`: `{ uid, nombre, clubNombre, planId, planNombre, periodo, integrantes, beneficios (snapshot), estado, desde, vence, numero, token, historial[], avisoVencimiento }`.
  - The holder also stores `familia: [{ uid, nombre }]`.
  - A family member stores `titularId` and `titularNombre`.
- Callables: `agregarIntegrante`, `quitarIntegrante`, `altaPasePorEmail`. Payments go through `mpCrearPago` (`tipo: "membresia"`) and the webhook.
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
- Auto-renewal (MP subscriptions).
- Pase discount on the **cuenta del turno** (today: Vender only).
- Slots reserved for Pase holders, and Pase-only events with limited places.
- Reports: active Pases, income, churn.
