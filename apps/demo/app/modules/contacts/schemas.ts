import * as z from 'zod/mini'

export const contactSchema = z.object({
  name: z.string().check(z.trim(), z.minLength(2, 'Name must be at least 2 characters')),
  email: z.email('Enter a valid email').check(z.toLowerCase()),
})
