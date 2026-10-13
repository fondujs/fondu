import { Form, Head, Link } from '@inertiajs/react'
import { href } from 'fondu/client'

import { SubmitButton, TextField } from '#/components/demo.tsx'

export default function Signup() {
  return (
    <div className="max-w-sm">
      <Head title="Create an account" />
      <h1>Create an account</h1>
      <p className="lede">
        Accounts, sessions and passwords are Better Auth's; this page posts to an action that calls it.
      </p>
      <p className="mb-6 text-sm text-muted-foreground" data-testid="signup-off">
        Sign-up is turned off in this demo: sign in with one of its accounts instead.
      </p>
      <Form
        action={href('/signup')}
        method="post"
        resetOnError={['password']}
        showProgress={false}
        className="grid gap-4"
        data-testid="signup"
      >
        {({ errors }) => (
          <>
            <TextField label="Name" name="name" autoComplete="name" error={errors.name} />
            <TextField
              label="Email"
              name="email"
              type="email"
              autoComplete="username"
              error={errors.email}
              testid="err-email"
            />
            <TextField
              label="Password"
              name="password"
              type="password"
              autoComplete="new-password"
              error={errors.password}
            />
            <SubmitButton>Create account</SubmitButton>
          </>
        )}
      </Form>
      <p className="mt-4 text-sm text-muted-foreground">
        Have one? <Link href={href('/login')}>Sign in</Link>
      </p>
    </div>
  )
}
