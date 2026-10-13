# Dialog

A decision the person must make before going on: cancel a reservation, reject a pair, generate groups again (which discards results). On phones it rises as a bottom sheet; from 640px it centers. The backdrop is the `overlay` token with a 6px blur.

- The title is the question, with the object in it: "¿Cancelar la reserva?", "¿Generar los grupos de nuevo?". Never "¿Estás seguro?".
- The body states the consequence in one or two lines, with the concrete data (court, date, amount).
- Two buttons, right-aligned on desktop and full-width on phones: the safe exit on the left as a secondary button ("Volver"), the action on the right. The action is `pd-btn-danger` when it destroys something, `pd-btn-primary` otherwise ("Confirmar reserva"). Its label repeats the verb; never "Sí" / "No" / "OK".
- Escape and a tap on the backdrop close it as "Volver". Focus moves to the dialog on open and back to the trigger on close.
- Forms do not live in dialogs except a single field (a reason for rejection); anything longer is a page.
