import { back, defineHandler, flash } from 'fondu'
import { href, reload, usePage } from 'fondu/client'
import * as z from 'zod/mini'

import { DemoCard, Json, SubmitButton, Title } from '#/components/demo.tsx'
import { Button } from '#/components/ui/button.tsx'
import { cn } from '#/lib/utils.ts'

export const actions = {
  // POST /flash?saved — the next page gets `flash.message`; the layout shows it as a toast
  saved: defineHandler((c) => {
    flash(c, { message: 'Saved, said the server' })
    return back(c)
  }),
  // POST /flash?failed — `flash.error`: a toast of its own kind
  failed: defineHandler((c) => {
    flash(c, { error: 'Not saved: the server said no' })
    return back(c)
  }),
  // POST /flash?pick — data of your own, for the page to use as it likes
  pick: defineHandler.withValidator({
    body: z.object({ color: z.enum(['gold', 'teal', 'plum']) }),
  })((c, { body }) => {
    flash(c, { picked: body.color })
    return back(c)
  }),
}

const colors = { gold: 'bg-brand', teal: 'bg-teal-500', plum: 'bg-fuchsia-700' } as const

export default function Flash() {
  const { flash } = usePage()
  return (
    <>
      <Title>Flash data</Title>
      <h1>Flash data</h1>
      <p className="lede">
        An action calls <code>flash(c, …)</code> before it redirects, and the next page gets the
        data in <code>usePage().flash</code>, once: Fondu carries it in a short cookie, as Laravel
        does in its session. A reload, or any page after, has none.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <DemoCard title="Toasts" tag="flash(c, { message }), usePage().flash">
          <p className="mb-4 text-muted-foreground">
            The layout shows each page&apos;s <code>message</code> and <code>error</code> as toasts.
          </p>
          <div className="flex flex-wrap gap-2">
            <form action={href('/flash?saved')} method="post">
              <SubmitButton data-testid="flash-saved">Save</SubmitButton>
            </form>
            <form action={href('/flash?failed')} method="post">
              <SubmitButton variant="outline" data-testid="flash-failed">
                Fail
              </SubmitButton>
            </form>
          </div>
        </DemoCard>
        <DemoCard title="Data of your own" tag="flash(c, { picked })">
          <div className="mb-4 flex flex-wrap gap-2">
            {(Object.keys(colors) as Array<keyof typeof colors>).map((color) => (
              <form key={color} action={href('/flash?pick')} method="post">
                <input type="hidden" name="color" value={color} />
                <SubmitButton variant="outline" data-testid={`pick-${color}`}>
                  <span className={cn('size-3 rounded-full', colors[color])} aria-hidden />
                  {color}
                </SubmitButton>
              </form>
            ))}
          </div>
          <p className="text-muted-foreground" data-testid="picked">
            {flash.picked
              ? `Picked ${flash.picked}, on this page only`
              : 'Nothing picked on this page'}
          </p>
        </DemoCard>
        <DemoCard title="This page's flash" tag="usePage().flash" className="md:col-span-2">
          <Json value={flash} data-testid="flash-json" />
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => reload()}
            data-testid="flash-reload"
          >
            Reload: none left
          </Button>
        </DemoCard>
      </div>
    </>
  )
}
