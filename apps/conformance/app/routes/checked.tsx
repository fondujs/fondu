import { defineHandler, flash, render } from 'fondu'
import { useForm, usePage } from 'fondu/client'

// One schema, the browser's (useForm) and the server's (withValidator): what each says of the same form must be the
// same, nested fields and lists included. A Standard Schema of its own: any library's works.
type Body = { name?: unknown; tags?: unknown; user?: { email?: unknown } }
type Issue = { message: string; path: PropertyKey[] }
const schema = {
  '~standard': {
    version: 1 as const,
    vendor: 'conformance',
    validate(value: unknown) {
      const body = (value ?? {}) as Body
      const issues: Issue[] = []
      if (typeof body.name !== 'string' || body.name.trim() === '')
        issues.push({ message: 'A name, please', path: ['name'] })
      if (!Array.isArray(body.tags) || body.tags.length < 2)
        issues.push({ message: 'Two tags at least', path: ['tags'] })
      if (typeof body.user?.email !== 'string' || !body.user.email.includes('@'))
        issues.push({ message: 'An email address', path: ['user', 'email'] })
      return issues.length ? { issues } : { value: body }
    },
  },
}

export const action = defineHandler.withValidator({ body: schema })((c, { body }) => {
  flash(c, { received: JSON.stringify(body) })
  return c.redirect('/checked', 303)
})

export const loader = defineHandler((c) => render(c, Checked))

export default function Checked() {
  const { flash } = usePage()
  const { form, field, errors } = useForm(schema)
  return (
    <>
      <title>Checked</title>
      <form id="checked" method="post" {...form}>
        <input {...field('name')} defaultValue="Ada" />
        {['a', 'b', 'c'].map((tag) => (
          <input
            key={tag}
            type="checkbox"
            {...field('tags[]')}
            value={tag}
            defaultChecked={tag !== 'b'}
          />
        ))}
        <input {...field('user[email]')} defaultValue="ada@example.com" />
        <button>Save</button>
      </form>
      <pre id="errors">{JSON.stringify(Object.fromEntries(Object.entries(errors).sort()))}</pre>
      <pre id="received">{(flash as { received?: string }).received ?? ''}</pre>
    </>
  )
}
