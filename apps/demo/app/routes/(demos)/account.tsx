import { back, defineHandler, flash, render } from 'fondu'
import { type Errors, href } from 'fondu/client'
import * as z from 'zod/mini'

import { DemoCard, SubmitButton, TextField, Title } from '#/components/demo.tsx'
import { Card, CardPanel } from '#/components/ui/card.tsx'
import { callAuth, requireUser } from '#/modules/auth/auth.server.ts'

export const loader = defineHandler(requireUser, (c) => {
  const { name, email, role } = c.get('user')!
  return render(c, Account, { account: { name, email, role: role ?? 'user' } })
})

export const action = defineHandler.withValidator({
  body: z.object({
    name: z
      .string()
      .check(
        z.trim(),
        z.minLength(2, 'At least 2 characters'),
        z.maxLength(40, 'At most 40 characters'),
      ),
  }),
})(requireUser, async (c, { body }) => {
  // through Better Auth's handler: it also renews the session cookie, which holds the user (cookieCache)
  await callAuth(c, '/update-user', { name: body.name }, 'name')
  flash(c, { message: 'Profile saved' })
  return back(c)
})

interface Props {
  account: { name: string; email: string; role: string }
  errors: Errors
}

export default function Account({ account, errors }: Props) {
  return (
    <>
      <Title>Account</Title>
      <h1>Account</h1>
      <p className="lede">
        A protected page (<code>requireUser</code>): guests are sent to sign in first. The form
        works without JavaScript.
      </p>
      <div className="grid gap-4 md:grid-cols-[1fr_16rem]">
        <DemoCard title="Profile">
          <form action={href('/account')} method="post" className="grid gap-4">
            <TextField
              label="Display name"
              name="name"
              defaultValue={account.name}
              error={errors.name}
              testid="err-name"
            />
            <SubmitButton>Save profile</SubmitButton>
          </form>
        </DemoCard>
        <Card className="h-fit">
          <CardPanel className="p-5">
            <dl className="grid grid-cols-[4rem_1fr] gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Name</dt>
              <dd className="truncate font-medium">{account.name}</dd>
              <dt className="text-muted-foreground">Email</dt>
              <dd className="truncate" data-testid="account-email">
                {account.email}
              </dd>
              <dt className="text-muted-foreground">Role</dt>
              <dd data-testid="account-role">{account.role}</dd>
            </dl>
          </CardPanel>
        </Card>
      </div>
    </>
  )
}
