import { Head, usePage } from '@inertiajs/react'
import { useState } from 'react'

import { DemoCard, Json } from '#/components/demo.tsx'
import { Button } from '#/components/ui/button.tsx'

export default function Versioning() {
  const { version } = usePage()
  const [answer, setAnswer] = useState<unknown>(null)
  // what a tab still running the previous deploy sends on its next visit
  const visitAsOldDeploy = async () => {
    const response = await fetch(location.pathname, {
      headers: { 'X-Inertia': 'true', 'X-Inertia-Version': 'a-previous-deploy' },
    })
    setAnswer({
      status: response.status,
      'X-Inertia-Location': response.headers.get('x-inertia-location'),
    })
  }
  return (
    <>
      <Head title="Asset versioning" />
      <h1>Asset versioning</h1>
      <p className="lede">
        Every Inertia request carries the version of the assets the page was loaded with. After a
        deploy the versions differ, and the server answers <code>409</code> with{' '}
        <code>X-Inertia-Location</code>: the client loads the page again as a document, with the new
        assets.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <DemoCard title="This page's version">
          <p className="font-mono break-all" data-testid="version">
            {version ?? 'null'}
          </p>
          <p className="mt-2 text-muted-foreground">
            A hash of the client build's manifest; <code>null</code> in development, where nothing
            is checked.
          </p>
        </DemoCard>
        <DemoCard title="A visit from the previous deploy">
          <Button className="mb-4" onClick={visitAsOldDeploy} data-testid="stale">
            Send a stale version
          </Button>
          {answer ? <Json value={answer} data-testid="stale-answer" /> : null}
        </DemoCard>
      </div>
    </>
  )
}
