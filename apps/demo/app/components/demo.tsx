import { href, useNavigating, usePage } from 'fondu/client'
import { InfoIcon } from 'lucide-react'
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type HTMLAttributes,
  type ReactNode,
} from 'react'

import { Alert, AlertDescription } from '#/components/ui/alert.tsx'
import { Badge } from '#/components/ui/badge.tsx'
import { Button, type ButtonProps } from '#/components/ui/button.tsx'
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from '#/components/ui/card.tsx'
import { Field, FieldError, FieldLabel } from '#/components/ui/field.tsx'
import { Input, type InputProps } from '#/components/ui/input.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { cn } from '#/lib/utils.ts'

/** The page's title, after the demo's name (React puts it in <head>) */
export const Title = ({ children }: { children: string }) => (
  <title>{`${children} · Fondu demo`}</title>
)

/** A card of the demo: what it shows, and the API it uses (`tag`) */
export function DemoCard({
  title,
  tag,
  children,
  className,
}: {
  title: ReactNode
  tag?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    // min-w-0: in a grid or a row, a wide line (code) scrolls inside the card instead of widening the page
    <Card render={<section />} className={cn('min-w-0', className)}>
      <CardHeader className="p-5">
        <CardTitle render={<h2 />} className="text-base">
          {title}
        </CardTitle>
        {tag ? <CardDescription className="font-mono text-xs">{tag}</CardDescription> : null}
      </CardHeader>
      <CardPanel className="p-5 pt-0">{children}</CardPanel>
    </Card>
  )
}

export const Json = ({
  value,
  className,
  ...rest
}: { value: unknown } & HTMLAttributes<HTMLPreElement>) => (
  <pre
    className={cn('overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs/relaxed', className)}
    {...rest}
  >
    {JSON.stringify(value, null, 2)}
  </pre>
)

export const Loading = () => (
  <div className="grid gap-2" aria-label="Loading">
    <Skeleton className="h-2.5 w-4/5" />
    <Skeleton className="h-2.5 w-3/5" />
    <Skeleton className="h-2.5 w-2/5" />
  </div>
)

// How this document was rendered: the server snapshot is used while hydrating (so the markup matches), then the
// browser's: whether the first page came server-rendered (#app had the page before React ran) and React hydrated it.
const ssrAtLoad =
  typeof document !== 'undefined' && document.getElementById('app')?.hasChildNodes() === true
const noop = () => () => {}
export function RenderBadge() {
  const mode = useSyncExternalStore(
    noop,
    () => (ssrAtLoad ? 'SSR: hydrated' : 'Rendered in the browser'),
    () => 'SSR',
  )
  return (
    <Badge
      variant={mode === 'Rendered in the browser' ? 'secondary' : 'success'}
      data-testid="render-mode"
    >
      {mode}
    </Badge>
  )
}

/** A labelled input and its error (Base UI's Field: the input is marked invalid and described by the error) */
export function TextField({
  label,
  error,
  testid,
  ...input
}: { label: ReactNode; error?: string; testid?: string } & InputProps) {
  return (
    <Field invalid={!!error}>
      <FieldLabel>{label}</FieldLabel>
      <Input {...input} />
      {error && (
        <FieldError match data-testid={testid}>
          {error}
        </FieldError>
      )}
    </Field>
  )
}

/**
 * A form's submit button, busy while its form is sent (`useNavigating()`, from its click: Enter in a field clicks it
 * too). When the answer comes back with errors, the first field to fix gets the focus. For a request of the page's
 * own (fetch), pass `processing`.
 */
export function SubmitButton({ processing, ...props }: ButtonProps & { processing?: boolean }) {
  const navigating = useNavigating()
  const { errors } = usePage().props
  const [sent, setSent] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)
  // the answer is on the screen: the focus to the first field to fix
  useEffect(() => {
    if (navigating || !sent || !Object.keys(errors).length) return
    ref.current?.form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [sent, navigating, errors])
  return (
    <Button
      ref={ref}
      type="submit"
      loading={processing ?? (sent && navigating)}
      onClick={() => setSent(true)}
      onBlur={() => setSent(false)}
      {...props}
    />
  )
}

/** For guests, in place of forms whose actions need an account (requireUser): the way in, and back here */
export function SignInFirst({ children }: { children: ReactNode }) {
  const { url } = usePage()
  return (
    <Alert variant="info" data-testid="sign-in-first">
      <InfoIcon />
      <AlertDescription>
        <p>
          <a href={`${href('/login')}?next=${encodeURIComponent(url)}`}>Sign in</a> {children}
        </p>
      </AlertDescription>
    </Alert>
  )
}
