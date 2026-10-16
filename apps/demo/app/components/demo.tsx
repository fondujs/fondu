import { Link, useFormContext, usePage } from '@inertiajs/react'
import { href } from 'fondu/client'
import { InfoIcon } from 'lucide-react'
import { useEffect, useRef, useSyncExternalStore, type HTMLAttributes, type ReactNode } from 'react'

import { Alert, AlertDescription } from '#/components/ui/alert.tsx'
import { Badge } from '#/components/ui/badge.tsx'
import { Button, type ButtonProps } from '#/components/ui/button.tsx'
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from '#/components/ui/card.tsx'
import { Field, FieldError, FieldLabel } from '#/components/ui/field.tsx'
import { Input, type InputProps } from '#/components/ui/input.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { cn } from '#/lib/utils.ts'

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
    <Card render={<section />} className={className}>
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
// browser's: whether the first page came server-rendered (`data-server-rendered`) and React hydrated it.
const ssrAtLoad =
  typeof document !== 'undefined' && document.querySelector('[data-server-rendered]') !== null
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

const noErrors = {}

/**
 * A form's submit button, busy while the form is sent (so the form turns off Inertia's progress bar). When the
 * submit comes back with errors, the first field to fix gets the focus. In an Inertia <Form> it reads the form's
 * state; for useForm, pass `processing` and `errors`.
 */
export function SubmitButton({
  processing,
  errors,
  ...props
}: ButtonProps & { processing?: boolean; errors?: Record<string, string> }) {
  const form = useFormContext()
  processing ??= form?.processing ?? false
  errors ??= form?.errors ?? noErrors
  const ref = useRef<HTMLButtonElement>(null)
  const sent = useRef(false) // clicked: Enter in a field clicks it too
  useEffect(() => {
    if (!sent.current || processing) return // live validation's errors move nothing
    sent.current = false
    if (Object.keys(errors).length)
      ref.current?.form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [processing, errors])
  return (
    <Button
      ref={ref}
      type="submit"
      loading={processing}
      onClick={() => (sent.current = true)}
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
          <Link href={`${href('/login')}?next=${encodeURIComponent(url)}`}>Sign in</Link> {children}
        </p>
      </AlertDescription>
    </Alert>
  )
}
