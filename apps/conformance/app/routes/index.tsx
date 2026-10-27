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
    </>
  )
}
