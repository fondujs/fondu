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
- `<a target="_top">` loads a page as a whole document (a page of another `<html lang>`, scripts that must run
  again). In code: `loadDocument(url)`. A catch-all page covers files below it: link to them with `download` or
  `target="_top"`.

## In code

```tsx
import { href, navigate } from 'fondu/client'

navigate(href('/orders', { query: { page: 2 } }))
navigate(url, { replace: true }) // no new history entry: Back skips it
navigate(url, { keep: true }) // as reload(): keeps state (a focused input) and scroll; the loader still runs
```

Search as you type: put the value in the URL, answer in the loader, and navigate with `{ replace: true, keep: true }`
after a debounce. A navigation in flight is aborted by the next. Back, reload and shared links all work, unlike
`fetch()` from an effect.

| Export                               | Does                                                         |
| ------------------------------------ | ------------------------------------------------------------ |
| `navigate(url, { replace?, keep? })` | goes to `url` as a link would                                |
| `navigate(url, { shallow: true })`   | changes this page's query or `#fragment`, asks for nothing   |
| `closeShallow(to)`                   | closes what a shallow navigation opened, one step            |
| `loadDocument(url)`                  | loads `url` as a document                                    |
| `reload()`                           | asks for the page's props again; state and scroll stay       |
| `reload({ only: ['stats'] })`        | asks for those props alone, quietly (see [data.md](data.md)) |

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

Back and Forward show the page as it was left at once, then put the server's fresh page in its place. Those pages are
in memory only, and forgotten once a form is sent.

## Shallow navigation

State in the URL that is not a page (a dialog, a drawer, a selected item, a tab): the query or `#fragment` of the page on
the screen changes, and nothing is asked for. The loader does not run; props, state and scroll stay.

```tsx
import { closeShallow, navigate, usePage } from 'fondu/client'

navigate('?item=7', { shallow: true }) // a new history entry
navigate('?item=8', { shallow: true, replace: true }) // this entry's URL changes
// <a href="?item=7" data-shallow>: a plain click on it is the same; without JavaScript a plain link
const { url } = usePage() // follows the address bar (path and query); props are the loader's, for the URL that loaded
closeShallow(url) // closes one level
```

- Only this page's own pathname (a trailing slash is another). Another pathname throws. `shallow` with `keep` is a type
  error and throws. Before the app has started: a document load. While a visit is being put on the screen (its URL is in
  the address bar, its page is not shown): an ordinary navigation.
- `data-shallow` to another pathname, a modified click, `target`, `download`: an ordinary link, prefetched as usual.
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
  Back and Forward between them change `url` only, with no request. An answer from the server on a shallow entry
  (`reload()`, `reload({ only })`, a form's answer, deferred props asked at that URL) ends the sharing: Back to the other
  entries asks, as any Back does. Deferred props already on their way arrive in the shared page.
- A prerendered page's `usePage().url` has the address bar's query once it has hydrated; its loader never saw it.
- A form in a dialog that answers at the same page keeps the `#fragment`, so the dialog stays open with its errors.

```tsx
import { useSyncExternalStore } from 'react'

const subscribe = (notify: () => void) => {
  addEventListener('hashchange', notify)
  return () => removeEventListener('hashchange', notify)
}
const useHash = () => useSyncExternalStore(subscribe, () => location.hash, () => '') // '' on the server
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
