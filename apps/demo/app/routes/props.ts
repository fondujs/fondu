import { defineHandler, render } from 'fondu'

// Props are checked against the page component's own props (pages/props.tsx): a missing or misspelled prop is a
// type error here. A function is called only when its prop is sent.
export const loader = defineHandler((c) =>
  render(c, 'props', {
    text: 'Hello from Hono',
    number: 42,
    float: 2.5,
    boolean: true,
    nothing: null,
    list: ['Hono', 'Inertia', 'React'],
    profile: {
      id: 7,
      name: 'Ada',
      email: 'ada@example.com',
      roles: ['editor', 'reviewer'],
      isAdmin: false,
    },
    computedAt: () => new Date().toISOString(),
  }),
)
