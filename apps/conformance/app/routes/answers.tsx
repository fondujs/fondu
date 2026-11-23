import { defineHandler, render } from 'fondu'

// A form's answer that is no page: a file to download, or a document written over this one (HTML, and text shown
// as text). The client acts on it once its body is read, unless the visit was left meanwhile (e2e/cancelled.spec.ts)
export const action = defineHandler((c) => {
  const as = c.req.query('as')
  if (as === 'download')
    return c.body('file', 200, { 'Content-Disposition': 'attachment; filename="a.txt"' })
  if (as === 'html')
    return c.html('<!doctype html><title>Replaced</title><p id="replaced">Replaced</p>')
  return c.text('replaced')
})

export const loader = defineHandler((c) => render(c, Answers))

export default function Answers() {
  return (
    <>
      <title>Answers</title>
      <form id="download" method="post" action="/answers?as=download">
        <button>Download</button>
      </form>
      <form id="html" method="post" action="/answers?as=html">
        <button>HTML</button>
      </form>
      <form id="text" method="post" action="/answers?as=text">
        <button>Text</button>
      </form>
      <a id="away" href="/long">
        Away
      </a>
    </>
  )
}
