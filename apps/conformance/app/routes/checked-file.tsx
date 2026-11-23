import { defineHandler, flash, render } from 'fondu'
import { useForm, usePage } from 'fondu/client'

// A form's check sees a file field as the server will: by its file name (empty without a file) in a URL-encoded or
// text/plain body, as the file in a multipart one. The form's `enctype` is the query's, a submitter's `formenctype` its own.
// The schema notes what the browser's check saw (`window.seen`), the action what the server's did (`received`).
type Body = { file?: unknown }
const describe = ({ file }: Body) =>
  file === undefined
    ? 'absent'
    : typeof file === 'string'
      ? `name:${file}`
      : `file:${(file as File).name}`
const schema = {
  '~standard': {
    version: 1 as const,
    vendor: 'conformance',
    validate(value: unknown): { value: Body; issues?: undefined } {
      if (typeof window !== 'undefined')
        (window as { seen?: string }).seen = describe((value ?? {}) as Body)
      return { value: (value ?? {}) as Body }
    },
  },
}

export const action = defineHandler.withValidator({ body: schema })((c, { body }) => {
  flash(c, { received: describe(body) })
  return c.redirect('/checked-file', 303)
})

export const loader = defineHandler((c) => render(c, CheckedFile))

export default function CheckedFile() {
  const { flash, url } = usePage()
  const { form } = useForm(schema)
  const enctype = new URLSearchParams(url.split('?')[1]).get('enctype') ?? undefined
  return (
    <>
      <title>Checked file</title>
      <form id="checked-file" method="post" encType={enctype} {...form}>
        <input type="file" name="file" />
        <button id="default">Send</button>
        <button id="multipart" formEncType="multipart/form-data">
          Multipart
        </button>
        <button id="urlencoded" formEncType="application/x-www-form-urlencoded">
          URL-encoded
        </button>
        <button id="plain" formEncType="text/plain">
          Plain
        </button>
      </form>
      <pre id="received">{(flash as { received?: string }).received ?? ''}</pre>
    </>
  )
}
