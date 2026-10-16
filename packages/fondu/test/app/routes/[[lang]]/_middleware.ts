import { defineMiddleware } from 'fondu'

// /hello in the base language, /de/hello and /fr/hello; the pages to prerender
export const params = { lang: ['de', 'fr'] }
export const prerender = () => params.lang.map((lang) => ({ lang }))

export default defineMiddleware(async (c, next) => {
  await next()
  c.header('X-Lang', c.req.param('lang') ?? 'base')
})
