import { defineHandler, render } from 'fondu'

// a thenable that is not a Promise
// oxlint-disable-next-line unicorn/no-thenable
const thenable = { then() {} }

// ?promise: a promise as a prop; ?promise=thenable: a thenable; ?nested: a promise inside a prop (the app's own JSON)
export const loader = defineHandler((c) => {
  const own =
    c.req.query('promise') === 'thenable'
      ? { late: thenable }
      : c.req.query('promise') !== undefined
        ? { late: Promise.resolve(1) }
        : {}
  const nested = c.req.query('nested') !== undefined ? { inner: { late: Promise.resolve(1) } } : {}
  return render(c, Promises, { ...(own as object), ...(nested as object), title: 'Dashboard' })
})

export default function Promises(_: { title: string }) {
  return null
}
