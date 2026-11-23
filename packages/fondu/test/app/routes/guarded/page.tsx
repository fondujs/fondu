import { defineHandler } from 'fondu'

export const action = defineHandler((c) => c.text('done'))

export default function Page() {
  return null
}
