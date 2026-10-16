import { Form, Head, Link } from '@inertiajs/react'
import { href } from 'fondu/client'
import { TriangleAlertIcon } from 'lucide-react'

import { SubmitButton, TextField } from '#/components/demo.tsx'
import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert.tsx'

export default function Signup() {
  return (
    <div className="max-w-sm">
      <Head title="Create an account" />
      <h1>Create an account</h1>
      <p className="lede">
        Accounts, sessions and passwords are Better Auth's; this page posts to an action that calls
        it.
      </p>
      <Alert variant="warning" className="mb-6" data-testid="signup-off">
        <TriangleAlertIcon />
        <AlertTitle>Sign-up is turned off in this demo</AlertTitle>
        <AlertDescription>Sign in with one of its accounts instead.</AlertDescription>
      </Alert>
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
