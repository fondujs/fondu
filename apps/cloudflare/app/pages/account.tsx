import { Form, Head } from '@inertiajs/react'
import { href } from 'fondu/client'
import { Card } from '../components/ui'

interface Props {
  account: { name: string; email: string; image: string | null; role: string }
}

export default function Account({ account }: Props) {
  return (
    <>
      <Head title="Account" />
      <h1>Account</h1>
      <p className="lede">A protected page (<code>requireUser</code>): guests are sent to sign in first. The form uploads a file, and works without JavaScript.</p>
      <div className="grid gap-4 md:grid-cols-[1fr_16rem]">
        <Card title="Profile">
          {/* multipart, so the avatar also uploads without JavaScript */}
          <Form action={href('/account')} method="post" encType="multipart/form-data" resetOnSuccess={['avatar']} className="grid gap-4">
            {({ errors, processing }) => (
              <>
                <label className="field">
                  Display name
                  <input className="input" name="name" defaultValue={account.name} />
                  {errors.name && <span className="err" data-testid="err-name">{errors.name}</span>}
                </label>
                <label className="field">
                  Avatar
                  <input className="text-[13px] font-normal file:mr-3 file:rounded-md file:border file:border-line file:bg-surface file:px-3 file:py-1" type="file" name="avatar" accept="image/png,image/jpeg,image/gif,image/webp" />
                  <span className="note font-normal">An image, up to 256 kB.</span>
                  {errors.avatar && <span className="err" data-testid="err-avatar">{errors.avatar}</span>}
                </label>
                <button className="btn btn-primary justify-center" disabled={processing}>{processing ? 'Saving…' : 'Save profile'}</button>
              </>
            )}
          </Form>
        </Card>
        <section className="card h-fit text-[13px]">
          <div className="mb-4 flex items-center gap-3">
            {account.image
              ? <img src={account.image} alt="" className="size-12 rounded-full object-cover" data-testid="avatar" />
              : <span className="grid size-12 place-items-center rounded-full bg-accent-soft font-semibold text-accent">{account.name.slice(0, 1)}</span>}
            <span className="font-medium">{account.name}</span>
          </div>
          <dl className="grid grid-cols-[4rem_1fr] gap-y-1.5">
            <dt className="text-muted">Email</dt><dd data-testid="account-email">{account.email}</dd>
            <dt className="text-muted">Role</dt><dd data-testid="account-role">{account.role}</dd>
          </dl>
        </section>
      </div>
    </>
  )
}
