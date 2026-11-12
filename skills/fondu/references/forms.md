# Forms

Docs: [forms and validation](https://fondu.dev/docs/forms.md).

A form is a plain `<form>`. It posts to an action, which validates and redirects. With JavaScript the client sends it
without a page load; without, it is an ordinary post with the same result.

```tsx
// app/routes/contacts/new.tsx
import { back, defineHandler, flash } from 'fondu'
import type { Errors } from 'fondu/client'

import { contactSchema } from '#/modules/contacts/schemas.ts'

// POST /contacts/new
export const action = defineHandler.withValidator({ body: contactSchema })(async (c, { body }) => {
  await addContact(body)
  flash(c, { message: 'Contact added' })
  return back(c)
})

export default function NewContact({ errors }: { errors: Errors }) {
  return (
    <form method="post">
      <input name="email" aria-invalid={!!errors.email} />
      {errors.email && <p>{errors.email}</p>}
      <button>Add</button>
    </form>
  )
}
```

## Actions

- A form without `action` posts to its page's URL. Several forms: `actions = { add, remove }` in the route file and
  `<form method="post" action="?remove">` in the page. `action` or `actions`, not both; a POST without a known name is
  a 404.
- Use `href('/users/:id?rename', { id })` for a typed action URL.
- After an action, redirect so a reload doesn't send the form again: `back(c)` (the page the form was on, updated in
  place; `back(c, fallback?)`), or `c.redirect(url, 303)`.
- `flash(c, { message: 'Saved' })` before either: data for the next page only, in `usePage().flash`.

## Invalid input

`defineHandler.withValidator({ body, query, params })` takes any Standard Schema (Zod, Valibot, ArkType…). When body
or query don't fit, the handler doesn't run:

- a page's form goes back to its page with the `errors` prop, one message per field (`{ email: 'Invalid email' }`),
  and what was typed stays;
- an API client gets 422 and `{ errors }`;
- params that don't fit are a 404.

A check the schema can't make throws `ValidationError`, with the same result:

```ts
import { ValidationError } from 'fondu'

if (await emailTaken(body.email)) throw new ValidationError({ email: 'This address is taken' })
```

The middleware comes first, so a guard runs before the body is read:

```ts
defineHandler.withValidator({ params, body })(requireUser, async (c, { params, body }) => back(c))
```

## The same schema in the browser

`useForm(schema)` from `fondu/client` checks the form before it is sent, reading fields as the server does:

```tsx
import { useForm } from 'fondu/client'

import { contactSchema } from '#/modules/contacts/schemas.ts'

export default function NewContact() {
  const { form, field, errors, submitting, failed } = useForm(contactSchema)
  return (
    <form method="post" {...form}>
      <input {...field('email')} />
      {errors.email && <p>{errors.email}</p>}
      <button disabled={submitting}>Add</button>
      {failed && <p role="alert">Not sent. Check your connection and try again.</p>}
    </form>
  )
}
```

| Field         | Is                                                                          |
| ------------- | --------------------------------------------------------------------------- |
| `form`        | for the `<form>`: checks on submit; an invalid form isn't sent              |
| `field(name)` | for a field: `name`, `aria-invalid`, checks as it is left and changed       |
| `errors`      | the server's (the page's `errors`) and the browser's: `errors['user.name']` |
| `submitting`  | this form is being sent                                                     |
| `failed`      | this form could not be sent (offline…); it stays, to send again             |

- The schema must be importable by browser code (no server module). The server checks again.
- Without a schema, `useForm()` gives the server's errors, `submitting` and `failed`.
- Without JavaScript, the form is sent as it is and the server's check answers.

## While it is sent

The form being sent has `aria-busy="true"`: `form[aria-busy='true'] button[type='submit'] { opacity: 0.6 }`. In a
component: `useForm().submitting`, or `useNavigation().form` (the form being sent). The progress bar shows for forms too; turn
that off with `progress: { forms: false }` in the plugin's options.

## Files and nested fields

The body is one object, JSON or form fields. `user[name]` and `tags[]` become nested objects and arrays, files are
`File` objects, empty file inputs are left out. A body that can't be one object is a 400.

The body is read whole, in memory. Over 10 MB is a 413 by default:

```ts
// app/server.ts
export default createApp({ bodyLimit: 25 * 1024 * 1024 }) // false: no limit
```

A route that takes less adds Hono's `bodyLimit` in its `_middleware.ts` (it can't raise the app's limit):

```ts
// app/routes/avatars/_middleware.ts
import { bodyLimit } from 'hono/body-limit'

export default bodyLimit({ maxSize: 1024 * 1024 }) // 1 MB, then 413
```

CSRF: `createApp()` requires a request that changes something to come from the app's own origin. The app's own forms do.
