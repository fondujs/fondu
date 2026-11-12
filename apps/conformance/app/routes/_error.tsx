export default function ErrorPage({ status }: { status: number }) {
  // /boom's "Break and fail the error page" sets this in the browser: the error page that fails too
  if ((globalThis as { __fonduBreakErrorPage?: boolean }).__fonduBreakErrorPage)
    throw new Error('the error page is broken')
  return (
    <>
      <title>{`Error ${status}`}</title>
      <h1>{status === 404 ? 'Not found' : 'Error'}</h1>
    </>
  )
}
