import { createApp } from 'fondu'

// a small limit: e2e/refused.spec.ts sends a file just over it (Firefox and WebKit lose the answer to a large
// upload the server refuses without reading it)
export default createApp({ bodyLimit: 16 * 1024 })
