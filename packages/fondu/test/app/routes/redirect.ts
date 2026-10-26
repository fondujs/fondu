import { defineHandler } from 'fondu'

export const loader = defineHandler((c) => c.redirect('/', 302))

export const actions = {
  away: defineHandler((c) => c.redirect('https://example.com/', 303)),
  home: defineHandler((c) => c.redirect('/', 303)),
  // an open redirect to a URL that runs: never turned into a document load
  script: defineHandler((c) => c.redirect('javascript:alert(1)', 303)),
  nothing: defineHandler((c) => c.body(null)),
  fragment: defineHandler((c) => c.redirect('/notes#end', 303)),
}
