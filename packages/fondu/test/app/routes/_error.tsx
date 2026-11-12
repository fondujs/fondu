export default function ErrorPage({ status }: { status: number }) {
  // 418 (routes/teapot.ts) is the one status whose error page fails: nothing else uses it
  if (status === 418) throw new Error('the error page is broken')
  return null
}
