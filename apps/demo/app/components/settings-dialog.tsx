import { href, useForm, usePage } from 'fondu/client'
import { useEffect, useSyncExternalStore } from 'react'

import { SubmitButton, TextField } from '#/components/demo.tsx'
import {
  Dialog,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import { cn } from '#/lib/utils.ts'

// A dialog the URL opens, over any page: `#settings/profile`, `#settings/account`. Links to a #fragment are the
// browser's (each an entry of the history, Back closes it, a reload keeps it); the fragment is read as an external
// store. Its form posts to /settings/name, and the answer comes back to the same page with the fragment still on it.
const PREFIX = '#settings/'
const TABS = { profile: 'Profile', account: 'Account' } as const
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

// The entries the links of this document made since the dialog opened (kept outside the component: a page's answer
// can mount it anew). Closing goes back over them, as Back would; a dialog the document was loaded with has none.
let entries = 0
let clicked = false
if (typeof document !== 'undefined') {
  document.addEventListener('click', (event) => {
    const link = (event.target as Element).closest?.('a[href]') as HTMLAnchorElement | null
    if (link?.getAttribute('href')?.startsWith(PREFIX) && link.hash !== location.hash) {
      entries++
      clicked = true
    }
  })
  addEventListener('hashchange', () => {
    if (!location.hash.startsWith(PREFIX)) entries = 0
    else if (!clicked) entries = Math.max(0, entries - 1) // Back
    clicked = false
  })
}

function close() {
  if (entries > 0) {
    history.go(-entries) // opened by a link here: the page as it was before
    entries = 0
    return
  }
  // loaded with the fragment (a reload, a shared link): no entry of ours to go back to, so the URL without it, in
  // place; replaceState fires no event
  history.replaceState(history.state, '', location.pathname + location.search)
  dispatchEvent(new HashChangeEvent('hashchange'))
}

/** The dialog, for a signed-in user (the account menu opens it) */
export function SettingsDialog() {
  const { user } = usePage().props.auth
  const hash = useHash()
  const name = hash.startsWith(PREFIX) ? hash.slice(PREFIX.length) : ''
  // remembered while it closes: the dialog fades out with its content
  const tab: Tab = name === 'account' ? 'account' : 'profile'
  useEffect(() => {
    // nothing to show a guest (signed out with it open)
    if (!user && hash.startsWith(PREFIX)) close()
  }, [user, hash])
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
        <DialogPanel>{tab === 'profile' ? <Profile /> : <AccountFacts />}</DialogPanel>
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
