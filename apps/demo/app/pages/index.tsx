import { Head, Link } from '@inertiajs/react'

import { groups } from '#/components/demos.ts'
import { Card, CardDescription, CardHeader, CardTitle } from '#/components/ui/card.tsx'

export default function Overview() {
  return (
    <>
      <Head title="Overview" />
      <h1>Fondu demo</h1>
      <p className="lede">
        A Fondu app: each page is a route in <code>routes/</code> that renders a React page, and
        Fondu answers Inertia's protocol from Hono, on Cloudflare Workers with D1 and Better Auth.
        Each demo shows one feature, with the code that makes it work. The docs are on{' '}
        <a href="https://fondu.dev/docs">fondu.dev</a>.
      </p>
      {groups.map(([group, demos]) => (
        <section key={group} className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">{group}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {demos.map(([url, title, text]) => (
              <Card
                key={url}
                render={<Link href={url} prefetch />}
                className="transition-colors hover:border-foreground/16"
              >
                <CardHeader className="p-5">
                  <CardTitle className="text-base">{title}</CardTitle>
                  <CardDescription>{text}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>
      ))}
    </>
  )
}
