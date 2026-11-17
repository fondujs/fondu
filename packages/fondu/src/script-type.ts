/** the types of a script the browser runs, other than JavaScript (which `script-src` governs too) */
const RUNS = /^(?:module|importmap|speculationrules)$/i
/** a JavaScript MIME type, as the HTML standard lists them */
const JAVASCRIPT =
  /^(?:(?:application|text)\/(?:x-)?(?:java|ecma)script|text\/(?:javascript1\.[0-5]|jscript|livescript))$/i

/**
 * Whether the browser runs a `<script>` with these attributes (the text between `<script` and `>`), so that the
 * Content Security Policy has to allow it: no `type`, a JavaScript MIME type, `module`, `importmap` or
 * `speculationrules`. Any other type (`application/ld+json`, `application/json`) is a data block: never run, so
 * it needs neither a nonce nor a hash.
 */
export function runsAsScript(attrs: string): boolean {
  const match = /\stype\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(attrs)
  const type = (match?.[1] ?? match?.[2] ?? match?.[3] ?? '').trim()
  return type === '' || RUNS.test(type) || JAVASCRIPT.test(type)
}
