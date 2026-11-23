# Navigation

Docs: [navigation](https://fondu.dev/docs/navigation.md).

The first request gets HTML. After that the client takes the app's links and forms: it asks the server for the next
page as JSON and swaps it in place. Layouts stay mounted. There is no router to set up and no link component.

## Links

```tsx
import { href } from 'fondu/client'

export function UserLink({ user }: { user: { id: number; name: string } }) {
  return <a href={href('/users/:id', { id: user.id })}>{user.name}</a>
}
```

- A new page starts at the top, or at its `#fragment`. A query and a fragment: `href('/search', { query: { q }, hash:
  'results' })`.
- A page's code is loaded when the pointer rests on its link (or a touch starts); a static page's data too. Not when
  the browser's data saver is on. Another page's data is asked for at the click.
- `aria-current`: `<a href={to} aria-current={usePage().url === to ? 'page' : undefined}>`.
- The client takes a click only on a link to one of the app's pages. The browser handles: a `#fragment` of the current
  page, files (`/report.pdf`), `.ts` routes (`/api/health`), URLs no route answers, other sites, links with `target`,
  `download`, or Ctrl, Cmd, Shift or Alt.
- A link without its own `target` takes the document's `<base target>`: if that is not `_self`, the browser handles
  the click. SVG `<a>` and `<area>` are always the browser's.
- A form with no `target` (and a submitter with no `formtarget`) takes `<base target>` too: not `_self`, the browser
  submits it.
- A GET form to a `.ts` route is the browser's, as a link to one is.
- `<a target="_top">` loads a page as a whole document (a page of another `<html lang>`, scripts that must run
  again). In code: `loadDocument(url)`. A catch-all page covers files below it: link to them with `download` or
  `target="_top"`.

## In code

```tsx
import { href, navigate } from 'fondu/client'

navigate(href('/orders', { query: { page: 2 } }))
navigate(url, { replace: true }) // no new history entry: Back skips it
navigate(url, { keep: true }) // as reload(): keeps state (a focused input) and scroll; the loader still runs
navigate(url, { transition: true }) // with a view transition (see below)
```

Search as you type: put the value in the URL, answer in the loader, and navigate with `{ replace: true, keep: true }`
after a debounce. A navigation in flight is aborted by the next. Back, reload and shared links all work, unlike
`request()` from an effect.

`navigate()` and `loadDocument()` throw an `Error` for a `javascript:` URL. Other schemes (`mailto:`) and other sites
are handed to the browser.

| Export                                             | Does                                                                                    |
| -------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `navigate(href, { replace?, keep?, transition? })` | goes to `href` as a link would                                                          |
| `navigate(href, { shallow: true })`                | changes this page's URL to a page URL of this app, asks for nothing, never a transition |
| `closeShallow(to)`                                 | closes what a shallow navigation opened, one step                                       |
| `loadDocument(url)`                                | loads `url` as a document                                                               |
| `reload()`                                         | asks for the page's props again; state and scroll stay                                  |

## Forms

A `<form method="post">` is sent by the client too. An answer at the same page (`back(c)`, or errors) updates the page
where it is: scroll and what was typed stay. Another page is a new history entry. See [forms.md](forms.md).

## Scroll

| After                                                                 | The page is                   |
| --------------------------------------------------------------------- | ----------------------------- |
| a link, or `navigate()`                                               | at the top, or at `#fragment` |
| Back or Forward, a reload                                             | where it was left             |
| a form's answer at the same URL, `reload()`, `navigate()` with `keep` | where it is                   |
| a shallow navigation, Back or Forward between the entries it shares   | where it is                   |

Scroll positions are kept for the last 50 history entries (in `sessionStorage`, so a reload restores them); a shallow
`replace` is the same entry.

Back and Forward show the page as it was left at once, then put the server's fresh page in its place. Those pages are
in memory only, and forgotten once a form is sent.

## Shallow navigation

State in the URL without loading another page (a dialog, a drawer, a selected item, a tab): the page on the screen takes
any page URL of this app, including another pathname. Nothing is asked for; the component, props, state and scroll stay.

```tsx
import { closeShallow, navigate, usePage } from 'fondu/client'

navigate('?item=7', { shallow: true }) // a new history entry
navigate('?item=8', { shallow: true, replace: true }) // this entry's URL changes
// <a href="?item=7" data-shallow>: a plain click on it is the same; without JavaScript a plain link
const { url } = usePage() // follows the address bar (path and query); props are the loader's, for the URL that loaded
closeShallow(url) // closes one level
```

- The URL must be a page of this app, using the same route check as links. Another origin or a URL that is not a page
  throws, naming the URL. `shallow` with `keep` is a type error and throws. Before the app has started: a document load.
  While a visit is being put on the screen (its URL is in the address bar, its page is not shown): an ordinary navigation.
- `data-shallow` links are not prefetched. A modified click, `target`, `download`, another origin or a URL that is not a
  page is an ordinary browser link.
- `closeShallow(to)`: if the current entry was pushed by a shallow navigation, Back (one step); else `to` replaces the
  entry in place (a direct load, a reload, a replaced entry). Never leaves the page. A second call before the first's
  Back lands does nothing. A native `#fragment` entry is not a shallow one.
- Switching items inside an open dialog or drawer: `replace: true`, so one close or one Back returns to the page under
  it. Overlays nest, one level per close.
- Render what the URL asks for in the loader too: a document load at `?item=7` has no click. Read the query from
  `usePage().url`, not from the props.
- A shallow navigation drops the page's `flash` and `errors`. A `#fragment` change dispatches `hashchange` (read it with
  `useSyncExternalStore`), but the page does not scroll to it and `:target` does not follow.
