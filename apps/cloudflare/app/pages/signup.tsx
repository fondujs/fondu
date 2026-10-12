import { Form, Head, Link } from '@inertiajs/react'
import { href } from 'fondu/client'

export default function Signup() {
  return (
    <div className="max-w-sm">
      <Head title="Create an account" />
      <h1>Create an account</h1>
      <p className="lede">Accounts, sessions and passwords are Better Auth's; this page posts to an action that calls it.</p>
      <Form action={href('/signup')} method="post" resetOnError={['password']} className="grid gap-4" data-testid="signup">
        {({ errors, processing }) => (
          <>
            <label className="field">Name<input className="input" name="name" autoComplete="name" />{errors.name && <span className="err">{errors.name}</span>}</label>
            <label className="field">Email<input className="input" name="email" type="email" autoComplete="username" />{errors.email && <span className="err" data-testid="err-email">{errors.email}</span>}</label>
            <label className="field">Password<input className="input" name="password" type="password" autoComplete="new-password" />{errors.password && <span className="err">{errors.password}</span>}</label>
            <button className="btn btn-primary justify-center" disabled={processing}>Create account</button>
          </>
        )}
      </Form>
      <p className="note mt-4">Have one? <Link href={href('/login')}>Sign in</Link></p>
    </div>
  )
}
