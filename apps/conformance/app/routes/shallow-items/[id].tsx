import { defineHandler, render } from 'fondu'
import { href, usePage } from 'fondu/client'

export const loader = defineHandler((c) => render(c, Item, { id: c.req.param('id') ?? '' }))

export default function Item({ id }: { id: string }) {
  const { component, url } = usePage()
  return (
    <>
      <h1 id="item-page">Item {id}</h1>
      <output id="component">{component}</output>
      <output id="url">{url}</output>
      <a href={href('/shallow-list')}>List</a>
      <a id="to-long" href={href('/long')}>
        Long
      </a>
    </>
  )
}
