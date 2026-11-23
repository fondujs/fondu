import { closeShallow, href, navigate, RequestError, request, useForm, usePage } from 'fondu/client'
import { useEffect, useState, useSyncExternalStore } from 'react'

import { SubmitButton, TextField } from '#/components/demo.tsx'
import {
  Dialog,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { cn } from '#/lib/utils.ts'

// A dialog the URL opens over any page (`#settings/profile`, `/account`, `/usage`): a shallow navigation. The tabs
// switch with `replace`, so one Back returns to the page under it. Closing is closeShallow(): Back, or, when the
// document was loaded with the fragment, the page's URL in its place.
const PREFIX = '#settings/'
const TABS = { profile: 'Profile', account: 'Account', usage: 'Usage' } as const
// Match the text's line boxes while loading, with room after the longest label (Member since).
const FACTS =
  'grid auto-rows-[minmax(1.25rem,auto)] grid-cols-[8rem_minmax(0,1fr)] items-center gap-y-1.5 text-sm'
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

export function SettingsDialog() {
  const { props, url } = usePage()
  const { user } = props.auth
  const close = () => closeShallow(url)
  const hash = useHash()
  const name = hash.startsWith(PREFIX) ? hash.slice(PREFIX.length) : ''
  const open = name === 'profile' || name === 'account' || name === 'usage'
  // Remember valid tabs while it closes: removing the hash must not replace the fading content.
  const [tab, setTab] = useState<Tab>('profile')
  if (open && name !== tab) setTab(name)
  useEffect(() => {
    if (!user && hash.startsWith(PREFIX)) closeShallow(url)
  }, [user, hash, url])
  if (!user) return null
  return (
    <Dialog open={open} onOpenChange={(open) => !open && close()}>
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
    <dl className={FACTS}>
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

// Called in an effect as the dialog opens this tab: a page's data would come from its loader.
function Usage() {
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'done'; contacts: number; since: string }
    | { status: 'failed'; code: number | null }
  >({ status: 'loading' })
  useEffect(() => {
    const controller = new AbortController()
    request('/api/usage', { signal: controller.signal }).then(
      (usage) => setState({ status: 'done', ...usage }),
      (error) => {
        if (!controller.signal.aborted)
          setState({ status: 'failed', code: error instanceof RequestError ? error.status : null })
      },
    )
    return () => controller.abort()
  }, [])
  if (state.status === 'failed')
    return (
      <p role="alert" className="text-sm text-destructive" data-testid="usage-error">
        {state.code ? `Could not load usage (${state.code})` : 'Could not load usage'}
      </p>
    )
  const loading = state.status === 'loading'
  return (
    <dl
      className={FACTS}
      data-testid={loading ? 'usage-loading' : undefined}
      aria-busy={loading}
      aria-label={loading ? 'Loading usage' : undefined}
    >
      <dt className="text-muted-foreground">
        {loading ? <Skeleton className="h-4 w-16" aria-hidden="true" /> : 'Contacts'}
      </dt>
      <dd data-testid={loading ? undefined : 'usage-contacts'}>
        {loading ? <Skeleton className="h-4 w-8" aria-hidden="true" /> : state.contacts}
      </dd>
      <dt className="text-muted-foreground">
        {loading ? <Skeleton className="h-4 w-10" aria-hidden="true" /> : 'Since'}
      </dt>
      <dd data-testid={loading ? undefined : 'usage-since'}>
        {loading ? (
          <Skeleton className="h-4 w-32" aria-hidden="true" />
        ) : (
          new Date(state.since).toLocaleDateString('en', { dateStyle: 'long', timeZone: 'UTC' })
        )}
      </dd>
    </dl>
  )
}
