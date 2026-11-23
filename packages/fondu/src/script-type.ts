const RUNS = /^(?:module|importmap|speculationrules)$/i
const JAVASCRIPT =
  /^(?:(?:application|text)\/(?:x-)?(?:java|ecma)script|text\/(?:javascript1\.[0-5]|jscript|livescript))$/i

// Data blocks (`application/json`, `ld+json`) never run, so they need no nonce or hash
export function runsAsScript(attrs: string): boolean {
  const match = /\stype\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(attrs)
  const type = (match?.[1] ?? match?.[2] ?? match?.[3] ?? '').trim()
  return type === '' || RUNS.test(type) || JAVASCRIPT.test(type)
}
