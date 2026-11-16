import { defineHandler, flash, render } from 'fondu'
import { useForm, usePage } from 'fondu/client'

// useForm with an async schema that answers when the test says so: each check waits in `window.checks`, and
// `release()` gives its answer, for the values it was asked about (a name, please).
type Check = { name: unknown; release: () => void }
declare global {
  interface Window {
    checks: Check[]
  }
}
const schema = {
  '~standard': {
    version: 1 as const,
    vendor: 'conformance',
    validate(value: unknown) {
      const name = (value as { name?: unknown } | null)?.name
      return new Promise<{ issues?: { message: string; path: PropertyKey[] }[] }>((resolve) => {
        const answer =
          typeof name === 'string' && name.trim() !== ''
            ? {}
            : { issues: [{ message: 'A name, please', path: ['name'] }] }
        ;(window.checks ??= []).push({ name, release: () => resolve(answer) })
      })
    },
  },
}

// the server asks for nothing here: what it received is what the browser sent
const anything = {
  '~standard': {
    version: 1 as const,
    vendor: 'conformance',
    validate: (value: unknown) => ({ value }),
  },
}
export const action = defineHandler.withValidator({ body: anything })((c, { body }) => {
  flash(c, { received: JSON.stringify(body) })
  return c.redirect('/checked-async', 303)
})

export const loader = defineHandler((c) => render(c, CheckedAsync))

export default function CheckedAsync() {
  const { flash } = usePage()
  const { form, field, errors } = useForm(schema)
  return (
    <>
      <title>Checked, async</title>
      <form id="checked" method="post" {...form}>
        <input {...field('name')} defaultValue="Ada" />
        <input {...field('other')} defaultValue="x" />
        <button>Save</button>
      </form>
      <pre id="errors">{JSON.stringify(Object.fromEntries(Object.entries(errors).sort()))}</pre>
      <pre id="received">{(flash as { received?: string }).received ?? ''}</pre>
    </>
  )
}
