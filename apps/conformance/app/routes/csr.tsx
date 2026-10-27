import { defineHandler, render, withoutSsr } from 'fondu'

export const loader = defineHandler(withoutSsr(), (c) => render(c, Csr))

export default function Csr() {
  return (
    <>
      <title>Rendered in the browser</title>
      <h1>Rendered in the browser</h1>
      <div style={{ height: 4000 }} />
    </>
  )
}
