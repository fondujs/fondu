/** `fondu({ progress })`: the bar at the top of the page while a navigation or a form's submission is on its way */
export interface ProgressOptions {
  /** how long a navigation runs before the bar shows, in ms (a quick one shows none); default 250 */
  delay?: number
  /** the bar's color, any CSS color (`var(--brand)`); default the page's text color (`currentColor`) */
  color?: string
}

/**
 * The bar: shown once a navigation has run for `delay`, creeping towards the end while it runs, filled and faded out
 * when it is done. Drawn with CSSOM styles (no stylesheet, nothing for a Content Security Policy to refuse), above the
 * page, out of the accessibility tree: `useNavigating()` is the app's way to say it in its own words.
 */
export function progressBar(
  { delay = 250, color = 'currentColor' }: ProgressOptions,
  pending: () => boolean,
): () => void {
  const still = matchMedia('(prefers-reduced-motion: reduce)')
  let bar: HTMLDivElement | undefined
  let wait: ReturnType<typeof setTimeout> | undefined
  let creep: ReturnType<typeof setInterval> | undefined
  let width = 0
  const set = (value: number) => {
    width = value
    if (bar) bar.style.transform = `scaleX(${value})`
  }
  const show = () => {
    bar = document.createElement('div') // a new one: the last may still be fading out
    Object.assign(bar.style, {
      position: 'fixed',
      inset: '0 0 auto',
      zIndex: '2147483647',
      height: '2px',
      background: color,
      transformOrigin: 'left',
      transform: 'scaleX(0)',
      transition: still.matches ? 'opacity 200ms' : 'transform 200ms ease-out, opacity 200ms',
      opacity: '1',
      pointerEvents: 'none',
    })
    bar.setAttribute('aria-hidden', 'true')
    document.body.append(bar)
    requestAnimationFrame(() => set(0.1)) // from 0, once it is drawn
    // nearer the end, slower: it never gets there before the navigation does
    creep = setInterval(() => set(width + (0.95 - width) * 0.1), 200)
  }
  const done = () => {
    clearTimeout(wait)
    clearInterval(creep)
    wait = creep = undefined
    if (!bar?.isConnected) return
    set(1)
    bar.style.opacity = '0'
    const gone = bar
    setTimeout(() => gone.remove(), 250)
  }
  return () => {
    if (!pending()) return done()
    if (wait === undefined && creep === undefined) wait = setTimeout(show, delay)
  }
}
