# Tabs

Sections of one page that share a header: the tournament detail (Parejas · Grupos · Cuadro · Reclamos · Ajustes), the club panel's reservas vs turnos fijos. Pills filter a list; tabs switch views.

- The selected tab is `ink` with a 2px `lime-text` underline on the `line` rule; the others are `ink-3`.
- Counts (`pd-count`) tell the organizer where work is waiting ("Reclamos 2"); drop the count when it is zero.
- Five tabs at most. On phones the row scrolls; the selected tab scrolls into view.
- Tabs never change the URL's page, only its section; a browser back goes to the previous page, not the previous tab.
