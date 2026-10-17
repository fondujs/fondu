import { Form, Head, router, usePage } from '@inertiajs/react'
import { href } from 'fondu/client'

import { DemoCard, Json } from '#/components/demo.tsx'
import { Button } from '#/components/ui/button.tsx'
import { cn } from '#/lib/utils.ts'

const colors = { gold: 'bg-brand', teal: 'bg-teal-500', plum: 'bg-fuchsia-700' } as const

export default function Flash() {
  const { flash } = usePage()
  return (
    <>
      <Head title="Flash data" />
      <h1>Flash data</h1>
      <p className="lede">
        An action calls <code>flash(c, …)</code> before it redirects, and the next page gets the
        data in <code>page.flash</code>, once: Fondu carries it in a short cookie, as Laravel does
        in its session. A reload, or any visit after, has none.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <DemoCard title="Toasts" tag="flash(c, { message }), router.on('flash')">
          <p className="mb-4 text-muted-foreground">
            The layout listens to Inertia&apos;s <code>flash</code> event and shows{' '}
            <code>message</code> and <code>error</code> as toasts.
          </p>
          <div className="flex flex-wrap gap-2">
            <Form action={href('/flash?saved')} method="post" options={{ preserveScroll: true }}>
              <Button type="submit" data-testid="flash-saved">
                Save
              </Button>
            </Form>
            <Form action={href('/flash?failed')} method="post" options={{ preserveScroll: true }}>
              <Button type="submit" variant="outline" data-testid="flash-failed">
                Fail
              </Button>
            </Form>
          </div>
        </DemoCard>
        <DemoCard title="Data of your own" tag="flash(c, { picked })">
          <div className="mb-4 flex flex-wrap gap-2">
            {(Object.keys(colors) as Array<keyof typeof colors>).map((color) => (
              <Form
                key={color}
                action={href('/flash?pick')}
                method="post"
                options={{ preserveScroll: true }}
              >
                <input type="hidden" name="color" value={color} />
                <Button type="submit" variant="outline" data-testid={`pick-${color}`}>
                  <span className={cn('size-3 rounded-full', colors[color])} aria-hidden />
                  {color}
                </Button>
              </Form>
            ))}
          </div>
          <p className="text-muted-foreground" data-testid="picked">
            {flash.picked
              ? `Picked ${flash.picked}, on this visit only`
              : 'Nothing picked on this visit'}
          </p>
        </DemoCard>
        <DemoCard title="This page's flash" tag="usePage().flash" className="md:col-span-2">
          <Json value={flash} data-testid="flash-json" />
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => router.reload()}
            data-testid="flash-reload"
          >
            Reload: none left
          </Button>
        </DemoCard>
      </div>
    </>
  )
}
