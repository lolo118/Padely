# MatchCard

One match of a bracket or a group fixture: the round and cuadro as the eyebrow, court and time on the right, two rows of pairs with their set scores, and a foot line for the state. The round decides the dress: plain for groups and early rounds, the heat band for a semifinal, black and gold for the final.

- Sides are coloured by the result: the winner's set chips are `success-soft`/`success`, the loser's `danger-soft`/`danger` (`is-winner` / `is-loser` on the rows); the winner's name is `ink` at 600 with the `lime` ball. Before a result both rows are plain `ink-2` on `surface-sunken` chips; a pending match (`pd-match-pending`) shows placeholders in italic `ink-3`.
- **Semifinal** (`pd-match-semi`): a 3px heat band (`heat-red` → `heat-orange` → `heat-pink`) across the top, a `line-strong` frame and the round name in the display face in `heat-orange`.
- **Final** (`pd-match-final`, with `data-theme="dark"`): `black` ground with the double gold frame of the champion card, the trophy and "Final" in `gold`, the winner in `gold-light` with a gold ball. The final is the preview of the ChampionCard it produces.
- Scores are set chips, one per set, read left to right. A result by time or walkover adds a word in the foot ("Por tiempo 6–5", "W.O.").
- `radius-md`, 360px max (`pd-match-wide` lifts the cap inside a grid of its own); bracket columns lay these out with `space-4` between rounds and connectors in `line-strong`. When the card opens the result form it is `role="button"` with `tabindex="0"` and reacts to Enter and Space.
- Tapping a card opens the result form for the organizer and the detail for everyone else; the card itself holds no buttons.
