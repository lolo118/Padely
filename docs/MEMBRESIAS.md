# Pase Club: the membership of each club (P3-16)

Design agreed with Sebastián on 29/10. It replaces the first version (multiple plans, family Pase, paying at the club).
Since P3-16e (03/11) the Pase is charged with an MP **"suscripción con plan"** (`preapproval_plan`), not `POST /preapproval` with `payer_email` (MP answered "User bad request" with test users).

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
   - `onPaseEscrito` creates the club's **`preapproval_plan`** with the club's MP token (reason = "Pase Club <Club>", every `meses` months, `precio` ARS, back_url = `/membresias?club=<clubId>`) and stores it in `pase.mp`. When the price, the months or the club name change, it **PUTs** the plan (MP applies the new amount to the plan's subscriptions).
   - If the club hasn't connected MP yet (or MP fails), nothing is written; `mpSuscribirPase` creates the plan the first time someone subscribes.
2. Player → club page → **Pase** tab: price, levels and their benefits → **Quiero el Pase** → **Ir a Mercado Pago** (no email: they log in to MP in the checkout).
   - `mpSuscribirPase` marks `socios/{uid}` as **pendiente** and returns the plan's `init_point` (with `external_reference=pase_<club>_<uid>` appended, in case MP passes it on).
3. Back in Padely, `/membresias?club=<clubId>` shows **"Estamos confirmando tu suscripción"** while the socio is still pendiente (live listener), and "¡Listo! Tu Pase ya está activo" when the webhook lands.
4. Webhook `subscription_preapproval` → GET `/preapproval/{id}`. If it's new (not in `suscripcionesPaseIndice`), it must belong to a plan of this club (`planesPaseIndice`), and it's linked to a socio in this order:
   1. `external_reference` = `pase_<club>_<uid>` (if MP passes it);
   2. `payer_email` = the email of a Padely account that has a socio doc in this club;
   3. the **most recent "pendiente"** socio of the club without another preapproval.
   - Then `suscripcionesPaseIndice/{preapprovalId}` is written; when the preapproval is `authorized` the Pase becomes **active** right away (first period), flagged `suscripcion.primerCobroPendiente`.
5. MP charges → webhook `subscription_authorized_payment` (links the preapproval too, if it arrives first) → Padely's cut is recorded; the first charge after an authorized preapproval doesn't add another period, every later one extends the Pase.
   - The Pase gets a number and a QR, and starts at Bronce (or at the level its points give, if it comes back within 90 days).
   - Padely's cut is recorded in `comisionesPase/{paymentId}`.
6. Points add up automatically and the level goes up by itself (notification "¡Subiste a Plata!").
7. Mis pases shows the level, the points, "te faltan N para Oro", the QR, the benefits, the team sign-up and **Dar de baja**.
8. Cancellation (the member, the club, or cancelled/paused in MP):
   - The debit is cancelled and the benefits **end right away**.
   - Points are kept **90 days**, then reset to 0 / Bronce.
9. A charge that fails and lets the Pase expire → "vencida" (same as a cancellation) + a notification.

## Data
- `clubs/{c}/planesSocio/pase`: `{ precio, meses, visible, umbrales: { plata, oro }, beneficios: { bronce, plata, oro }, mp: { planId, initPoint, precio, meses, reason, sincronizadoEn } }` (`mp` is written by the Functions).
- `clubs/{c}/socios/{uid}`: `{ uid, nombre, clubNombre, estado, desde, vence, puntos, nivel, beneficios (those of the current level), suscripcion { planId, preapprovalId, estado, payerEmail, vinculadaPor, monto, meses, cobrado, primerCobroPendiente }, equipo { quiere, categoria, posicion, seleccionado }, puntosResetEn, numero, token, historial[] }`.
- `clubs/{c}/socios/{uid}/puntos/{motivo}`: one doc per movement (`reserva_x`, `venta_x`, `insc_x_uid`). The id makes it idempotent.
- `planesPaseIndice/{planId}` → `{ clubId }` (Functions only: which club a plan belongs to, even if `pase.mp` is edited); `suscripcionesPaseIndice/{preapprovalId}` → `{ clubId, uid, via }`; `comisionesPase/{paymentId}` (super-admin); `sociosPublicos/{token}` (the QR).
- Functions: `mpSuscribirPase`, `mpCancelarPase`, `onSocioEscrito`, `onPaseEscrito`, `onVentaPuntosPase`, `sociosVencidos` (04:40: expired passes, points for yesterday's bookings, reset after 90 days). The webhook handles `subscription_*`.
- Logic and tests: `src/utils/membresias.js`; plan body, plan sync and socio matching in `functions/mercadopago.js` (`node --test functions/mercadopago.test.js`).

## Padely's cut
MP's documentation only shows the marketplace fee on one-off payments (preferences/payments), not on subscriptions. So the money goes 100 % to the club, and Padely's % (Super-admin → Planes → "Comisión sobre el Pase Club") is **recorded on every charge** and **billed by hand** together with the plan.

## Setup for the go-live
- In Padely's app in MP Developers → Webhooks: tick **"Planes y suscripciones"** (subscription_preapproval, subscription_authorized_payment) with the same URL as payments.
- No email is asked any more. In test mode the club must be connected with the **seller** test user and the player must pay logged in to MP as the **buyer** test user (MP rejects mixing real and test accounts).
- Socios that were linked with the old email flow keep working (their preapproval is already in `suscripcionesPaseIndice`).

## Later
- Sponsors (a model of their own).
- Discount on the **cuenta del turno** (today: Vender).
- Members-only slots and events with limited places.
- Pase reports (income, retention, members by level).
