import { back, defineHandler, flash, render } from 'fondu'
import * as z from 'zod/mini'

const upload = z.object({
  // a file input left empty is left out of the body: "required"
  file: z
    .file({ error: 'Choose a file' })
    .check(
      z.maxSize(1024 * 1024, 'At most 1 MB'),
      z.mime(
        ['image/png', 'image/jpeg', 'image/webp', 'text/plain'],
        'A PNG, JPEG, WebP or text file',
      ),
    ),
})

export const loader = defineHandler((c) => render(c, 'uploads'))

// POST /uploads — the file is a File in the body, checked by the schema; it is not kept
export const action = defineHandler.withValidator({ body: upload })((c, { body }) => {
  flash(c, { message: `Received ${body.file.name}, ${Math.ceil(body.file.size / 1024)} kB` })
  return back(c)
})
