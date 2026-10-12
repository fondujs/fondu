import { useSyncExternalStore, type HTMLAttributes, type ReactNode } from 'react'
import { Link, usePage } from '@inertiajs/react'
import { href } from 'fondu/client'

export function Card({ title, tag, children, className = '' }: { title: ReactNode; tag?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      <h2>{title} {tag ? <span className="tag ml-1 font-normal">{tag}</span> : null}</h2>
      {children}
    </section>
  )
}

export const Json = ({ value, ...rest }: { value: unknown } & HTMLAttributes<HTMLPreElement>) => (
  <pre className="json" {...rest}>{JSON.stringify(value, null, 2)}</pre>
)

export const Skeleton = () => (
  <div className="grid gap-2" aria-label="Loading"><div className="skeleton w-4/5" /><div className="skeleton w-3/5" /><div className="skeleton w-2/5" /></div>
)

// How this document was rendered: the server snapshot is used while hydrating (so the markup matches), then the
// browser's: whether the first page came server-rendered (`data-server-rendered`) and React hydrated it.
const ssrAtLoad = typeof document !== 'undefined' && document.querySelector('[data-server-rendered]') !== null
const noop = () => () => {}
export function RenderBadge() {
  const mode = useSyncExternalStore(noop, () => (ssrAtLoad ? 'SSR: hydrated' : 'Rendered in the browser'), () => 'SSR')
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${mode === 'Rendered in the browser' ? 'bg-line text-muted' : 'bg-ok-soft text-ok'}`} data-testid="render-mode">{mode}</span>
}

/** Who is signed in (a shared prop: in the server-rendered HTML, never loading), and the way in or out */
export function Account() {
  const { user } = usePage().props.auth
  return (
    <span className="ml-auto flex items-center gap-3">
      {user
        ? <>
            <span className="opacity-70">Signed in as <span className="font-medium" data-testid="user">{user.name}</span></span>
            <Link href={href('/logout')} method="post" as="button" className="btn">Sign out</Link>
          </>
        : <Link href={href('/login')} className="btn" data-testid="sign-in">Sign in</Link>}
    </span>
  )
}

/** The flash message of this page (shown once) */
export function Flash() {
  const { flash } = usePage()
  return flash.message ? <p className="mx-5 mt-4 rounded-md bg-accent-soft px-3 py-2 text-[13px] text-accent" role="status" data-testid="flash">{flash.message}</p> : null
}
