import { Form, Head, Link } from '@inertiajs/react'
import { href } from 'fondu/client'

import { Field } from '#/components/ui.tsx'

export default function Login({ next }: { next: string }) {
  return (
    <div className="max-w-sm">
      <Head title="Sign in" />
      <h1>Sign in</h1>
      <p className="lede">
        Demo accounts: <code>demo@fondu.dev</code> / <code>fondu-demo</code>, or the admin <code>admin@fondu.dev</code>{' '}
        / <code>fondu-admin</code>.
      </p>
      {/* wrong credentials: back to this page with the errors (Inertia keeps what was typed) */}
      <Form
        action={href('/login')}
        method="post"
        options={{ replace: true }}
        resetOnError={['password']}
        className="grid gap-4"
      >
        {({ errors, processing }) => (
          <>
            <input type="hidden" name="next" value={next} />
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
              autoComplete="current-password"
              error={errors.password}
              testid="err-password"
            />
            <button className="btn btn-primary justify-center" disabled={processing}>
              {processing ? 'Signing in…' : 'Sign in'}
            </button>
          </>
        )}
      </Form>
      <p className="note mt-4">
        No account? <Link href={href('/signup')}>Create one</Link>
      </p>
    </div>
  )
}
