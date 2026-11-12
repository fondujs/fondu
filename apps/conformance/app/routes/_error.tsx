export default function ErrorPage({ status }: { status: number }) {
  // 500 is the browser's own render of a page that threw (`/boom`): the error page that fails too
  if (status === 500) throw new Error('the error page is broken')
  return (
    <>
      <title>{`Error ${status}`}</title>
      <h1>{status === 404 ? 'Not found' : 'Error'}</h1>
    </>
  )
}
