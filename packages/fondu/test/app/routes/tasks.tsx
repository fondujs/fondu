import { defineHandler } from 'fondu'

export const actions = {
  remove: defineHandler((c) => c.text('removed')),
  rename: defineHandler((c) => c.text('renamed')),
}

export default function Tasks() {
  return null
}
