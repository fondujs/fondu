import { navigate } from 'fondu/client'

export const prerender = true

const links = [
  '/long',
  '/long#end',
  '/notes.txt',
  '/nope',
  '/go/fragment',
  '/go/relative',
  '/go/file',
  '/form',
  '/csr',
]

export default function Home() {
  return (
    <>
      <title>Home</title>
      <h1>Home</h1>
      <ul>
        {links.map((href) => (
          <li key={href}>
            <a href={href}>{href}</a>
          </li>
        ))}
      </ul>
      <button id="navigate" onClick={() => navigate('/long')}>
        navigate('/long')
      </button>
      <button id="navigate-replace" onClick={() => navigate('/long', { replace: true })}>
        navigate('/long', {'{'} replace: true {'}'})
      </button>
      <button id="navigate-file" onClick={() => navigate('/notes.txt')}>
        navigate('/notes.txt')
      </button>
    </>
  )
}
