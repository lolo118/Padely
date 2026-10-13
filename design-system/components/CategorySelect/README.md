# CategorySelect

A listbox for choosing a category, where every option carries its rank mark: the padel ball, faster at every level. Players meet it on their profile and on inscriptions; organizers on tournament setup; the public pages reuse the marks next to names and in the ranking.

- The ladder, bottom to top: **8va** a ball still in its wrapper (dashed) · **7ma** the ball · **6ta** one speed line · **5ta** two · **4ta** three · **3era** the comet tail · **2da** the bolt · **1era** the star · **Libre** the golden ball with its ring. The marks are in `assets/Ranks/` (SVG, 24px) and are drawn in `lime` so they read on both themes; only Libre is gold.
- Each option: the mark, the level in the display face, a short descriptor in `ink-3` ("Intermedia", "Alto rendimiento"). The selected option is `lime-soft`/`lime-text`. Tournament categories add a "Por suma de la pareja" group whose options carry the two-balls-plus mark.
- The closed button looks like an Input (44px, `line-strong`, the same focus halo) and shows the selected mark, level and descriptor. It opens a floating `pd-catselect-list` (static in this preview) with `role="listbox"`; arrow keys move, Enter selects, Escape closes, typing "6" jumps.
- A player's own category is read-only (the points system moves it): show the mark and level with `pd-rank-lg`, no dropdown. Never show a category as text alone where the mark fits.
- Descriptors are copy, not rules: rename them in the app's constants, keep them under 18 characters.
