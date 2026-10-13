# StatTile

One number with its name: ranking points, category, occupancy, señas cobradas. The value is `numeral-lg` in the display face with tabular numerals; the label is `caption` in `ink-3` below it, never above.

- A delta line (`pd-stat-delta`) is optional and always carries its sign and its period ("+89 este mes"); down is `danger`, up is `success`, and both keep the word so colour is not the only cue.
- Money is formatted es-AR: "$ 184.000", no decimals. Percentages have no space before the sign.
- Tiles sit in a row of two on phones and four on desktop, `space-4` apart, same height. Four tiles at most per screen; more is a table.
