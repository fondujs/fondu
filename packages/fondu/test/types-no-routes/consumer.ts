import { href, request } from 'fondu/client'

// A separate consumer program: no `Register`, as in a project before its first `vite dev` or `vite build`.
// @ts-expect-error the type says to run vite dev or vite build
href('/typo')
// @ts-expect-error a path, and its options, are no better
href('/users/:id', { id: 1 })
// @ts-expect-error request() fails the same way
request('/api/typo')
// the message is the only thing the parameter accepts: it names the file to generate
href('Run vite dev or vite build to generate app/fondu.gen.d.ts')
