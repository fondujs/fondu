import { href, type Errors } from 'fondu/client'
import { InfoIcon } from 'lucide-react'

import { SubmitButton, TextField, Title } from '#/components/demo.tsx'
import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert.tsx'

export default function Login({ next, errors }: { next: string; errors: Errors }) {
  return (
    <div className="max-w-sm">
      <Title>Sign in</Title>
      <h1>Sign in</h1>
      <Alert variant="info" className="mb-6">
        <InfoIcon />
        <AlertTitle>Demo accounts</AlertTitle>
        <AlertDescription>
          <p>
            <code>demo@fondu.dev</code> / <code>fondu-demo</code>, or the admin{' '}
            <code>admin@fondu.dev</code> / <code>fondu-admin</code>
          </p>
        </AlertDescription>
      </Alert>
      {/* wrong credentials: back to this page with the errors, what was typed kept */}
      <form action={href('/login')} method="post" className="grid gap-4">
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
      </form>
      <p className="mt-4 text-sm text-muted-foreground">
        No account? <a href={href('/signup')}>Create one</a>
      </p>
    </div>
  )
}
