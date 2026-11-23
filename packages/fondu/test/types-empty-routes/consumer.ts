import 'fondu'
import { href, request } from 'fondu/client'

// What the generated file says for an app with no routes yet: it registers `routes`, and the registry is empty.
declare module 'fondu' {
  interface Register {
    routes: {}
  }
}

// @ts-expect-error no route is a typo, and the type says what to run
href('/typo')
// @ts-expect-error request() has no API route to call
request('/api/typo')
