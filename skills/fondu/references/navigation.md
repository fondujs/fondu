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

Back and Forward show the page as it was left at once, then put the server's fresh page in its place. Those pages are
in memory only, and forgotten once a form is sent.

## A dialog opened by the URL

A link to a `#fragment` of the current page is the browser's: a history entry, Back goes to the one before. Read it with
`useSyncExternalStore` on `hashchange`:

```tsx
import { useSyncExternalStore } from 'react'

const subscribe = (notify: () => void) => {
  addEventListener('hashchange', notify)
  return () => removeEventListener('hashchange', notify)
}

export function Settings() {
  const hash = useSyncExternalStore(subscribe, () => location.hash, () => '') // '' on the server
  if (!hash.startsWith('#settings/')) return null
  return <dialog open>…{hash.slice('#settings/'.length)}…</dialog>
}
```

A form in the dialog that answers at the same page keeps the `#fragment`, so the dialog stays open with its errors.

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
