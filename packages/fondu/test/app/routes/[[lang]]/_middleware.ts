import { defineMiddleware } from 'fondu'

export const params = { lang: ['de', 'fr'] }
export const prerender = () => params.lang.map((lang) => ({ lang }))

export default defineMiddleware(async (c, next) => {
  await next()
  c.header('X-Lang', c.req.param('lang') ?? 'base')
})
