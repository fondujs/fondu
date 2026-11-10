import { defineHandler } from 'fondu'

export const GET = defineHandler(() => {
  throw new Error('the database is down')
})
