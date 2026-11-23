import { useNavigation } from 'fondu/client'

// prerendered: native #fragment entries (`#one`, `#two`) and a link to another page, for Back and Forward while a visit
// is on its way (e2e/traversal.spec.ts). Whole-pixel layout (line heights, margins): Firefox scrolls to a #fragment at a
// fractional offset in two steps, a pixel apart, and the scroll position test would read the first
export const prerender = true

export default function Traverse() {
  const { state } = useNavigation()
  return (
    <div style={{ lineHeight: '20px' }}>
      <title>Traverse</title>
      <h1 style={{ margin: '20px 0' }}>Traverse</h1>
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
    </div>
  )
}
