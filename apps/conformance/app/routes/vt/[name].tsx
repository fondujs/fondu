import { navigate, reload, useNavigation, usePage } from 'fondu/client'

import './vt.css'

// The page for `fondu({ viewTransitions: true })` (not prerendered): e2e/transitions.spec.ts holds the view transitions
// between these. Tall, with a #target to scroll to
export default function Vt() {
  const { url } = usePage()
  const { state } = useNavigation()
  const name = url.split(/[/?#]/)[2]
  return (
    <>
      <title>{`VT ${name}`}</title>
      <div id="page" data-name={name}>
        <h1>{`VT ${name}`}</h1>
        <output id="state">{state}</output>
        <output id="url">{url}</output>
        <p>
          <a id="to-o" href="/vt/o">
            O
          </a>{' '}
          <a id="to-p" href="/vt/p">
            P
          </a>{' '}
          <a id="to-a" href="/vt/a">
            A
          </a>{' '}
          <a id="to-b" href="/vt/b">
            B
          </a>{' '}
          <a id="to-b-target" href="/vt/b#target">
            B at its target
          </a>
        </p>
        <form id="form" action="/vt/b">
          <button>Form to B</button>
        </form>
        <button id="replace-b" onClick={() => navigate('/vt/b', { replace: true })}>
          navigate(B, replace)
        </button>
        <button id="shallow" onClick={() => navigate('?shallow=1', { shallow: true })}>
          shallow
        </button>
        <button id="again" onClick={() => reload()}>
          reload()
        </button>
        <div style={{ height: 1200 }} />
        <p id="target">Target</p>
        <div style={{ height: 2500 }} />
      </div>
    </>
  )
}
