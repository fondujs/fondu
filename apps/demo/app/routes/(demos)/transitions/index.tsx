import { defineHandler, render } from 'fondu'

import { Gallery } from '#/components/gallery.tsx'

export const loader = defineHandler((c) => render(c, Index, {}))

// Two examples: card-to-page View Transitions (/transitions/:id), and card-to-dialog (/transitions/dialog/:id).
// Their local layout renders the gallery explicitly; no root-layout interception or cached React page tree.
// A plain dialog-card click remembers only its browser history entry and the gallery's scroll position.
// Back/Forward restores that entry even after another demo; a new ordinary visit to the same URL is a page.
// An app-owned history field stores only source/scroll metadata and a document session id: reloads/new tabs are
// standalone pages. No Fondu history fields are read, and without JavaScript both cards are ordinary links.
// The dialog's local CSS yields to native swipe navigation and reduced motion. Both transitions reuse the
// thumbnail until the large image decodes; page snapshots explicitly handle the 4:3 → 3:2 ratio change.
export default function Index() {
  return <Gallery />
}
