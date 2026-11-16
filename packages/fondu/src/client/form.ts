import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type FormEvent,
} from 'react'

import { crlf, fieldKey, formObject, issueErrors, MalformedForm, type Issue } from '../form.js'
import { useNavigation, usePage, type Errors } from './app.js'

/** A Standard Schema (zod, valibot, arktype…), the part `useForm` uses */
interface Schema {
  readonly '~standard': {
    readonly validate: (value: unknown) => StandardResult | Promise<StandardResult>
  }
}
type StandardResult = { readonly issues?: ReadonlyArray<Issue> | undefined }

/** a form's fields as the server reads them: its body for a POST (`withValidator({ body })`), its query for a GET */
function fieldsOf(form: HTMLFormElement, submitter?: HTMLElement | null): unknown {
  const data = new FormData(form, submitter ?? undefined)
  const entries = [...data].map(
    ([k, v]) => [crlf(k), typeof v === 'string' ? crlf(v) : v] as [string, FormDataEntryValue],
  )
  const method = (
    submitter?.getAttribute('formmethod') ??
    form.getAttribute('method') ??
    'get'
  ).toLowerCase()
  if (method === 'post') return formObject(entries)
  // a query, as Hono's `c.req.query()`: each name's first value, a file by its name
  const query: Record<string, string> = Object.create(null)
  for (const [k, v] of entries) query[k] ??= typeof v === 'string' ? v : v.name
  return query
}

/** the schema's errors for these fields; none for fields that can't be one object (the server answers those) */
function check(schema: Schema, value: () => unknown): Errors | Promise<Errors> {
  let fields: unknown
  try {
    fields = value()
  } catch (error) {
    if (error instanceof MalformedForm) return {}
    throw error
  }
  const result = schema['~standard'].validate(fields)
  const errors = (r: StandardResult) => (r.issues ? issueErrors(r.issues) : {})
  return result instanceof Promise ? result.then(errors) : errors(result)
}

/** a form's fields as one string, files by what identifies them: two snapshots of a form are equal if this is */
function snapshot(form: HTMLFormElement, submitter?: HTMLElement | null): string | undefined {
  try {
    return JSON.stringify(
      [...new FormData(form, submitter ?? undefined)].map(([k, v]) =>
        typeof v === 'string' ? [k, v] : [k, v.name, v.size, v.lastModified, v.type],
      ),
    )
  } catch {
    return undefined // a submitter that is no longer in the form: not what was checked
  }
}

/** a field's errors: its own, and those inside it (`tags` has `tags.0`'s) */
const within = (key: string, errorKey: string) =>
  errorKey === key || (key !== '' && errorKey.startsWith(`${key}.`))

