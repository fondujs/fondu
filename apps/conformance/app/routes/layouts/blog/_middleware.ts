import { defineMiddleware } from 'fondu'

export const prerender = true
export default defineMiddleware((_c, next) => next())
