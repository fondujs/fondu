import { Form, Head } from '@inertiajs/react'
import { href } from 'fondu/client'

import { Card, Field } from '#/components/ui.tsx'

interface Props {
  account: { name: string; email: string; role: string }
}

export default function Account({ account }: Props) {
  return (
    <>
      <Head title="Account" />
      <h1>Account</h1>
      <p className="lede">
        A protected page (<code>requireUser</code>): guests are sent to sign in first. The form works without
        JavaScript.
      </p>
      <div className="grid gap-4 md:grid-cols-[1fr_16rem]">
        <Card title="Profile">
          <Form action={href('/account')} method="post" className="grid gap-4">
            {({ errors, processing }) => (
              <>
                <Field
                  label="Display name"
                  name="name"
                  defaultValue={account.name}
                  error={errors.name}
                  testid="err-name"
                />
                <button className="btn btn-primary justify-center" disabled={processing}>
                  {processing ? 'Saving…' : 'Save profile'}
                </button>
              </>
            )}
          </Form>
        </Card>
        <section className="card h-fit text-[13px]">
          <div className="mb-4 flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-full bg-accent-soft font-semibold text-accent">
              {account.name.slice(0, 1)}
            </span>
            <span className="font-medium">{account.name}</span>
          </div>
          <dl className="grid grid-cols-[4rem_1fr] gap-y-1.5">
            <dt className="text-muted">Email</dt>
            <dd data-testid="account-email">{account.email}</dd>
            <dt className="text-muted">Role</dt>
            <dd data-testid="account-role">{account.role}</dd>
          </dl>
        </section>
      </div>
    </>
  )
}
