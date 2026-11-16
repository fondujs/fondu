import { createApp } from 'fondu'

export default createApp({
  // a small limit: e2e/refused.spec.ts sends a file just over it (Firefox and WebKit lose the answer to a large
  // upload the server refuses without reading it)
  bodyLimit: 16 * 1024,
  // Playwright's Firefox loses the `load` event of the first page of a context when its document has
  // `Cross-Origin-Opener-Policy: same-origin` (the default), and `page.goto()` waits for it until the test times out
  // (#190). These tests don't look at the header, so it is left off here
  secureHeaders: { crossOriginOpenerPolicy: false },
})
