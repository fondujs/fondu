import { defineHandler } from 'fondu'

export const loader = defineHandler((c) => c.text('loaded'))

export default function LoaderOnly() {
  return null
}
