import { defineHandler, flash, render } from 'fondu'
import { type Errors, href } from 'fondu/client'
import { TriangleAlertIcon } from 'lucide-react'
import * as z from 'zod/mini'

import { SubmitButton, TextField, Title } from '#/components/demo.tsx'
import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert.tsx'
import { callAuth } from '#/modules/auth/auth.server.ts'

export const loader = defineHandler(async (c) =>
  c.get('user') ? c.redirect('/account', 303) : render(c, Signup),
)

export const action = defineHandler.withValidator({
  body: z.object({
    name: z.string().check(z.trim(), z.minLength(2, 'At least 2 characters')),
    email: z.email('Enter a valid email'),
    password: z.string().check(z.minLength(8, 'At least 8 characters')),
  }),
})(async (c, { body }) => {
  await callAuth(c, '/sign-up/email', body, 'email')
  flash(c, { message: `Welcome, ${body.name}` })
  return c.redirect('/account', 303)
})

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
