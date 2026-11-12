export default function ErrorPage({ status }: { status: number }) {
  // a thrown 500 (routes/boom.ts) is an error page that fails too
  if (status === 500) throw new Error('the error page is broken')
  return null
}
