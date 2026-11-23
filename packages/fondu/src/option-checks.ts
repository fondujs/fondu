export const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

export const show = (v: unknown) => (typeof v === 'string' ? `'${v}'` : String(v))

export const portHint = (extra: string[]) =>
  extra.includes('port')
    ? '. There is no `port` option: the built server listens on the environment variable `PORT`, else 3000 (`PORT=8080 node dist/server/index.js`)'
    : ''
