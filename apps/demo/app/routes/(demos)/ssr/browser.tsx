import { defineHandler, render, withoutSsr } from 'fondu'

import Ssr from './index.tsx'

export const loader = defineHandler(withoutSsr(), (c) => render(c, Ssr, { ssr: false }))

export default Ssr
