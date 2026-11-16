import { useNavigation } from 'fondu/client'

// prerendered: native #fragment entries (`#one`, `#two`) and a link to another page, for Back and Forward while a visit
// is on its way (e2e/traversal.spec.ts)
export const prerender = true

export default function Traverse() {
  const { state } = useNavigation()
  return (
    <>
      <title>Traverse</title>
      <h1>Traverse</h1>
      <output id="state">{state}</output>
      <a id="one-link" href="#one">
        One
      </a>
      <a id="two-link" href="#two">
        Two
      </a>
      <a id="to-long" href="/long">
        Long
      </a>
      <div style={{ height: 1500 }} />
      <p id="one">One</p>
      <div style={{ height: 1500 }} />
      <p id="two">Two</p>
      <div style={{ height: 1500 }} />
    </>
  )
}
