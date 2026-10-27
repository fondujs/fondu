import { defineHandler } from 'fondu'

// redirects, as an app answers with them: to a #fragment, relative to this URL, to a file
const to: Record<string, string> = {
  fragment: '/long#end',
  relative: '../long#end',
  file: '/notes.txt',
}

export const loader = defineHandler((c) => {
  const target = to[c.req.param('kind') ?? '']
  return target ? c.redirect(target, 302) : c.notFound()
})
