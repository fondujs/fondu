import { back, defineHandler, flash, render } from 'fondu'
import { useForm, usePage } from 'fondu/client'
import { useSyncExternalStore } from 'react'

// A dialog the URL's fragment opens (`#settings/account`): links to `#…` are the browser's, each an entry, and a form
// in it is answered at this page, with the fragment still on the screen (e2e/dialog.spec.ts)
type Issue = { message: string; path: PropertyKey[] }
const schema = {
  '~standard': {
    version: 1 as const,
    vendor: 'conformance',
    validate(value: unknown) {
      const name = (value as { name?: unknown } | null)?.name
      const issues: Issue[] = []
      if (typeof name !== 'string' || name.trim().length < 2)
        issues.push({ message: 'Two letters at least', path: ['name'] })
      return issues.length ? { issues } : { value: { name: name as string } }
    },
  },
}

export const actions = {
  name: defineHandler.withValidator({ body: schema })((c) => {
    flash(c, { message: 'Saved' })
    return back(c)
  }),
}

export const loader = defineHandler((c) => render(c, Dialog))

const subscribe = (notify: () => void) => {
  addEventListener('hashchange', notify)
  return () => removeEventListener('hashchange', notify)
}
const useHash = () =>
  useSyncExternalStore(
    subscribe,
    () => location.hash,
    () => '',
  )

export default function Dialog() {
  const hash = useHash()
  const { flash } = usePage()
  // no schema for the browser: the server answers, so its errors are what the dialog shows
  const { form, field, errors } = useForm()
  const tab = hash.startsWith('#settings/') ? hash.slice('#settings/'.length) : null
  return (
    <>
      <title>Dialog</title>
      <h1>Dialog</h1>
      <div style={{ height: 1000 }}>tall</div>
      <a id="open" href="#settings/account">
        Settings
      </a>
      <div style={{ height: 3000 }}>more</div>
      {tab !== null && (
        <dialog open id="settings" style={{ position: 'fixed', top: 20, left: 20, zIndex: 1 }}>
          <nav>
            <a href="#settings/account">Account</a> <a href="#settings/usage">Usage</a>
          </nav>
          <output id="tab">{tab}</output>
          {tab === 'account' && (
            <form method="post" action="?name" {...form}>
              <input {...field('name')} defaultValue="Ada" />
              <button>Save</button>
              {errors.name && <p id="name-error">{errors.name}</p>}
              {(flash as { message?: string }).message && (
                <p id="saved">{(flash as { message?: string }).message}</p>
              )}
            </form>
          )}
        </dialog>
      )}
    </>
  )
}
