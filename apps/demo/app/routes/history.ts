import { back, clearHistory, defineHandler, flash, render } from 'fondu'

// encryptHistory: the browser keeps this page's state encrypted, with a key that clearHistory() throws away
export const loader = defineHandler((c) =>
  render(
    c,
    'history',
    { secret: `Account balance: ${(Math.random() * 10_000).toFixed(2)}` },
    { encryptHistory: true },
  ),
)

export const actions = {
  clear: defineHandler((c) => {
    clearHistory(c)
    flash(c, { message: 'History cleared' })
    return back(c)
  }),
}
