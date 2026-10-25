import { href, type Errors } from 'fondu/client'
import { TriangleAlertIcon } from 'lucide-react'

import { SubmitButton, TextField, Title } from '#/components/demo.tsx'
import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert.tsx'

export default function Signup({ errors }: { errors: Errors }) {
  return (
    <div className="max-w-sm">
      <Title>Create an account</Title>
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
      <form action={href('/signup')} method="post" className="grid gap-4" data-testid="signup">
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
      </form>
      <p className="mt-4 text-sm text-muted-foreground">
        Have one? <a href={href('/login')}>Sign in</a>
      </p>
    </div>
  )
}
