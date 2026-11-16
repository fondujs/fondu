import { afterEach, describe, expect, test } from 'vitest'

import { checkExports } from '../src/server/app.js'
import { buildClient, tempApp } from './support/build.js'

const page = 'export default function Page() { return <p>page</p> }\n'
let app: ReturnType<typeof tempApp> | undefined
afterEach(() => app?.remove())

describe('server exports of a layout or an error page', () => {
  for (const file of ['_layout.tsx', '_error.tsx'])
    for (const name of ['loader', 'action', 'actions'])
      test(`${file} exporting ${name} fails the build, as the server does at startup`, async () => {
        app = tempApp({
          'app/routes/index.tsx': page,
          [`app/routes/${file}`]: `export default function X() { return null }\nexport const ${name} = () => ({})\n`,
        })
        const message = `fondu: routes/${file} exports \`${name}\`. It exports its component only (default)`
        await expect(buildClient(app.root)).rejects.toThrow(message)
        // the server's own check, at startup, says the same
        expect(() => checkExports(file, { default: () => null, [name]: () => ({}) })).toThrow(
          message,
        )
      })
})

describe('a layout that is fine', () => {
  test('builds', async () => {
    app = tempApp({
      'app/routes/index.tsx': page,
      'app/routes/_layout.tsx': 'export default function L({ children }) { return children }\n',
      'app/routes/_error.tsx': 'export default function E() { return null }\n',
    })
    await buildClient(app.root)
  })
})
