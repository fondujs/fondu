import type { CreateAppOptions } from './app.js'

const KEYS = ['document', 'trailingSlash', 'csrf', 'bodyLimit', 'secureHeaders']

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const show = (v: unknown) => (typeof v === 'string' ? `'${v}'` : String(v))

export function checkAppOptions(options: unknown): asserts options is CreateAppOptions | undefined {
  const fail = (message: string): never => {
    throw new Error(`fondu: createApp(): ${message}`)
  }
  if (options === undefined) return
  if (!isObject(options))
    return fail('the options are an object, or none: `createApp({ bodyLimit: 1e6 })`')
  const extra = Object.keys(options).filter((k) => !KEYS.includes(k))
  if (extra.length)
    fail(
      `unknown option${extra.length > 1 ? 's' : ''} ${extra.map((k) => `\`${k}\``).join(', ')}. The options are ${KEYS.join(', ')}` +
        (extra.includes('port')
          ? '. There is no `port` option: the built server listens on the environment variable `PORT`, else 3000 (`PORT=8080 node dist/server/index.js`)'
          : ''),
    )
  const { document, trailingSlash, csrf, bodyLimit, secureHeaders } = options
  if (document !== undefined && typeof document !== 'function')
    fail(`\`document\` must be a function, ({ head, body }) => string, not ${show(document)}`)
  if (trailingSlash !== undefined && trailingSlash !== 'trim' && trailingSlash !== 'append')
    fail(`\`trailingSlash\` must be 'trim' or 'append', not ${show(trailingSlash)}`)
  for (const [name, value] of Object.entries({ csrf, secureHeaders }))
    if (value !== undefined && value !== false && !isObject(value))
      fail(
        `\`${name}\` must be false or an object (the options of hono/${name === 'csrf' ? 'csrf' : 'secure-headers'}), not ${show(value)}`,
      )
  if (
    bodyLimit !== undefined &&
    bodyLimit !== false &&
    !(typeof bodyLimit === 'number' && Number.isFinite(bodyLimit) && bodyLimit > 0)
  )
    fail(`\`bodyLimit\` must be a number of bytes above 0, or false, not ${show(bodyLimit)}`)
}
