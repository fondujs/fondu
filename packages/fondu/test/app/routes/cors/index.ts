import { defineHandler } from 'fondu'

export const GET = defineHandler((c) => c.text('cors'))
