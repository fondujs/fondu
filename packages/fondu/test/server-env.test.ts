import { spawnSync } from 'node:child_process'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { type BuiltApp, buildApp, start } from './build-app.js'

const hasBun = spawnSync('bun', ['--version']).status === 0

// a loader reads NODE_ENV when it runs, and React's own build: a development element has a `_store`
const page = `import { createElement } from 'react'
import { defineHandler, render } from 'fondu'

export const loader = defineHandler((c) =>
  render(c, Env, { env: String(process.env.NODE_ENV), react: '_store' in createElement('i') ? 'development' : 'production' }),
)

export default function Env() {
  return <p>env</p>
}
`

const seen = async (url: string) => {
  const html = await (await fetch(url, { headers: { accept: 'text/html' } })).text()
  const json = /<script data-page="app" type="application\/json">(.*?)<\/script>/.exec(html)![1]!
  const { env, react } = (JSON.parse(json) as { props: { env: string; react: string } }).props
  return `${env}/${react}`
}

describe('a built server and NODE_ENV', () => {
  let app: BuiltApp
  beforeAll(async () => {
    app = await buildApp({ 'app/routes/index.tsx': page })
  }, 120_000)
  afterAll(() => app?.remove())

  test('Node, unset: production, and React’s production build', async () => {
    const server = await start(app)
    try {
      expect(await seen(server.url)).toBe('production/production')
    } finally {
      await server.stop()
    }
  })
  test('Node, NODE_ENV=production: as before', async () => {
    const server = await start(app, { NODE_ENV: 'production' })
    try {
      expect(await seen(server.url)).toBe('production/production')
    } finally {
      await server.stop()
    }
  })
  test('Node, NODE_ENV=development: kept', async () => {
    const server = await start(app, { NODE_ENV: 'development' })
    try {
      expect(await seen(server.url)).toBe('development/development')
    } finally {
      await server.stop()
    }
  })
})

describe.skipIf(!hasBun)('a built Bun server and NODE_ENV', () => {
  let app: BuiltApp
  beforeAll(async () => {
    app = await buildApp({ 'app/routes/index.tsx': page }, { target: 'bun' })
  }, 120_000)
  afterAll(() => app?.remove())

  test('unset: production, and React’s production build', async () => {
    const server = await start(app, {}, 'bun')
    try {
      expect(await seen(server.url)).toBe('production/production')
    } finally {
      await server.stop()
    }
  })
  test('NODE_ENV=development: kept', async () => {
    const server = await start(app, { NODE_ENV: 'development' }, 'bun')
    try {
      expect(await seen(server.url)).toBe('development/development')
    } finally {
      await server.stop()
    }
  })
})
