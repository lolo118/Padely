# Standings

A group's table: position, pair, played, won, sets, points. The wrap (`pd-table-wrap`) is a card with the group name and its cuadro badge in the head.

- Qualifying rows (`pd-qualifies`) get a `lime` ball after the position number and `lime-text` for it; nothing else changes. The ball is the brand's one pictogram and here it means "goes through".
- Numbers are right-aligned and tabular; the points column is `numeral` weight in the display face so it reads first.
- Headers are the uppercase `label` style on `surface-sunken`; rows separate with `line` hairlines, no zebra stripes.
- Pair names are "Apellido / Apellido"; on phones the table keeps #, Pareja and Pts and hides the middle columns behind a tap on the row.
- Tie-breaks are explained in a `pd-help` line under the table ("Desempate: sets, luego games"), not in the headers.
