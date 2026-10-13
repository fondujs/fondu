import { Form, Head, Link } from '@inertiajs/react'
import { href } from 'fondu/client'
import { InfoIcon } from 'lucide-react'

import { SubmitButton, TextField } from '#/components/demo.tsx'
import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert.tsx'

export default function Login({ next }: { next: string }) {
  return (
    <div className="max-w-sm">
      <Head title="Sign in" />
      <h1>Sign in</h1>
      <Alert variant="info" className="mb-6">
        <InfoIcon />
        <AlertTitle>Demo accounts</AlertTitle>
        <AlertDescription>
          <p>
            <code>demo@fondu.dev</code> / <code>fondu-demo</code>, or the admin <code>admin@fondu.dev</code> /{' '}
            <code>fondu-admin</code>
          </p>
        </AlertDescription>
      </Alert>
      {/* wrong credentials: back to this page with the errors (Inertia keeps what was typed) */}
      <Form
        action={href('/login')}
        method="post"
        options={{ replace: true }}
        resetOnError={['password']}
        showProgress={false}
        className="grid gap-4"
      >
        {({ errors }) => (
          <>
            <input type="hidden" name="next" value={next} />
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
              autoComplete="current-password"
              error={errors.password}
              testid="err-password"
            />
            <SubmitButton>Sign in</SubmitButton>
          </>
        )}
      </Form>
      <p className="mt-4 text-sm text-muted-foreground">
        No account? <Link href={href('/signup')}>Create one</Link>
      </p>
    </div>
  )
}
