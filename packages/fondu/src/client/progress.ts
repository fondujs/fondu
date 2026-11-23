/** `fondu({ progress })`: the bar at the top while a navigation or a form submission is on its way. */
export interface ProgressOptions {
  /** Milliseconds before the bar shows; default 350. */
  delay?: number
  /** Any CSS color; default `currentColor`. */
  color?: string
  /** Also for form submissions; default true. */
  forms?: boolean
}

// Drawn with CSSOM styles: no stylesheet for a Content Security Policy to refuse. Out of the accessibility tree:
// `useNavigation()` is the app's way to say it in words.
export function progressBar(
  { delay = 350, color = 'currentColor' }: ProgressOptions,
  pending: () => boolean,
): () => void {
  const still = matchMedia('(prefers-reduced-motion: reduce)')
  let bar: HTMLDivElement | undefined
  let wait: ReturnType<typeof setTimeout> | undefined
  const bars = new Set<HTMLDivElement>() // on the screen, the one fading out included
  // no bar kept in the back/forward cache, to be seen again on Back
  addEventListener('pagehide', () => {
    clearTimeout(wait)
    wait = bar = undefined
    for (const el of bars) el.remove()
    bars.clear()
  })
  const show = () => {
    wait = undefined
    const el = (bar = document.createElement('div')) // a new one: the last may still be fading out
    bars.add(el)
    Object.assign(el.style, {
      position: 'fixed',
      inset: '0 0 auto',
      zIndex: '2147483647',
      height: '2px',
      background: color,
      transformOrigin: 'left',
      transform: still.matches ? 'scaleX(1)' : 'scaleX(0)',
      pointerEvents: 'none',
    })
    el.setAttribute('aria-hidden', 'true')
    document.body.append(el)
    if (still.matches) return
    el.getBoundingClientRect() // its start is computed: the transition runs from 0
    el.style.transition = 'transform 10s cubic-bezier(0.05, 0.7, 0.1, 1)'
    el.style.transform = 'scaleX(0.95)'
  }
  const done = () => {
    clearTimeout(wait)
    wait = undefined
    const el = bar
    bar = undefined
    if (!el) return
    // filled from where it is (a transition starts from the value on the screen), then faded out
    el.style.transition = 'transform 200ms ease-out, opacity 200ms 200ms'
    el.style.transform = 'scaleX(1)'
    el.style.opacity = '0'
    setTimeout(() => {
      el.remove()
      bars.delete(el)
    }, 450)
  }
  return () => {
    if (!pending()) return done()
    if (wait === undefined && bar === undefined) wait = setTimeout(show, delay)
  }
}
