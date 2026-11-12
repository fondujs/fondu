import { useState } from 'react'

// renders, then throws in the browser once a button is pressed: the error page takes its place; with the second
// button it fails too (see _error.tsx)
export default function Boom() {
  const [broken, setBroken] = useState(false)
  if (broken) throw new Error('the page is broken')
  return (
    <>
      <title>Boom</title>
      <button onClick={() => setBroken(true)}>Break</button>
      <button
        onClick={() => {
          ;(globalThis as { __fonduBreakErrorPage?: boolean }).__fonduBreakErrorPage = true
          setBroken(true)
        }}
      >
        Break and fail the error page
      </button>
    </>
  )
}
