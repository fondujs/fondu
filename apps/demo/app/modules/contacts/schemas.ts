import * as z from 'zod/mini'

// A contact, as the actions validate it (a module of its own: it could check a form in the browser too).
export const contactSchema = z.object({
  name: z.string().check(z.trim(), z.minLength(2, 'Name must be at least 2 characters')),
  email: z.email('Enter a valid email').check(z.toLowerCase()), // one address however it is typed
})
