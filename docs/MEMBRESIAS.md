# Pase Club: the membership of each club (P3-16)

Design agreed with Sebastián on 29/10. It replaces the first version (multiple plans, family Pase, paying at the club).

## The idea
A **loyal community** with **recurring subscription income** for the club:
- **One Pase per club: "Pase Club <Club>".** The club sets the price, how often it's charged, the points and the benefits.
- **Paid only through Mercado Pago, with automatic debit.** The player authorizes once, with any method MP offers; MP charges every period.
- **Points**: only members with an active Pase earn them, at **1 point per $ 1.000** spent at the club:
  - bookings that were played;
  - the bar (when the member is identified with the Pase in Vender);
  - tournaments **organized by the club** (each player gets half).
- **Levels Bronce → Plata → Oro**, set automatically by points. Each club sets the thresholds (defaults: Plata 150, Oro 400 ≈ $ 150.000 / $ 400.000 spent).
- **Benefits per level**: higher levels get more benefits or bigger percentages.
- **Club team**: members sign up for the interclub tournaments (category, position) and the club picks. No ranking.

## Benefits
Padely applies these automatically:
- % off bookings, optionally on certain days and hours only.
- % off the bar (Vender).
- % off the inscription to the club's tournaments, or **free** (e.g. for Oro).
- Booking N days earlier.
- No seña.

The club honours these itself (free text, shown in the Pase and on the QR scan):
- Parking priority during the booking.
- Places at exhibitions and events.
- Free merchandise, or % off merchandise.
- % off the club's coaches.
- Priority on the waiting list.
- A guest pass.
- A birthday perk.
- Early tournament sign-ups.
- Discounts at sponsor stores (text for now; a sponsor model comes after launch).

Bookings **the club enters by hand** don't get the discount.

## Flow
1. Club → Admin → **Pase Club** → Configurar: price, frequency, points for Plata and Oro, benefits per level (with "copiar de Bronce/Plata"), visible → **Lanzar el Pase**.
2. Player → club page → **Pase** tab: price, levels and their benefits → **Quiero el Pase**.
   - They enter the email of their MP account → Mercado Pago (authorize the debit).
3. MP charges → webhook `subscription_authorized_payment` → the Pase becomes **active**, or is extended if it was current.
   - It gets a number and a QR, and starts at Bronce (or at the level its points give, if it comes back within 90 days).
   - Padely's cut is recorded in `comisionesPase/{paymentId}`.
4. Points add up automatically and the level goes up by itself (notification "¡Subiste a Plata!").
5. Mis pases shows the level, the points, "te faltan N para Oro", the QR, the benefits, the team sign-up and **Dar de baja**.
6. Cancellation (the member, the club, or cancelled/paused in MP):
   - The debit is cancelled and the benefits **end right away**.
   - Points are kept **90 days**, then reset to 0 / Bronce.
7. A charge that fails and lets the Pase expire → "vencida" (same as a cancellation) + a notification.

## Data
- `clubs/{c}/planesSocio/pase`: `{ precio, meses, visible, umbrales: { plata, oro }, beneficios: { bronce, plata, oro } }`.
- `clubs/{c}/socios/{uid}`: `{ uid, nombre, clubNombre, estado, desde, vence, puntos, nivel, beneficios (those of the current level), suscripcion { preapprovalId, estado, payerEmail }, equipo { quiere, categoria, posicion, seleccionado }, puntosResetEn, numero, token, historial[] }`.
- `clubs/{c}/socios/{uid}/puntos/{motivo}`: one doc per movement (`reserva_x`, `venta_x`, `insc_x_uid`). The id makes it idempotent.
- `suscripcionesPaseIndice/{preapprovalId}` → `{ clubId, uid }`; `comisionesPase/{paymentId}` (super-admin); `sociosPublicos/{token}` (the QR).
- Functions: `mpSuscribirPase`, `mpCancelarPase`, `onSocioEscrito`, `onPaseEscrito`, `onVentaPuntosPase`, `sociosVencidos` (04:40: expired passes, points for yesterday's bookings, reset after 90 days). The webhook handles `subscription_*`.
- Logic and tests: `src/utils/membresias.js`.

## Padely's cut
MP's documentation only shows the marketplace fee on one-off payments (preferences/payments), not on subscriptions. So the money goes 100 % to the club, and Padely's % (Super-admin → Planes → "Comisión sobre el Pase Club") is **recorded on every charge** and **billed by hand** together with the plan.

## Setup for the go-live
- In Padely's app in MP Developers → Webhooks: tick **"Planes y suscripciones"** (subscription_preapproval, subscription_authorized_payment) with the same URL as payments.
- The payer has to use the email of their MP account (in test mode, the buyer test user's email).

## Later
- Sponsors (a model of their own).
- Discount on the **cuenta del turno** (today: Vender).
- Members-only slots and events with limited places.
- Pase reports (income, retention, members by level).
