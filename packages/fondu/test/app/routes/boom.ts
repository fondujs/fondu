import { defineHandler } from 'fondu'

export const loader = defineHandler(() => { throw new Error('the database is down') })
