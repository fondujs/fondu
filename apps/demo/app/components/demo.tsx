import { type Errors, href, useNavigating, usePage } from 'fondu/client'
import { InfoIcon } from 'lucide-react'
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type FocusEvent,
  type HTMLAttributes,
  type ReactNode,
  type SubmitEvent,
} from 'react'
import * as z from 'zod/mini'

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

/** whether a form is being sent: Fondu's client marks it `aria-busy` while it is */
export function useSending(form: () => HTMLFormElement | null | undefined): boolean {
  const navigating = useNavigating()
  return navigating && form()?.getAttribute('aria-busy') === 'true'
}

/**
 * A form's submit button, busy while its form is sent. When the answer comes back with errors, the first field to fix
 * gets the focus. For a request of the page's own (fetch), pass `processing`.
 */
export function SubmitButton({ processing, ...props }: ButtonProps & { processing?: boolean }) {
  const ref = useRef<HTMLButtonElement>(null)
  const sending = useSending(() => ref.current?.form)
  const sent = useRef(false)
  const { errors } = usePage().props
  // the answer to this form is on the screen: the focus to the first field to fix
  useEffect(() => {
    if (sending) {
      sent.current = true
      return
    }
    if (!sent.current) return
    sent.current = false
    if (Object.keys(errors).length)
      ref.current?.form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [sending, errors])
  return <Button ref={ref} type="submit" loading={processing ?? sending} {...props} />
}

/** a field's first message, by name */
function messages(error: z.core.$ZodError): Errors {
  const found: Errors = {}
  for (const issue of error.issues) found[String(issue.path[0] ?? '')] ??= issue.message
  return found
}

/**
 * A form checked in the browser with the action's own schema (the server checks again): on submit, an invalid form
 * isn't sent and its first field to fix gets the focus; a field is checked as it is left for another with something
 * typed, and again as it changes while it is wrong, so a fixed one loses its message. The server's errors (`errors`) until a field
 * is checked again. Spread `form` on the <form>, `field(name)` on a TextField.
 */
export function useSchemaForm(schema: z.ZodMiniObject, errors: Errors) {
  // the browser's messages, for these server errors: a new answer of the server starts over
  const [checked, setChecked] = useState({ for: errors, messages: {} as Errors })
  const own = checked.for === errors ? checked.messages : {}
  // own keys only: a field may be named like what objects inherit (`toString`)
  const error = (name: string) =>
    (Object.hasOwn(own, name) ? own[name] : Object.hasOwn(errors, name) ? errors[name] : '') ||
    undefined
  const check = (name: string, value: string) => {
    const shape = schema.def.shape as Record<string, z.ZodMiniType>
    const result = shape[name] ? z.safeParse(shape[name], value) : null
    const message = result && !result.success ? (result.error.issues[0]?.message ?? '') : ''
    setChecked({ for: errors, messages: { ...own, [name]: message } })
  }
  return {
    form: {
      noValidate: true, // its messages, in the page's language, not the browser's
      onSubmit(event: SubmitEvent<HTMLFormElement>) {
        const result = z.safeParse(schema, Object.fromEntries(new FormData(event.currentTarget)))
        if (result.success) return setChecked({ for: errors, messages: {} }) // sent, by Fondu's client
        event.preventDefault()
        const found = messages(result.error)
        setChecked({ for: errors, messages: found })
        const first = event.currentTarget.elements.namedItem(Object.keys(found)[0] ?? '')
        if (first instanceof HTMLElement) first.focus()
      },
    },
    field: (name: string) => ({
      name,
      error: error(name),
      onBlur: (event: FocusEvent<HTMLInputElement>) => {
        // left for another field: a click on the submit button is checked by the submit (a message shown on the way
        // would move the button from under the pointer, and the click would be lost)
        const to = event.relatedTarget
        if (!(to instanceof HTMLElement) || (to as HTMLButtonElement).type === 'submit') return
        if (event.currentTarget.value) check(name, event.currentTarget.value)
      },
      onChange: (event: ChangeEvent<HTMLInputElement>) => {
        if (error(name)) check(name, event.currentTarget.value)
      },
    }),
  }
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
