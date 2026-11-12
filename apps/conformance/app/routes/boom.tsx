import { useState } from 'react'

// renders, then throws in the browser once the button is pressed: the error page takes its place (and fails too, in
// this app: see _error.tsx)
export default function Boom() {
  const [broken, setBroken] = useState(false)
  if (broken) throw new Error('the page is broken')
  return (
    <>
      <title>Boom</title>
      <button onClick={() => setBroken(true)}>Break</button>
    </>
  )
}
