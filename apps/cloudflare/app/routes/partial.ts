import { always, defineHandler, optional, render } from 'fondu'

let requests = 0 // this isolate's count: enough to watch `always` at work

export const loader = defineHandler((c) =>
  render(c, 'partial', {
    time: () => new Date().toISOString().slice(11, 23),
    random: () => Math.floor(Math.random() * 1000),
    requestCount: always(() => ++requests),
    report: optional(async () => {
      await new Promise((r) => setTimeout(r, 400))
      return { rows: 128, generatedAt: new Date().toISOString().slice(11, 19) }
    }),
  }),
)
