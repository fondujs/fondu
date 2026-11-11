import { defineHandler, render } from 'fondu'
import { href, navigate } from 'fondu/client'
import { useState } from 'react'

const names = [
  'Aaron',
  'Abby',
  'Adam',
  'Alice',
  'Amy',
  'Andrew',
  'Angela',
  'Ann',
  'Anna',
  'Anthony',
  'Barbara',
  'Ben',
  'Carl',
  'Cathy',
  'Daniel',
  'David',
  'Diana',
  'Edward',
  'Emma',
  'Frank',
  'Grace',
  'Hannah',
  'Ivan',
  'Jack',
  'Julia',
  'Kevin',
  'Laura',
  'Mark',
  'Nancy',
  'Oscar',
]

// no `prerender`: a search the URL holds. The input keeps its focus, what was typed and the scroll while each change
// is navigated to with `keep` (no debounce: the test types character by character)
export const loader = defineHandler((c) => {
  const q = new URL(c.req.url).searchParams.get('q') ?? ''
  const found = names.filter((name) => name.toLowerCase().includes(q.toLowerCase()))
  return render(c, Search, { q, found })
})

export default function Search({ q, found }: { q: string; found: string[] }) {
  // `q` from the props on the first render, its own state after
  const [value, setValue] = useState(q)
  return (
    <>
      <title>Search</title>
      <h1>Search</h1>
      <div style={{ height: 800 }} />
      <input
        id="q"
        value={value}
        onChange={(event) => {
          setValue(event.target.value)
          navigate(href('/search', { query: { q: event.target.value } }), {
            replace: true,
            keep: true,
          })
        }}
      />
      <ul id="results">
        {found.map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>
      <button id="to-long" onClick={() => navigate('/long', { keep: true })}>
        Long
      </button>
      <div style={{ height: 1500 }} />
    </>
  )
}
