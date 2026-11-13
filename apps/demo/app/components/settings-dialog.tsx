import { closeShallow, fetch, FetchError, href, navigate, useForm, usePage } from 'fondu/client'
import { useEffect, useState, useSyncExternalStore } from 'react'

import { SubmitButton, TextField } from '#/components/demo.tsx'
import {
  Dialog,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import { cn } from '#/lib/utils.ts'

// A dialog the URL opens, over any page: `#settings/profile`, `#settings/account`, `#settings/usage`: a shallow
// navigation (no request, the page stays as it is). The account menu's link is `data-shallow`, a history entry; the
// tabs switch with `replace`, so one Back (or one close) returns to the page under the dialog; the fragment is read as
// an external store. Closing is closeShallow(): Back, or, when the document was loaded with the fragment (a reload, a
// shared link), the page's URL in its place. Its form posts to /settings/name, and the answer comes back to the same
// page with the fragment still on it.
const PREFIX = '#settings/'
const TABS = { profile: 'Profile', account: 'Account', usage: 'Usage' } as const
type Tab = keyof typeof TABS

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

/** The dialog, for a signed-in user (the account menu opens it) */
export function SettingsDialog() {
  const { props, url } = usePage()
  const { user } = props.auth
  const close = () => closeShallow(url)
  const hash = useHash()
  const name = hash.startsWith(PREFIX) ? hash.slice(PREFIX.length) : ''
  // remembered while it closes: the dialog fades out with its content
  const tab: Tab = name === 'account' || name === 'usage' ? name : 'profile'
  useEffect(() => {
    // nothing to show a guest (signed out with it open)
    if (!user && hash.startsWith(PREFIX)) closeShallow(url)
  }, [user, hash, url])
  if (!user) return null
  return (
    <Dialog open={name in TABS} onOpenChange={(open) => !open && close()}>
      <DialogPopup data-testid="settings">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <nav className="flex gap-1 text-sm" aria-label="Settings">
            {(Object.keys(TABS) as Tab[]).map((id) => (
              <a
                key={id}
                href={PREFIX + id}
                onClick={(event) => {
                  // a plain click switches the tab in place; a click with a modifier is the browser's (a new tab)
                  if (
                    event.button ||
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                  )
                    return
                  event.preventDefault()
                  navigate(PREFIX + id, { shallow: true, replace: true })
                }}
                aria-current={id === tab ? 'page' : undefined}
                data-testid={`settings-tab-${id}`}
                className={cn(
                  'rounded-md px-2.5 py-1 text-muted-foreground hover:bg-accent',
                  id === tab && 'bg-accent font-medium text-foreground',
                )}
              >
                {TABS[id]}
              </a>
            ))}
          </nav>
        </DialogHeader>
        <DialogPanel>
          {tab === 'profile' ? <Profile /> : tab === 'account' ? <AccountFacts /> : <Usage />}
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  )
}

function Profile() {
  const { user } = usePage().props.auth
  const { flash } = usePage()
  const { form, field, errors, submitting } = useForm()
  return (
    <form action={href('/settings/name')} method="post" className="grid gap-4" {...form}>
      <TextField
        label="Display name"
        {...field('name')}
        defaultValue={user?.name}
        error={errors.name}
        testid="settings-err-name"
      />
      <div className="flex items-center gap-3">
        <SubmitButton loading={submitting}>Save name</SubmitButton>
        {flash.message && (
          <p role="status" className="text-sm text-muted-foreground" data-testid="settings-saved">
            {flash.message}
          </p>
        )}
      </div>
    </form>
  )
}

function AccountFacts() {
  const { user } = usePage().props.auth
  return (
    <dl className="grid grid-cols-[6rem_1fr] gap-y-1.5 text-sm">
      <dt className="text-muted-foreground">Email</dt>
      <dd className="truncate" data-testid="settings-email">
        {user?.email}
      </dd>
      <dt className="text-muted-foreground">Member since</dt>
      <dd data-testid="settings-since">
        {user &&
          new Date(user.since).toLocaleDateString('en', { dateStyle: 'long', timeZone: 'UTC' })}
      </dd>
    </dl>
  )
}

// fetch() from fondu/client: a call to a .ts route (app/routes/api/usage.ts), typed by it, as the dialog opens
// this tab (an effect: a page's data would come from its loader). A non-2xx answer is a FetchError.
function Usage() {
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'done'; contacts: number; since: string }
    | { status: 'failed'; code: number | null }
  >({ status: 'loading' })
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/usage', { signal: controller.signal }).then(
      (usage) => setState({ status: 'done', ...usage }),
      (error) => {
        if (!controller.signal.aborted)
          setState({ status: 'failed', code: error instanceof FetchError ? error.status : null })
      },
    )
    return () => controller.abort()
  }, [])
  if (state.status === 'loading')
    return (
      <p className="text-sm text-muted-foreground" data-testid="usage-loading">
        Loading usage…
      </p>
    )
  if (state.status === 'failed')
    return (
      <p role="alert" className="text-sm text-destructive" data-testid="usage-error">
        {state.code ? `Could not load usage (${state.code})` : 'Could not load usage'}
      </p>
    )
  return (
    <dl className="grid grid-cols-[6rem_1fr] gap-y-1.5 text-sm">
      <dt className="text-muted-foreground">Contacts</dt>
      <dd data-testid="usage-contacts">{state.contacts}</dd>
      <dt className="text-muted-foreground">Since</dt>
      <dd data-testid="usage-since">
        {new Date(state.since).toLocaleDateString('en', { dateStyle: 'long', timeZone: 'UTC' })}
      </dd>
    </dl>
  )
}
