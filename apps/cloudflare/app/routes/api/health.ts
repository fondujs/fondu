import { defineHandler } from 'fondu'

// GET /api/health — JSON
export const GET = defineHandler((c) => c.json({ ok: true, runtime: navigator.userAgent }))
