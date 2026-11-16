import { defineHandler, render } from 'fondu'
import { useForm } from 'fondu/client'

// A GET form's query, read as the server reads it: the browser's schema (useForm) and the loader's (withValidator({
// query })) see repeated fields, `tags[]` and `user[email]` as a list and an object, not each name's first value.
// With no query at all, there is nothing to check (the first visit).
type Query = { name?: unknown; tags?: unknown; color?: unknown; user?: { email?: unknown } }
type Issue = { message: string; path: PropertyKey[] }
const schema = {
  '~standard': {
    version: 1 as const,
    vendor: 'conformance',
    validate(value: unknown) {
      const query = (value ?? {}) as Query
      if (Object.keys(query).length === 0) return { value: query }
      const issues: Issue[] = []
      if (!Array.isArray(query.tags)) issues.push({ message: 'A list of tags', path: ['tags'] })
      if (!Array.isArray(query.color)) issues.push({ message: 'A list of colors', path: ['color'] })
      if (typeof query.user?.email !== 'string')
        issues.push({ message: 'An email address', path: ['user', 'email'] })
      return issues.length ? { issues } : { value: query }
    },
  },
}

export const loader = defineHandler.withValidator({ query: schema })((c, { query }) =>
  render(c, CheckedGet, { received: JSON.stringify(query) }),
)

export default function CheckedGet({ received }: { received: string }) {
  const { form, field, errors } = useForm(schema)
  return (
    <>
      <title>Checked GET</title>
      <form id="checked-get" method="get" {...form}>
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
        <input name="color" defaultValue="red" />
        <input name="color" defaultValue="blue" />
        <input {...field('user[email]')} defaultValue="ada@example.com" />
        <button>Search</button>
      </form>
      <pre id="errors">{JSON.stringify(Object.fromEntries(Object.entries(errors).sort()))}</pre>
      <pre id="received">{received}</pre>
    </>
  )
}
