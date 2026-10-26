import { defineHandler, render, withoutSsr } from 'fondu'

import Ssr from './index.tsx'

// this route only: rendered in the browser (a whole directory: `export default withoutSsr()` in its _middleware.ts);
// its page is /ssr's
export const loader = defineHandler(withoutSsr(), (c) => render(c, Ssr, { ssr: false }))

export default Ssr
