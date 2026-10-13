import { Form, Head } from '@inertiajs/react'
import { href } from 'fondu/client'
import { useState } from 'react'

import { DemoCard } from '#/components/demo.tsx'
import { Button } from '#/components/ui/button.tsx'

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
      <div className="grid gap-4 sm:grid-cols-2">
        <DemoCard title="A sensitive prop">
          <p className="font-mono">{secret}</p>
        </DemoCard>
        <DemoCard title="In history.state">
          {stored ? (
            <p className="mb-3 font-mono" data-testid="stored">
              {stored}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={read} data-testid="read">
              Read history.state.page
            </Button>
            <Form action={href('/history?clear')} method="post">
              <Button type="submit" data-testid="clear">
                Clear history
              </Button>
            </Form>
          </div>
        </DemoCard>
      </div>
    </>
  )
}
