import type { FormEvent } from 'react'
import { Form, Head, Link, useForm, usePage } from '@inertiajs/react'
import { href } from 'fondu/client'
import * as z from 'zod/mini'
import { Card } from '../../components/ui'
import { contactSchema } from '../../schemas/contact'

type Contact = { id: number; name: string; email: string }

export default function Contacts({ contacts }: { contacts: Contact[] }) {
  // the page's errors after the redirect back: what the form shows when it was submitted without JavaScript
  const pageErrors = usePage().props.errors
  // the same schema as the action, checked in the browser before anything is sent
  const quick = useForm({ name: '', email: '' })
  const addQuickly = (e: FormEvent) => {
    e.preventDefault()
    const result = contactSchema.safeParse(quick.data)
    if (!result.success) {
      const fields = z.flattenError(result.error).fieldErrors
      quick.clearErrors()
      quick.setError({ name: fields.name?.[0] ?? '', email: fields.email?.[0] ?? '' })
      return
    }
    quick.post(href('/contacts'), { preserveScroll: true, onSuccess: () => quick.reset() })
  }
  return (
    <>
      <Head title="Forms & validation" />
      <h1>Forms & validation</h1>
      <p className="lede">
        One schema (<code>schemas/contact.ts</code>) validates on the server; invalid input is answered with a 303 back to this page and the errors in its <code>errors</code> prop. The same schema can check in the browser first, or the server can check field by field as you type (Precognition). Contacts are stored in D1.
      </p>
      <div className="grid-cards mb-4">
        <Card title="Live validation" tag="<Form> · Precognition">
          {/* each field is checked by the action's own schema when it changes; the action itself runs on submit */}
          <Form action={href('/contacts')} method="post" resetOnSuccess className="grid gap-3" data-testid="add-contact">
            {({ errors: formErrors, processing, validate, invalid, validating }) => {
              const errors = { ...pageErrors, ...formErrors }
              return (
                <>
                  <label className="field">Name<input className="input" name="name" onChange={() => validate('name')} aria-invalid={invalid('name')} />{errors.name && <span className="err" data-testid="err-name">{errors.name}</span>}</label>
                  <label className="field">Email<input className="input" name="email" onChange={() => validate('email')} aria-invalid={invalid('email')} />{errors.email && <span className="err" data-testid="err-email">{errors.email}</span>}</label>
                  <button className="btn btn-primary justify-center" disabled={processing}>{processing ? 'Adding…' : validating ? 'Checking…' : 'Add contact'}</button>
                </>
              )
            }}
          </Form>
        </Card>
        <Card title="Checked in the browser" tag="useForm · safeParse">
          <form onSubmit={addQuickly} className="grid gap-3" data-testid="quick-contact">
            <label className="field">Name<input className="input" value={quick.data.name} onChange={(e) => quick.setData('name', e.target.value)} />{quick.errors.name && <span className="err" data-testid="quick-err-name">{quick.errors.name}</span>}</label>
            <label className="field">Email<input className="input" value={quick.data.email} onChange={(e) => quick.setData('email', e.target.value)} />{quick.errors.email && <span className="err" data-testid="quick-err-email">{quick.errors.email}</span>}</label>
            <button className="btn btn-primary justify-center" disabled={quick.processing}>Add contact</button>
          </form>
        </Card>
      </div>
      <Card title="Contacts" tag="optimistic delete">
        <ul className="rows" data-testid="contacts">
          {contacts.map((contact) => (
            <li key={contact.id} className="flex items-center gap-3 py-2 text-[13px]">
              <Link href={href('/contacts/:id', { id: contact.id })} className="font-medium">{contact.name}</Link>
              <span className="note">{contact.email}</span>
              {/* POST /contacts?delete; the row disappears at once (optimistic), and comes back if the request fails */}
              <Form
                action={href('/contacts?delete')}
                method="post"
                options={{ preserveScroll: true }}
                optimistic={(props) => ({ contacts: (props.contacts as Contact[]).filter((x) => x.id !== contact.id) })}
                className="ml-auto"
              >
                <input type="hidden" name="id" value={contact.id} />
                <button className="btn" aria-label={`Delete ${contact.name}`}>Delete</button>
              </Form>
            </li>
          ))}
        </ul>
      </Card>
    </>
  )
}
