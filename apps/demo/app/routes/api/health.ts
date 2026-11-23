import { defineHandler } from 'fondu'

export const GET = defineHandler((c) => c.json({ ok: true, runtime: navigator.userAgent }))
