import { defineHandler } from 'fondu'

// a page with an action in a guarded directory
export const action = defineHandler((c) => c.text('done'))

export default function Page() {
  return null
}
