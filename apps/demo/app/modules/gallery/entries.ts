import { useLayoutEffect, useSyncExternalStore, type MouseEvent } from 'react'

type Origin = { url: string; x: number; y: number; photo?: string }
type Entry = { session: string; id: string; origin: Origin }
type Snapshot = { origin?: Origin; nativeTransition: boolean }
const marker = 'demo.gallery'
const session = typeof window === 'undefined' ? '' : crypto.randomUUID()
const empty: Snapshot = { nativeTransition: false }
const listeners = new Set<() => void>()
let snapshot = empty
let snapshotId: string | undefined
let nativeId: string | undefined
let pending: { from: string; entry: Entry } | undefined
let listening = false

// The browser owns entry storage and disposal. Only our own field is read; all other history state is opaque.
// A new document has a new session, so reloads/new tabs render the standalone page, including without JavaScript.
const address = () => location.pathname + location.search
function current(): Entry | undefined {
  const value = (history.state as Record<string, unknown> | null)?.[marker] as Entry | undefined
  return value?.session === session ? value : undefined
}
function write(entry?: Entry) {
  const state = { ...history.state }
  if (entry) state[marker] = entry
  else delete state[marker]
  history.replaceState(state, '')
}
function forgetChangedAddress() {
  const entry = current()
  if (entry && entry.origin.url !== address()) write()
}
function getSnapshot(): Snapshot {
  const active = current()
  const entry =
    active?.origin.url === address()
      ? active
      : pending?.entry.origin.url === address() && active?.id !== pending.from
        ? pending.entry
        : undefined
  const nativeTransition = !!entry && entry.id === nativeId
  if (snapshotId !== entry?.id || snapshot.nativeTransition !== nativeTransition) {
    snapshotId = entry?.id
    snapshot = { origin: entry?.origin, nativeTransition }
  }
  return snapshot
}
function notify() {
  for (const listener of listeners) listener()
}
function popped(event: PopStateEvent) {
  pending = undefined
  forgetChangedAddress()
  nativeId = (event as { hasUAVisualTransition?: boolean }).hasUAVisualTransition
    ? current()?.id
    : undefined
  notify()
}
function subscribe(listener: () => void) {
  // Installed only after visiting this demo. Outside it this records a native-traversal flag, not UI or routes.
  if (!listening) {
    addEventListener('popstate', popped, true)
    listening = true
  }
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (!listeners.size) {
      pending = undefined
      forgetChangedAddress()
    }
  }
}

export function useGalleryEntry(url: string) {
  const value = useSyncExternalStore(subscribe, getSnapshot, () => empty)
  useLayoutEffect(() => {
    if (url !== address()) return
    // Stamp only the new entry produced by the card's normal navigation, after Fondu has committed its URL.
    if (pending?.entry.origin.url === url) {
      const intent = pending
      pending = undefined
      if (current()?.id !== intent.from) write(intent.entry)
    }
    forgetChangedAddress()
    notify()
  }, [url])
  return value
}

/** Remember only a plain card click; the link and loader still belong to Fondu. Never patch history methods. */
export function rememberDialog(event: MouseEvent<HTMLAnchorElement>, photo: string) {
  const link = event.currentTarget
  const target =
    link.getAttribute('target') ?? document.querySelector('base')?.getAttribute('target')
  if (
    event.defaultPrevented ||
    event.button ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    (target && target !== '_self') ||
    link.hasAttribute('download')
  )
    return
  const to = new URL(link.href)
  if (to.origin !== location.origin) return
  const origin = { url: address(), x: scrollX, y: scrollY }
  const source = { session, id: crypto.randomUUID(), origin }
  write(source)
  pending = {
    from: source.id,
    entry: {
      session,
      id: crypto.randomUUID(),
      origin: { ...origin, url: to.pathname + to.search, photo },
    },
  }
  notify()
}

if (typeof window !== 'undefined' && import.meta.hot)
  import.meta.hot.dispose(() => removeEventListener('popstate', popped, true))
