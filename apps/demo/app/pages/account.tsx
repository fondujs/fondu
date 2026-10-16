import { Form, Head } from '@inertiajs/react'
import { href } from 'fondu/client'

import { DemoCard, SubmitButton, TextField } from '#/components/demo.tsx'
import { Card, CardPanel } from '#/components/ui/card.tsx'

interface Props {
  account: { name: string; email: string; role: string }
}

export default function Account({ account }: Props) {
  return (
    <>
      <Head title="Account" />
      <h1>Account</h1>
      <p className="lede">
        A protected page (<code>requireUser</code>): guests are sent to sign in first. The form
        works without JavaScript.
      </p>
      <div className="grid gap-4 md:grid-cols-[1fr_16rem]">
        <DemoCard title="Profile">
          <Form action={href('/account')} method="post" showProgress={false} className="grid gap-4">
            {({ errors }) => (
              <>
                <TextField
                  label="Display name"
                  name="name"
                  defaultValue={account.name}
                  error={errors.name}
                  testid="err-name"
                />
                <SubmitButton>Save profile</SubmitButton>
              </>
            )}
          </Form>
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
