import { defineHandler, flash, render } from 'fondu'
import { useForm, usePage } from 'fondu/client'

// useForm with a schema whose answer is a promise: not supported (e2e/form-async.spec.ts)
const schema = {
  '~standard': {
    version: 1 as const,
    vendor: 'conformance',
    validate: (value: unknown) => Promise.resolve({ value, issues: undefined }),
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
