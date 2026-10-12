import { Form, Head } from '@inertiajs/react'
import { href } from 'fondu/client'
import { useState } from 'react'

import { Card } from '#/components/ui.tsx'

export default function History({ secret }: { secret: string }) {
  const [stored, setStored] = useState<string | null>(null)
  // what the browser holds for this history entry: Inertia's page state, encrypted
  const read = () => {
    const state = (window.history.state as { page?: unknown } | null)?.page
    setStored(
      state instanceof ArrayBuffer
        ? `encrypted: ${state.byteLength} bytes`
        : (JSON.stringify(state)?.slice(0, 80) ?? 'nothing'),
    )
  }
  return (
    <>
      <Head title="History encryption" />
      <h1>History encryption</h1>
      <p className="lede">
        Rendered with <code>encryptHistory: true</code>: Inertia encrypts this page's state in the browser history, so
        after signing out nobody can press Back to see it. <code>clearHistory(c)</code> discards the key, making every
        encrypted entry unreadable.
      </p>
      <div className="grid-cards">
        <Card title="A sensitive prop">
          <p className="font-mono text-[13px]">{secret}</p>
        </Card>
        <Card title="In history.state">
          {stored ? (
            <p className="mb-3 font-mono text-[13px]" data-testid="stored">
              {stored}
            </p>
          ) : null}
          <div className="flex gap-2">
            <button className="btn" onClick={read} data-testid="read">
              Read history.state.page
            </button>
            <Form action={href('/history?clear')} method="post">
              <button className="btn btn-primary" data-testid="clear">
                Clear history
              </button>
            </Form>
          </div>
        </Card>
      </div>
    </>
  )
}
