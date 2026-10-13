# Toast

A short confirmation or failure that appears at the bottom of the screen and leaves on its own (4 s; 8 s with an action). Always night: the element carries `data-theme="dark"` so it is the same dark card in both themes, with a `lime` check or a `danger` triangle.

- Title in one line, in the past tense for success ("Reserva confirmada", "Resultado guardado"); the second line gives the detail the person would otherwise go check.
- Failures use `role="alert"` and tell the person what to do ("Revisá la conexión y volvé a intentar"); never show an error code.
- One optional ghost action ("Ver", "Deshacer"). No close button: it leaves by itself and a tap dismisses it.
- One toast at a time; a new one replaces the previous.
- Never use a toast for validation (that is `pd-error` under the field) or for anything the person must read before continuing (that is a Dialog).
