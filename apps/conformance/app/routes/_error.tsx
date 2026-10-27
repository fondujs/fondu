export default function ErrorPage({ status }: { status: number }) {
  return (
    <>
      <title>{`Error ${status}`}</title>
      <h1>{status === 404 ? 'Not found' : 'Error'}</h1>
    </>
  )
}
