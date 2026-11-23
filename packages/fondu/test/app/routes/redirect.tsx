import { defineHandler } from 'fondu'

export const loader = defineHandler((c) =>
  c.req.query('script') === undefined
    ? c.redirect('/', 302)
    : c.redirect('javascript:alert(1)', 302),
)

export const actions = {
  away: defineHandler((c) => c.redirect('https://example.com/', 303)),
  home: defineHandler((c) => c.redirect('/', 303)),
  // this site's own address, as a proxy's visitors know it
  absolute: defineHandler((c) => c.redirect('https://example.com/notes', 303)),
  // an open redirect to a URL that runs: never turned into a document load
  script: defineHandler((c) => c.redirect('javascript:alert(1)', 303)),
  data: defineHandler((c) => c.redirect('data:text/html,<script>alert(1)</script>', 303)),
  vbscript: defineHandler((c) => c.redirect('vbscript:msgbox(1)', 303)),
  padded: defineHandler((c) => c.redirect('\n JavaScript:alert(1)', 303)),
  app: defineHandler((c) => c.redirect('myapp://callback?code=1', 303)),
  mail: defineHandler((c) => c.redirect('mailto:a@b.c', 303)),
  nothing: defineHandler((c) => c.body(null)),
  // a stream that doesn't end (server-sent events)
  events: defineHandler((c) =>
    c.body(
      new ReadableStream({ start: (s) => s.enqueue(new TextEncoder().encode('data: 1\n\n')) }),
      200,
      { 'Content-Type': 'text/event-stream' },
    ),
  ),
  fragment: defineHandler((c) => c.redirect('/notes#end', 303)),
  // relative: to /notes, as this request's URL (/redirect) resolves it
  relative: defineHandler((c) => c.redirect('notes?a=1#end', 303)),
}

export default function Redirect() {
  return null
}
