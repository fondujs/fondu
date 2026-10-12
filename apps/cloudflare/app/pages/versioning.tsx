import { Head, usePage } from '@inertiajs/react'
import { useState } from 'react'

import { Card, Json } from '#/components/ui.tsx'

export default function Versioning() {
  const { version } = usePage()
  const [answer, setAnswer] = useState<unknown>(null)
  // what a tab still running the previous deploy sends on its next visit
  const visitAsOldDeploy = async () => {
    const response = await fetch(location.pathname, {
      headers: { 'X-Inertia': 'true', 'X-Inertia-Version': 'a-previous-deploy' },
    })
    setAnswer({ status: response.status, 'X-Inertia-Location': response.headers.get('x-inertia-location') })
  }
  return (
    <>
      <Head title="Asset versioning" />
      <h1>Asset versioning</h1>
      <p className="lede">
        Every Inertia request carries the version of the assets the page was loaded with. After a deploy the versions
        differ, and the server answers <code>409</code> with <code>X-Inertia-Location</code>: the client loads the page
        again as a document, with the new assets.
      </p>
      <div className="grid-cards">
        <Card title="This page's version">
          <p className="font-mono text-[13px]" data-testid="version">
            {version ?? 'null'}
          </p>
          <p className="note mt-2">
            A hash of the client build's manifest; <code>null</code> in development, where nothing is checked.
          </p>
        </Card>
        <Card title="A visit from the previous deploy">
          <button className="btn btn-primary mb-3" onClick={visitAsOldDeploy} data-testid="stale">
            Send a stale version
          </button>
          {answer ? <Json value={answer} data-testid="stale-answer" /> : null}
        </Card>
      </div>
    </>
  )
}
