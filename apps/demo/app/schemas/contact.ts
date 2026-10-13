import * as z from 'zod/mini'

// One schema for both sides: the action validates with it (the authority), the page checks with it before
// sending (instant feedback). zod/mini: small enough for the browser bundle.
export const contactSchema = z.object({
  name: z.string().check(z.trim(), z.minLength(2, 'Name must be at least 2 characters')),
  email: z.email('Enter a valid email').check(z.toLowerCase()), // one address however it is typed
})
