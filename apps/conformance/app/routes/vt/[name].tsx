import { navigate, reload, useNavigation, usePage } from 'fondu/client'

import './vt.css'

// The page for the view transitions (not prerendered): e2e/transitions.spec.ts (`fondu({ viewTransitions: true })`) and
// e2e/transition-per-navigation.spec.ts (a navigation's own `data-transition`, `transition`) hold them between these.
// Tall, with a #target to scroll to
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
        <p>
          <a id="to-a-vt" href="/vt/a" data-transition>
            A with a transition
          </a>{' '}
          <a id="to-a-zoom" href="/vt/a" data-transition="zoom fade">
            A with zoom and fade
          </a>{' '}
          <a id="to-a-no" href="/vt/a" data-transition="false">
            A without a transition
          </a>{' '}
          <a id="shallow-link" href="?shallow=1" data-shallow data-transition="zoom">
            shallow link with a transition
          </a>
        </p>
        <form id="form" action="/vt/b">
          <button>Form to B</button>
        </form>
        <form id="form-vt" action="/vt/b" data-transition="zoom">
          <button>Form to B with zoom</button>
        </form>
        <form id="form-no" action="/vt/b" data-transition="false">
          <button>Form to B without a transition</button>
        </form>
        <button id="nav-vt" onClick={() => navigate('/vt/a', { transition: true })}>
          navigate(A, transition)
        </button>
        <button id="nav-zoom" onClick={() => navigate('/vt/a', { transition: ['zoom'] })}>
          navigate(A, zoom)
        </button>
        <button id="nav-no" onClick={() => navigate('/vt/a', { transition: false })}>
          navigate(A, no transition)
        </button>
        <button
          id="replace-zoom"
          onClick={() => navigate('/vt/b', { replace: true, transition: ['zoom'] })}
        >
          navigate(B, replace, zoom)
        </button>
        <button
          id="shallow-zoom"
          // the types refuse it: a shallow navigation never transitions, whatever the call says
          onClick={() => navigate('?shallow=1', { shallow: true, transition: true } as never)}
        >
          shallow with a transition
        </button>
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
