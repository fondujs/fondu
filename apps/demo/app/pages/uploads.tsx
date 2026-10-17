import { Form, Head } from '@inertiajs/react'
import { href } from 'fondu/client'

import { DemoCard, SubmitButton, TextField } from '#/components/demo.tsx'

export default function Uploads() {
  return (
    <>
      <Head title="File uploads" />
      <h1>File uploads</h1>
      <p className="lede">
        A form with a file is sent as multipart data. On the server the file is a <code>File</code>{' '}
        in the body, checked by the action&apos;s schema like any field (here at most 1 MB, an image
        or text); an invalid one comes back to the page with its error. Nothing is kept.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <DemoCard title="A file" tag="z.file(), <Form> progress">
          <Form
            action={href('/uploads')}
            method="post"
            resetOnSuccess
            showProgress={false}
            options={{ preserveScroll: true }}
            className="grid gap-4"
            data-testid="upload"
          >
            {({ errors, progress }) => (
              <>
                <TextField
                  label="File"
                  type="file"
                  name="file"
                  accept="image/png,image/jpeg,image/webp,text/plain"
                  error={errors.file}
                  testid="err-file"
                />
                {progress && (
                  <progress
                    value={progress.percentage}
                    max={100}
                    className="h-1.5 w-full overflow-hidden rounded-full accent-brand"
                    aria-label="Upload"
                  />
                )}
                <SubmitButton data-testid="upload-send">Upload</SubmitButton>
              </>
            )}
          </Form>
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
