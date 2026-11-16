import { defineHandler, flash, ValidationError } from 'fondu'

// sets what the body says, for the flash cookie's tests: `{ flash, errors }`, then back to the page
export const POST = defineHandler(async (c) => {
  const { flash: data, errors } = (await c.req.json()) as {
    flash?: Record<string, string>
    errors?: Record<string, string>
  }
  if (data) flash(c, data)
  if (errors) throw new ValidationError(errors)
  return c.redirect('/', 303)
})
