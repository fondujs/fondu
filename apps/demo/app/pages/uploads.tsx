import { href, type Errors } from 'fondu/client'

import { DemoCard, SubmitButton, TextField, Title } from '#/components/demo.tsx'

export default function Uploads({ errors }: { errors: Errors }) {
  return (
    <>
      <Title>File uploads</Title>
      <h1>File uploads</h1>
      <p className="lede">
        A form with a file is sent as multipart data. On the server the file is a <code>File</code>{' '}
        in the body, checked by the action&apos;s schema like any field (here at most 1 MB, an image
        or text); an invalid one comes back to the page with its error. Nothing is kept.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <DemoCard title="A file" tag="z.file(), enctype=multipart/form-data">
          <form
            action={href('/uploads')}
            method="post"
            encType="multipart/form-data"
            className="grid gap-4"
            data-testid="upload"
          >
            <TextField
              label="File"
              type="file"
              name="file"
              accept="image/png,image/jpeg,image/webp,text/plain"
              error={errors.file}
              testid="err-file"
            />
            <SubmitButton data-testid="upload-send">Upload</SubmitButton>
          </form>
        </DemoCard>
        <DemoCard title="The schema" tag="routes/uploads.ts">
          <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs/relaxed">{`z.object({
  file: z
    .file({ error: 'Choose a file' })
    .check(
      z.maxSize(1024 * 1024, 'At most 1 MB'),
      z.mime([...images, 'text/plain'], …),
    ),
})`}</pre>
          <p className="mt-3 text-xs text-muted-foreground">
            The body is read in memory: cap its size with Hono&apos;s <code>bodyLimit</code>.
          </p>
        </DemoCard>
      </div>
    </>
  )
}
