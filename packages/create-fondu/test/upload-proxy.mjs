import { channel } from 'node:diagnostics_channel'

// Loaded by the temporary Vite config in dev and preview. Observe the forwarding request, not the test client's fetch.
channel('undici:request:error').subscribe(({ request, error }) => {
  if (request.method !== 'POST' || error.code !== 'EPIPE' || error.syscall !== 'write') return
  const id = /^\/upload\?fondu_probe=([\da-f-]+)$/.exec(request.path)?.[1]
  if (id) console.log(`fondu:upload ${id} proxy write EPIPE`)
})
