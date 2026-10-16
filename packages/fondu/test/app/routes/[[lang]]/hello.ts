import { defineHandler } from 'fondu'

export const GET = defineHandler((c) => c.text(`hello ${c.req.param('lang') ?? ''}`))
