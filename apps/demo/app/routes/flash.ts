import { back, defineHandler, flash, render } from 'fondu'
import * as z from 'zod/mini'

export const loader = defineHandler((c) => render(c, 'flash'))

export const actions = {
  // POST /flash?saved — the next page gets `flash.message`; the layout shows it as a toast
  saved: defineHandler((c) => {
    flash(c, { message: 'Saved, said the server' })
    return back(c)
  }),
  // POST /flash?failed — `flash.error`: a toast of its own kind
  failed: defineHandler((c) => {
    flash(c, { error: 'Not saved: the server said no' })
    return back(c)
  }),
  // POST /flash?pick — data of your own, for the page to use as it likes
  pick: defineHandler.withValidator({
    body: z.object({ color: z.enum(['gold', 'teal', 'plum']) }),
  })((c, { body }) => {
    flash(c, { picked: body.color })
    return back(c)
  }),
}
