import { useId } from 'react'

// useId(): its value is the component's position in the tree, so the server's tree must be the browser's. The id is
// also text: a production build of React reports a mismatch of text, not of an attribute
export default function Ids() {
  const id = useId()
  return (
    <>
      <title>Ids</title>
      <label htmlFor={id}>Name</label>
      <input id={id} />
      <code>{id}</code>
    </>
  )
}
