import { defineHandler, flash, render } from 'fondu'
import { type Errors, href } from 'fondu/client'
import { InfoIcon } from 'lucide-react'
import * as z from 'zod/mini'

import { SubmitButton, TextField, Title } from '#/components/demo.tsx'
import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert.tsx'
import { callAuth, safeNext } from '#/modules/auth/auth.server.ts'

export const loader = defineHandler(async (c) => {
  // Better Auth's own errors (onAPIError.errorURL) arrive as ?error=: shown once, as a toast
  const error = c.req.query('error')
  if (error) {
    flash(c, { error: `Sign-in failed: ${error.replaceAll('_', ' ').toLowerCase()}` })
    return c.redirect('/login', 303)
  }
  if (c.get('user')) return c.redirect('/account', 303) // already signed in
  return render(c, Login, { next: safeNext(c, c.req.query('next')) })
})

// Better Auth checks the password and starts the session; a wrong one: one message that doesn't say which part
export const action = defineHandler.withValidator({
  body: z.object({
    email: z.email('Enter a valid email'),
    password: z.string().check(z.minLength(1, 'Enter your password')),
    next: z.optional(z.string()),
  }),
})(async (c, { body }) => {
  const { user } = await callAuth<{ user: { name: string } }>(
    c,
    '/sign-in/email',
    { email: body.email, password: body.password },
    'email',
  )
  flash(c, { message: `Signed in as ${user.name}` })
  return c.redirect(safeNext(c, body.next), 303)
})

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
