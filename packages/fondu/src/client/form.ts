import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type FormEvent,
} from 'react'

import {
  fieldKey,
  formObject,
  issueErrors,
  MalformedForm,
  sentFields,
  type Issue,
} from '../form.js'
import { useNavigation, usePage, type Errors } from './app.js'

interface Schema {
  readonly '~standard': {
    readonly validate: (value: unknown) => StandardResult | Promise<StandardResult>
  }
}
type StandardResult = { readonly issues?: ReadonlyArray<Issue> | undefined }

function fieldsOf(form: HTMLFormElement, submitter?: HTMLElement | null): unknown {
  const attr = (name: string, own: string) =>
    submitter?.getAttribute(own) ?? form.getAttribute(name)
  const multipart =
    (attr('method', 'formmethod') ?? 'get').toLowerCase() === 'post' &&
    (attr('enctype', 'formenctype') ?? '').toLowerCase() === 'multipart/form-data'
  return formObject(sentFields(new FormData(form, submitter ?? undefined), multipart))
}

const warned = new WeakSet<Schema>()

// exported for its test
export function check(schema: Schema, value: () => unknown): Errors {
  let fields: unknown
  try {
    fields = value()
  } catch (error) {
    if (error instanceof MalformedForm) return {}
    throw error
  }
  const result = schema['~standard'].validate(fields)
  // any thenable, not only a Promise: its answer would be taken for a pass. No verdict: the server checks it
  if ('then' in result) {
    // a no-op catch: a rejection nobody reads is not an unhandled one
    Promise.resolve(result).catch(() => {})
    if (import.meta.env.DEV && !warned.has(schema)) {
      warned.add(schema)
      console.warn(
        'fondu: this schema has an async rule, so useForm leaves it to the server; move the async rule into the action to check the rest in the browser',
      )
    }
    return {}
  }
  return result.issues ? issueErrors(result.issues) : {}
}

const within = (key: string, errorKey: string) =>
  errorKey === key || (key !== '' && errorKey.startsWith(`${key}.`))

/**
 * A plain `<form>`, checked in the browser by the schema the server checks it with (any Standard Schema; an async one is
 * left to the server). Spread `form` on the `<form>` and `field(name)` on each field. Without JavaScript, the form is sent as
 * it is and the server checks it.
 */
export function useForm(schema?: Schema): {
  form: {
    ref: (form: HTMLFormElement | null) => void
    onSubmit: (event: FormEvent<HTMLFormElement>) => void
  }
  field: (name: string) => {
    name: string
    'aria-invalid': true | undefined
    onBlur: (event: FocusEvent<Element>) => void
    onChange: (event: ChangeEvent<Element>) => void
  }
  errors: Errors
  submitting: boolean
  failed: boolean
} {
  const server = usePage().props.errors
  const navigation = useNavigation()
  const [element, setElement] = useState<HTMLFormElement | null>(null)
  // the browser's messages (undefined: checked, fine), for these server errors: a new answer starts over
  const [checked, setChecked] = useState<{ for: Errors; own: Record<string, string | undefined> }>({
    for: server,
    own: {},
  })
  const own = checked.for === server ? checked.own : {}
  const errors: Errors = Object.create(null)
  // own keys only: a field may be named like what objects inherit (`toString`)
  for (const [k, m] of Object.entries(server)) if (!Object.hasOwn(own, k)) errors[k] = m
  for (const [k, m] of Object.entries(own)) if (m) errors[k] = m
  const errorOf = (key: string) => Object.keys(errors).find((k) => within(key, k))
  const dirty = useRef(new Set<string>())

  const apply = (found: Errors, key?: string) => {
    setChecked((now) => {
      const before = now.for === server ? now.own : {}
      const next: Record<string, string | undefined> = { ...before }
      const covered = (k: string) => key === undefined || within(key, k)
      // a field's check settles the server's error too; the whole form's, what it can say (not a taken address)
      for (const k of [...Object.keys(before), ...(key === undefined ? [] : Object.keys(server))])
        if (covered(k)) next[k] = undefined
      for (const [k, m] of Object.entries(found)) if (covered(k)) next[k] = m
      return { for: server, own: next }
    })
  }
  const focusFirst = (form: HTMLFormElement, found: Errors) => {
    const keys = Object.keys(found).filter((k) => k !== '')
    for (const el of form.elements)
      if (
        el instanceof HTMLElement &&
        'name' in el &&
        typeof el.name === 'string' &&
        el.name &&
        keys.some((k) => within(fieldKey(el.name as string), k))
      )
        return el.focus()
  }

  const validates = schema !== undefined
  const ref = useCallback(
    (form: HTMLFormElement | null) => {
      setElement(form)
      // its messages, in the page's language, not the browser's (without JavaScript, the browser's checks stay)
      if (form && validates) form.noValidate = true
    },
    [validates],
  )

  const mine = navigation.form !== null && navigation.form === element
  const submitting = mine && navigation.state !== 'failed'
  const failed = mine && navigation.state === 'failed'
  // back with the server's errors: the first field to fix gets the focus (not for a form that was not sent: no answer)
  const sent = useRef(false)
  useEffect(() => {
    if (submitting) {
      sent.current = true
      return
    }
    if (!sent.current) return
    sent.current = false
    if (failed) return
    if (element && Object.keys(server).length) focusFirst(element, server)
  }, [submitting, failed, server, element])

  const checkField = (form: HTMLFormElement, key: string) => {
    if (!schema) return
    apply(
      check(schema, () => fieldsOf(form)),
      key,
    )
  }

  return {
    form: {
      ref,
      onSubmit(event) {
        if (!schema) return
        const form = event.currentTarget
        const submitter = (event.nativeEvent as SubmitEvent).submitter
        const found = check(schema, () => fieldsOf(form, submitter))
        apply(found)
        if (Object.keys(found).length) {
          event.preventDefault()
          focusFirst(form, found)
        }
      },
    },
    field: (name) => {
      const key = fieldKey(name)
      return {
        name,
        'aria-invalid': errorOf(key) !== undefined || undefined,
        onBlur(event) {
          // left for another field: not for the submit button, nor another window
          const to = event.relatedTarget
          if (!(to instanceof HTMLElement) || (to as HTMLButtonElement).type === 'submit') return
          const form = (event.currentTarget as HTMLInputElement).form ?? element
          if (form && dirty.current.has(key)) checkField(form, key)
        },
        onChange(event) {
          dirty.current.add(key)
          const form = (event.currentTarget as HTMLInputElement).form ?? element
          if (form && errorOf(key) !== undefined) checkField(form, key)
        },
      }
    },
    errors,
    submitting,
    failed,
  }
}
