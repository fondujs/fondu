import { defineHandler } from 'fondu'

// several forms: each to one of `actions`
export const actions = {
  remove: defineHandler((c) => c.text('removed')),
  rename: defineHandler((c) => c.text('renamed')),
}
