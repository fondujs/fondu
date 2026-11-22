import { randomUUID } from 'node:crypto'
import { appendFileSync, copyFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout } from 'node:timers/promises'

// Only the temporary Cloudflare app: observe what the real Worker returned, before the proxy forwards it.
export function observeUploads(app) {
  const entry = join(app, 'app/server.ts')
  renameSync(entry, join(app, 'app/server-under-test.ts'))
  writeFileSync(
    entry,
    `import app from './server-under-test'

const handle = app.fetch.bind(app)
app.fetch = async (...args) => {
  const res = await handle(...args)
  const url = new URL(args[0].url)
  const id = url.searchParams.get('fondu_probe')
  if (id && args[0].method === 'POST' && url.pathname === '/upload')
    console.log('fondu:upload ' + id + ' worker ' + res.status)
  return res
}
export default app
`,
  )
  copyFileSync(new URL('./upload-proxy.mjs', import.meta.url), join(app, 'upload-proxy.mjs'))
  appendFileSync(join(app, 'vite.config.ts'), "\nimport './upload-proxy.mjs'\n")
}

// Only complete records for this POST count; neither a previous 413 nor another request's EPIPE explains a 500.
export function uploadEvidence(log, id) {
  const lines = log.split(/\r?\n/).slice(0, -1)
  const prefix = `fondu:upload ${id} worker `
  const workers = lines.filter((line) => line.startsWith(prefix))
  return {
    worker: workers.length === 1 ? workers[0].slice(prefix.length) : undefined,
    pipe: lines.includes(`fondu:upload ${id} proxy write EPIPE`),
  }
}

export function knownProxyFailure(big, evidence) {
  return big.status === 500 && !big.error && evidence.worker === '413' && evidence.pipe
}

export function received(small) {
  return small.status === 200 && small.text === 'received'
}

async function post(base, body) {
  const id = randomUUID()
  let status
  try {
    const res = await fetch(`${base}/upload?fondu_probe=${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(20_000),
      redirect: 'manual',
    })
    status = res.status
    return { id, status, text: await res.text() }
  } catch (error) {
    return { id, status, error: String(error) }
  }
}

// Real matched POST (a prerendered home or a missing route wouldn't exercise the limit), once per size.
export async function bodyLimit(base, log, target, script, check) {
  const from = log().length
  const big = await post(base, 'a'.repeat(10 * 1024 * 1024 + 1))
  const small = await post(base, '{}')
  const name = `${target} ${script}`
  let known = false
  let detail = `id=${big.id}, client=${big.status ?? 'no status'}${big.error ? `, ${big.error}` : ''}`
  if (target === 'cloudflare' && (script === 'dev' || script === 'preview')) {
    let evidence
    for (let i = 0; ; i++) {
      evidence = uploadEvidence(log().slice(from), big.id)
      if (i === 20 || (evidence.worker && (big.status !== 500 || evidence.pipe))) break
      await setTimeout(100)
    }
    detail += `, worker=${evidence.worker ?? 'not observed'}, write EPIPE=${evidence.pipe}`
    check(`${name}: the Worker returned 413`, evidence.worker === '413', detail)
    known = knownProxyFailure(big, evidence)
    if (known)
      console.log(`XFAIL #298  ${name}: client=500, worker=413, proxy=write EPIPE (id=${big.id})`)
  }
  if (!known) check(`${name}: the client received 413`, big.status === 413 && !big.error, detail)
  check(
    `${name}: a small upload gets 200 and reaches the handler`,
    received(small),
    `client=${small.status ?? 'no status'}, ${small.error ?? JSON.stringify(small.text?.slice(0, 80))}`,
  )
}
