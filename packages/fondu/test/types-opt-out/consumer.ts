import 'fondu'
import { href, request } from 'fondu/client'

// A library or a package with no app: any string is a path.
declare module 'fondu' {
  interface Register {
    routes: string
  }
}

href('/anything')
href('/users/:id', { id: 1, query: { page: 2 }, hash: 'top' })
void request('/api/anything', { method: 'POST', body: { a: 1 } })
