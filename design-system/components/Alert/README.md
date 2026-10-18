# Alert

An inline message that belongs to the page, not to a moment: a tip under a form, a warning on a detail page, a problem the person must fix. Unlike a Toast it stays until the cause goes away.

- Tones: neutral (`surface-sunken`, a tip or context), `warning` (something pending or expiring), `danger` (a problem that blocks or needs action — say what to do), `success` (a confirmation that should stay visible). The icon is 20px Lucide, the bold lead is the gist, the rest is one sentence.
- Never stack more than two on a screen; never use it for validation (that is `pd-error` under the field).
- A whole Card that is a problem (the tournament's conflicts) uses `pd-card-danger`; an Alert is lighter than that.
