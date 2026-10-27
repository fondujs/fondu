// Forms as pages write them: each sent to /echo, which shows what came
export default function Form() {
  return (
    <>
      <title>Form</title>
      <form id="urlencoded" method="post" action="/echo">
        <textarea name="notes" defaultValue={'one\ntwo\r\nthree'} />
        <input name="name" defaultValue="Ada & Bob, é + ü" />
        <input type="checkbox" name="tags" value="a" defaultChecked />
        <input type="checkbox" name="tags" value="b" />
        <input type="checkbox" name="tags" value="c" defaultChecked />
        <select name="pick" multiple defaultValue={['x', 'z']}>
          <option value="x">x</option>
          <option value="y">y</option>
          <option value="z">z</option>
        </select>
        <button name="go" value="save">
          Save
        </button>
        <button name="go" value="other" id="other">
          Other
        </button>
        <button formAction="/echo?alt" formMethod="get" id="as-get">
          As GET
        </button>
      </form>
      <form id="multipart" method="post" action="/echo" encType="multipart/form-data">
        <textarea name="notes" defaultValue={'one\ntwo'} />
        <input type="file" name="file" />
        <button>Send</button>
      </form>
      <form id="plain" method="post" action="/echo" encType="text/plain">
        <textarea name="notes" defaultValue={'one\ntwo'} />
        <button>Send</button>
      </form>
      <form id="get" action="/echo">
        <input name="q" defaultValue="a b&c" />
        <textarea name="notes" defaultValue={'one\ntwo'} />
        <button>Search</button>
      </form>
    </>
  )
}
