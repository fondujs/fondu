import { Form, Head, Link } from '@inertiajs/react'
import { href } from 'fondu/client'

import { Field } from '#/components/ui.tsx'

export default function Signup() {
  return (
    <div className="max-w-sm">
      <Head title="Create an account" />
      <h1>Create an account</h1>
      <p className="lede">
        Accounts, sessions and passwords are Better Auth's; this page posts to an action that calls it.
      </p>
      <Form
        action={href('/signup')}
        method="post"
        resetOnError={['password']}
        className="grid gap-4"
        data-testid="signup"
      >
        {({ errors, processing }) => (
          <>
            <Field label="Name" name="name" autoComplete="name" error={errors.name} />
            <Field
              label="Email"
              name="email"
              type="email"
              autoComplete="username"
              error={errors.email}
              testid="err-email"
            />
            <Field
              label="Password"
              name="password"
              type="password"
              autoComplete="new-password"
              error={errors.password}
            />
            <button className="btn btn-primary justify-center" disabled={processing}>
              Create account
            </button>
          </>
        )}
      </Form>
      <p className="note mt-4">
        Have one? <Link href={href('/login')}>Sign in</Link>
      </p>
    </div>
  )
}
