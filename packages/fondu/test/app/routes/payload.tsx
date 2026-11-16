import { defineHandler, render } from 'fondu'

// what a page's props may hold that a document must not let out of its <script>
const TRICKY = '</script><!-- <script>alert(1)</script>     a/b \\/ -->'

export const loader = defineHandler((c) => render(c, Payload, { items: ['a'], text: TRICKY }))

// the component changes its props as it renders: the page data in the document is what the loader gave
export default function Payload({ items, text }: { items: string[]; text: string }) {
  items.push('mutated while rendering')
  return <p>{text}</p>
}
