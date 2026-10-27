import { defineHandler } from 'fondu'

export const loader = defineHandler((c) => c.redirect('/', 302))

export const actions = {
  away: defineHandler((c) => c.redirect('https://example.com/', 303)),
  home: defineHandler((c) => c.redirect('/', 303)),
  // an open redirect to a URL that runs: never turned into a document load
  script: defineHandler((c) => c.redirect('javascript:alert(1)', 303)),
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
