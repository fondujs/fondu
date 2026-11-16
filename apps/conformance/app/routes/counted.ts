import { defineHandler } from 'fondu'

// An HTTP route (a `.ts` file) that counts its calls per `id` (the tests run in parallel): the answer is the count
const calls = new Map<string, number>()

export const GET = defineHandler((c) => {
  const id = c.req.query('id') ?? ''
  const count = (calls.get(id) ?? 0) + 1
  calls.set(id, count)
  return c.text(`calls: ${count}`)
})
