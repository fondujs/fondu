import { defineHandler } from 'fondu'

export const DELETE = defineHandler((c) => c.text(`deleted ${c.req.param('name')}`))
