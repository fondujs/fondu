import { defineHandler, render } from 'fondu'

export const loader = defineHandler((c) => render(c, 'errors'))

export const actions = {
  // POST /errors?fail
  fail: defineHandler(() => {
    throw new Error('The action failed: the payment service did not answer')
  }),
}
