import { defer, defineHandler, render } from 'fondu'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Deferred props are left out of the page; the client asks for each group in its own request right after it renders.
export const loader = defineHandler((c) =>
  render(c, 'deferred', {
    renderedAt: new Date().toISOString().slice(11, 23),
    stats: defer(async () => {
      await wait(800)
      return { users: 1284, orders: 312, revenue: 48210 }
    }),
    flaky: defer(
      async (): Promise<string> => {
        throw new Error('the recommendations service is down')
      },
      { rescue: true },
    ),
    activity: defer(
      async () => {
        await wait(1800)
        const at = new Date().toISOString().slice(11, 23)
        return [
          `Ada pushed to main ${at}`,
          `Alan opened a pull request ${at}`,
          `Grace deployed to production ${at}`,
        ]
      },
      { group: 'slow' },
    ),
    recommendations: defer(
      async () => ['Try deferred groups', 'Combine with merge props', 'Rescue failures'],
      {
        group: 'slow',
      },
    ),
  }),
)