/**
 * A plain `<form>`, checked in the browser by the schema the server checks it with (any Standard Schema), its fields
 * read as the server reads them (`tags[]`, `user[name]`). Spread `form` on the `<form>`, `field(name)` on each field:
 *
 * - on submit, an invalid form isn't sent, and its first field to fix gets the focus; a valid one is sent by Fondu's
 *   client. Back with the server's errors, the first field to fix gets the focus too
 * - a field is checked as it is left for another with something typed, and again as it changes while it is wrong,
 *   so a fixed one loses its message (not as it is left for the submit button: the message would move it from under
 *   the pointer)
 * - `errors`: the server's (the page's `errors` prop), each until its field is checked again, and the browser's;
 *   by the server's keys (`email`, `user.name`)
 * - an async schema: the form is sent once the schema has said yes to the values it was asked about. A result that
 *   comes late is dropped, and sends nothing: after a newer submit, a visit to another page, or the form leaving the
 *   screen, and when the fields are no longer what was checked (changed while the schema was working). That form is
 *   not sent unchecked, nor checked again for the user: submit it again
 * - `submitting`: this form is being sent
 * - `failed`: this form could not be sent (offline…): it stays, to send again
 *
 * Without a schema: the server's errors, `submitting` and `failed` only. Without JavaScript, the form is sent as it is, and the
 * server's check answers.
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
  // the server's errors on the screen, for a check that ends after a new answer
  const latest = useRef(server)
  useLayoutEffect(() => {
    latest.current = server
  }, [server])
  const own = checked.for === server ? checked.own : {}
  const errors: Errors = Object.create(null)
  // own keys only: a field may be named like what objects inherit (`toString`)
  for (const [k, m] of Object.entries(server)) if (!Object.hasOwn(own, k)) errors[k] = m
  for (const [k, m] of Object.entries(own)) if (m) errors[k] = m
  const errorOf = (key: string) => Object.keys(errors).find((k) => within(key, k))
  const dirty = useRef(new Set<string>())
  const runs = useRef(new Map<string, number>())
  const passed = useRef(false)
  // which whole-form check may still send: each submit takes the next number, and so does what makes a pending one
  // obsolete (a visit, the form leaving). The result of an older one is dropped
  const generation = useRef(0)
  // the checks of single fields that began before the whole form's result: that result is the newer word
  const epoch = useRef(0)

  /** what a check found, for the fields it covers (`key`: one field and those inside it; else all) */
  const apply = (found: Errors, from: Errors, key?: string) => {
    if (latest.current !== from) return // a new answer of the server since
    setChecked((now) => {
      const before = now.for === from ? now.own : {}
      const next: Record<string, string | undefined> = { ...before }
      const covered = (k: string) => key === undefined || within(key, k)
      // a field's check settles the server's error too; the whole form's, what it can say (not a taken address)
      for (const k of [...Object.keys(before), ...(key === undefined ? [] : Object.keys(from))])
        if (covered(k)) next[k] = undefined
      for (const [k, m] of Object.entries(found)) if (covered(k)) next[k] = m
      return { for: from, own: next }
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

  // a visit to another page (a link, another form) or the form leaving the screen: a pending check can't send
  const visiting = navigation.state === 'loading' || navigation.state === 'submitting'
  useEffect(() => {
    if (visiting) generation.current++
  }, [visiting])
  useEffect(
    () => () => {
      generation.current++
    },
    [],
  )

  const checkField = (form: HTMLFormElement, key: string) => {
    if (!schema) return
    const run = (runs.current.get(key) ?? 0) + 1
    runs.current.set(key, run)
    const from = server
    const began = epoch.current
    const done = (found: Errors) => {
      // not after a newer check of the field, nor after the whole form's result (it began with these values or later)
      if (runs.current.get(key) === run && epoch.current === began) apply(found, from, key)
    }
    const found = check(schema, () => fieldsOf(form))
    if (found instanceof Promise) void found.then(done)
    else done(found)
  }

  return {
    form: {
      ref,
      onSubmit(event) {
        if (!schema) return
        if (passed.current) {
          passed.current = false // checked already: sent
          return
        }
        const form = event.currentTarget
        const submitter = (event.nativeEvent as SubmitEvent).submitter
        const from = server
        const mine = ++generation.current
        const before = snapshot(form, submitter)
        const found = check(schema, () => fieldsOf(form, submitter))
        const answer = (found: Errors) => {
          apply(found, from)
          if (Object.keys(found).length) focusFirst(form, found)
        }
        if (!(found instanceof Promise)) {
          if (Object.keys(found).length) event.preventDefault()
          return answer(found)
        }
        // an async schema: sent again once it says yes
        event.preventDefault()
        void found.then((found) => {
          // obsolete (a newer submit, a visit, the form gone) or about other values than the form has now: it says
          // nothing about what would be sent
          if (generation.current !== mine || snapshot(form, submitter) !== before) return
          epoch.current++
          answer(found)
          if (Object.keys(found).length || latest.current !== from) return
          passed.current = true
          try {
            form.requestSubmit(
              submitter && 'form' in submitter ? (submitter as HTMLButtonElement) : null,
            )
          } finally {
            passed.current = false // a submit that was cancelled has not used it up
          }
        })
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
