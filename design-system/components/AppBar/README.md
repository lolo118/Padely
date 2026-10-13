# AppBar

The player app's top bar: `night` in both themes, with the wordmark and the ball on the left and at most two ghost icon buttons on the right. The element carries `data-theme="dark"` so its buttons use Noche tokens even on a Día page.

- The wordmark is live text in Barlow Condensed 800, uppercase with +0.02em tracking, with the `lime` ball as a dot at the top right of the Y, as in the logo. It links home.
- 56px tall, `space-4` side padding. No page titles in the bar: the page title is the first heading of the content (`display-lg` on phones).
- Back navigation is a ghost icon button on the left in place of the wordmark, only on detail pages reached from a list.
- Club and organizer panels do not use the app bar; they have the Sidebar.