- Entries that show the same page (the one that loaded it, the shallow ones, the browser's `#fragment` ones) share it:
  Back and Forward between them change `url` only, with no request. A form's answer for the same component at the
  same pathname keeps the group, even if its query or fragment differs: the entries share the answer's props, and
  closing asks for nothing more. Flash is not shown again. Another component or a redirect to another pathname starts
  a new group. Other answers on a shallow entry (`reload()` asked at that URL) end
  the sharing: Back to the other entries asks, as any Back does. Leaving for another page also ends the sharing: Back
  or Forward into a former shallow entry loads its URL's own page. `reload()` at another page's URL shows that page.
- A prerendered page's `usePage().url` has the visitor's query once it has hydrated, and after a link, Back or `reload()`
  too (and its `#fragment` is in the address bar); its loader never saw the query. A redirect is the server's answer.
- A form in a dialog that answers at the same page keeps the `#fragment`, so the dialog stays open with its errors.

A gallery can open an item's own URL without an application router or history handling:

```tsx
const { url } = usePage()
const path = new URL(url, 'http://localhost').pathname
const photo = photos.find((photo) => href('/photos/:id', { id: photo.id }) === path)
// <a href={href('/photos/:id', { id })} data-shallow> opens the dialog without a request.
// Render <PhotoDialog photo={photo} onClose={() => closeShallow(href('/photos'))} /> when photo exists.
// routes/photos/[id].tsx serves the standalone photo on a reload, shared link or new tab.
```

```tsx
import { useSyncExternalStore } from 'react'

const subscribe = (notify: () => void) => {
  addEventListener('hashchange', notify)
  return () => removeEventListener('hashchange', notify)
}
const useHash = () => useSyncExternalStore(subscribe, () => location.hash, () => '') // '' on the server
```

## View transitions

Each navigation opts in to the browser's `document.startViewTransition()`; Fondu's commit and scroll restore are the
`update`. The animation is CSS; there is nothing to add to a page.

```html
<a href="/photos/7" data-transition>Photo 7</a>
<a href="/photos/7" data-transition="zoom fade">Photo 7</a> <!-- adds the types zoom and fade -->
<form action="/search" data-transition>…</form>
```

```ts
navigate('/photos/7', { transition: true })
navigate('/photos/7', { transition: ['zoom'] })
```

In JSX, `<a data-transition>` is written as `data-transition="true"`: the same as the bare attribute.

- Default for navigations that show another page (a link, a form, `navigate()`, Back and Forward):
  `fondu({ target, viewTransitions: true })`. A link or call opts out with `data-transition="false"` or
  `transition: false`. A page that stays does not transition: `navigate()` with `keep`, `reload()`, a form's answer at
  its own URL; `navigate(url, { keep: true, transition: true })` opts in. The option sets the default only: the code is
  in the client either way, and a link opts in without it.
- Types, for `:root:active-view-transition-type(zoom)`: the direction (`navigation-forward` for a new entry and
  Forward, `navigation-back`, `navigation-replace`), then the navigation's own. Untyped where the browser has no
  `:active-view-transition-type()`.
- Back and Forward remember: an entry reached by a transition keeps its types in `history.state`, and Back from it,
  Forward to it, run it again with the direction (`navigation-back zoom`). Of the two entries a traversal goes between
  (also across several), the later one's record counts. Back from a page reached without a transition does not animate;
  with `viewTransitions: true` it does, with the direction alone.
- Never a transition for `reload()`, shallow navigations (`data-shallow`, `shallow: true`), a form's answer at its
  own URL, or a swipe back the browser animates itself; `keep` only with `transition`. Without `document.startViewTransition`
  navigations are as they were.
- React's `<ViewTransition>` does not animate Fondu's navigations (it works for the app's own `startTransition`
  updates), and its `name` is not applied for them. Shared elements: `view-transition-name` in CSS, one element per
  page. One view transition runs per document: a navigation and an app's own transition cut each other short, and
  duplicate names skip it.
- The old page stays under the new URL until the commit; a newer navigation in that time wins. Reduced motion is the
  app's CSS: animations in `@media (prefers-reduced-motion: no-preference)`.

```css
@media (prefers-reduced-motion: no-preference) {
  .photo {
    view-transition-name: photo; /* the same element in the list and on its page */
  }
  :root:active-view-transition-type(navigation-forward)::view-transition-new(root) {
    animation: slide-in-right 250ms ease-out;
  }
  :root:active-view-transition-type(navigation-back)::view-transition-new(root) {
    animation: slide-in-left 250ms ease-out;
  }
  @keyframes slide-in-right {
    from {
      transform: translateX(2rem);
      opacity: 0;
    }
  }
  @keyframes slide-in-left {
    from {
      transform: translateX(-2rem);
      opacity: 0;
    }
  }
}
```

## Pending state

```tsx
import { useNavigation } from 'fondu/client'

const { state, to, form } = useNavigation()
const pending = state === 'loading' || state === 'submitting'
```

| Field   | Is                                                                                                          |
| ------- | ----------------------------------------------------------------------------------------------------------- |
| `state` | `'idle'`, `'submitting'` (a form's POST), `'loading'` (a link, `navigate()`…), `'failed'` (a POST not sent) |
| `to`    | where to (path, query, fragment), or `null` when idle                                                       |
| `form`  | the form being sent (a GET form's too), or `null`                                                           |

- `failed` lasts until the next navigation starts. Don't read "not `idle`" as "pending".
- A navigation over 350 ms shows a thin progress bar. In `vite.config.ts`: `fondu({ target, progress: { color, delay,
  forms } })`, or `progress: false` for your own indicator.
- Screen readers announce the new page's title. After a deploy, a tab opened before it loads the next page as a
  document.
- Protocol: `X-Fondu-Location` (status 409) = load this URL as a document; `X-Fondu-Redirect` = follow this path in
  place, as a navigation.
