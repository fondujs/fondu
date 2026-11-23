import { defineHandler } from 'fondu'

export const action = defineHandler((c) => c.text('acted'))

export default function Single() {
  return null
}
