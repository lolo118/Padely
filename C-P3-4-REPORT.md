# C-P3-4 — live check of P3-4 (2026-10-22 09:58–10:27 ART, Claude in Chrome on padely.netlify.app, deploy of 135c7f1)

Result: **10/10 PASS**, with one bug found outside the checklist (B-P3-4-1, below) and one checklist item that was wrong in the prompt, not in the code. The money and stock stories hold to the peso. Caja 1 closed at the end with diferencia $ 0.

Setup: Caja 1 (ElxwWHufSFcxnao0Iu8f) was still open from C-P3-3. Reservations created today on Cancha 1: A Gómez 10:00–12:00 (2 h, $ 30.000, seña $ 9.000 pendiente), B Pérez 14:00 ($ 15.000, seña $ 4.500 marked cobrada), C López 16:00, D Jugador Test 18:00 (booked by the player, reserva directa), E Jugador Test 20:00.

| # | Check | Result |
| --- | --- | --- |
| 2 | Strip + cargar | PASS — "Turnos en juego" shows Gómez (in window), "Ver todos los de hoy (2)" reveals Pérez; selecting → header "Cargando a la cuenta · Cancha 1 · 10:00–12:00 · Gómez", Descuento "al cerrar", button "Agregar a la cuenta $ 5.100"; cuenta `1YXwofwjIR5w67thm0db_2026-10-22_1000` created lazily (id = grupoId) with totales {consumos 5100, cancha 30000, seña 0, total 35100}; strip badge "$ 35.100 abierta"; zero `cuenta_*` stock movements |
| 3 | Cuentas page + detail | PASS — card (court, time, Gómez, "2 consumos · abierta hace 0 min", $ 35.100); detail page with Cancha block (seña $ 9.000 pendiente), "Cobrar la cancha" untick → total $ 5.100, retick → $ 35.100; × on the cerveza → "Consumo quitado", totals follow; "Agregar" → /admin/bar/vender?cuenta=… with the turno preselected; cerveza re-added |
| 4 | Dividir "Cada uno lo suyo", 4 partes, Agua→Gómez, Cerveza compartida, cancha igual | PASS — live table: Gómez $ 10.320 (2.820 + 7.500), Jugador 2/3/4 $ 8.260 (760 + 7.500), "Suma $ 35.100"; remainder of the cerveza (3.020 → 740 + 760×3) on part 1 as specified; "División guardada" |
| 5 | Cobrar part 1 (efectivo, $ 20.000) | PASS — venta D1-000005, cliente "Gómez", cuentaId set, vuelto 9.680, items `Agua 1.040`, `Cerveza (1/4) 740`, `Cancha 1 · 10:00–12:00 (1/4) 7.500` all `controlaStock: false`; cuenta still abierta, "1/4 partes pagadas"; caja efectivo 4.800 → 15.120; still zero stock movements; no `D1-000005_venta_*` stock movement |
| 6 | Parts 2–4 (tarjeta, qr, efectivo) → close | PASS — D1-000006/7/8; on the last: estado cerrada, `cuentaAplicada: true`, ventas[4]; exactly two stock movements `cuenta_<id>_<lineaId>` (Agua −2, Cerveza −1) aplicado; Agua 117 → 115; both reservation slots (…_1000 and …_1100) `cuentaCerrada: true, cuentaTotal 35100, señaPagada: true`; caja efectivo 23.380, tarjeta 11.260, qr 9.300, ventas 47.404 — every one matches the arithmetic; PostVenta shows "Imprimir cuenta completa"; cuenta ticket "CUENTA CERRADA" grouped by part with "Pagado D1-00000N" |
| 7 | Pérez, seña pagada, "Cobrar todo" | PASS — total 1.760 + 15.000 − 4.500 = 12.260; one venta D1-000009 with lines `Alfajor 1.760`, `Cancha 1 · 14:00–15:00 15.000`, `Seña pagada −4.500`; alfajor stock −1 once; caja efectivo 35.640 |
| 8 | López: item → "Anular cuenta" with motivo | PASS — estado anulada, motivo stored, ventas [], no stock movement |
| 9 | Player | PASS — jugador REST: Gómez's cuenta 403, list 403, own cuenta (D) 200, PATCH own 403; Mis reservas card "Cuenta del turno: $ 18.020 (consumos $ 3.020 · cancha $ 15.000)" + "Ver mi cuenta" → /mi-cuenta/… (Noche) lists the cerveza, cancha, "Seña pendiente", total; after the club closed E ("Cobrar todo"): bell "Cuenta del turno cerrada", card "Cuenta cerrada · $ 16.040" + "Ver ticket", badge "Seña cobrada"; D's anulación also produced "Cuenta del turno anulada" |
| 10 | Hoy line, cajero, fold-ins, close Caja 1 | PASS — Hoy: "1 cuenta abierta · $ 18.020" while D was open, nothing when none; cajero@test.com: Cuentas visible, can cobrar; **"Anular cuenta" IS available to the cajero and works — correct per §2 (cajero has `anularVenta` "con motivo"); the C-P3-4 checklist line "cannot Anular cuenta" was wrong**; fold-ins by code: `vite.config.js` has cleanupOutdatedCaches/clientsClaim/skipWaiting, NoEncontrado checks the SW; Cobrar help line present. Caja 1 closed: esperado $ 56.680 = contado, diferencia $ 0; cierre ticket now lists Ventas/Anulaciones under each medio |

## Bugs found

- **B-P3-4-1 — A reservation whose cuenta was anulada can never get a new cuenta.** The cuenta id is the grupoId; after "Anular cuenta", `agregarItemsACuenta` finds the anulada doc and throws "La cuenta ya está cerrada" (console), the UI shows **no toast** and the ticket just stays. A club that anulates by mistake ("turno equivocado" is literally the placeholder) is stuck for that turno. Fix (fold into P3-5): when the existing cuenta is `anulada`, the add path reopens it in the same transaction — reset items/division/totales/ventas, estado abierta, keep the previous anulación in `historial: [{ anulacion, items }]`; and surface every add failure as a toast. A `cerrada` cuenta must keep refusing.
- **B-P3-4-2 (cosmetic)** — notification messages print the raw date: "Cancha 1 2026-10-22 20:00–21:00 · total…". Use the es-AR short date (jue 22 oct) in `onCuentaUpdated`.

## Observations
- "Ver todos los de hoy (N)" count includes turnos already closed/anulated; fine, but the strip could grey those out.
- The `Agregar` → Vender round trip takes two page loads; a drawer inside the detail would be faster for the bar. Later.
- Rules residual from the P3-4 report stands (a `vender` REST client can edit items of a half-paid cuenta). Backlog.

## Test data created in padely-dev (ask before deleting)
- reservas today on Cancha 1: A 10:00–12:00 Gómez (cuentaCerrada), B 14:00 Pérez (cuentaCerrada), C 16:00 López, D 18:00 Jugador Test, E 20:00 Jugador Test (cuentaCerrada)
- cuentas: …_1000 cerrada (4 ventas), …_1400 cerrada (1), …_1600 anulada, …_1800 anulada (by cajero), …_2000 cerrada (1)
- ventas D1-000005 … D1-000010 (D1-000010 = E's "Cobrar todo", $ 16.040)
- movimientosStock: 2 `cuenta_…_1000_*`, 1 `cuenta_…_1400_*`, 1 `cuenta_…_2000_*`
- Caja 1 (ElxwWHufSFcxnao0Iu8f) now CERRADA, diferencia 0
- Stock now: Agua 114, Alfajor 70, Cerveza 93, Barra de cereal 79
