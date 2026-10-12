import { defineHandler, render } from 'fondu'

export const loader = defineHandler((c) =>
  render(c, 'navigation', { servedAt: new Date().toISOString().slice(11, 23) }),
)
