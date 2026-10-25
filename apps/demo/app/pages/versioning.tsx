import { useState } from 'react'

import { DemoCard, Json, Title } from '#/components/demo.tsx'
import { Button } from '#/components/ui/button.tsx'

export default function Versioning() {
  const [answer, setAnswer] = useState<unknown>(null)
  // what a tab still running the previous deploy sends on its next navigation
  const navigateAsOldDeploy = async () => {
    const response = await fetch(location.pathname, {
      headers: { 'X-Fondu': 'true', 'X-Fondu-Version': 'a-previous-deploy' },
    })
    setAnswer({
      status: response.status,
      'X-Fondu-Location': response.headers.get('x-fondu-location'),
    })
  }
  return (
    <>
      <Title>Asset versioning</Title>
      <h1>Asset versioning</h1>
      <p className="lede">
        Every navigation carries the version of the assets the page was loaded with. After a deploy
        the versions differ, and the server answers <code>409</code> with{' '}
        <code>X-Fondu-Location</code>: the client loads the page as a document, with the new assets.
      </p>
      <div className="grid gap-4 sm:max-w-md">
        <DemoCard title="A navigation from the previous deploy">
          <Button className="mb-4" onClick={navigateAsOldDeploy} data-testid="stale">
            Send a stale version
          </Button>
          {answer ? <Json value={answer} data-testid="stale-answer" /> : null}
        </DemoCard>
      </div>
    </>
  )
}
