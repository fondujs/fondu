import { defer, defineHandler, once, render } from 'fondu'

const slow = async <T>(value: T) => {
  await new Promise((r) => setTimeout(r, 700))
  return value
}
const now = () => new Date().toISOString().slice(11, 23)

// Once the client holds `plans` and `rates`, it lists them in X-Inertia-Except-Once-Props and the server skips
// their (slow) functions. `?fresh` sends `plans` anyway. `permissions` is deferred the first time only: once held, it
// is neither sent nor asked for again.
export const loader = defineHandler((c) =>
  render(c, 'once', {
    which: c.req.query('page') === 'second' ? 'second' : 'first',
    renderedAt: now(),
    plans: once(() => slow(now()), { fresh: c.req.query('fresh') !== undefined }),
    rates: once(() => slow(now()), { ttl: 15 }),
    permissions: once(defer(() => slow(now()))),
  }),
)
