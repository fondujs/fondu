import { defineHandler, render, withoutSsr } from 'fondu'

// this route only: rendered in the browser (a whole directory: `export default withoutSsr()` in its _middleware.ts)
export const loader = defineHandler(withoutSsr(), (c) => render(c, 'ssr', { ssr: false }))
