import { back, defineHandler, flash, location, render } from 'fondu'

export const loader = defineHandler((c) =>
  render(c, 'redirects', { visitedAt: new Date().toISOString().slice(11, 23) }),
)

export const actions = {
  // 303 back to the page the form was on, with a flash message
  back: defineHandler((c) => {
    flash(c, { message: 'Redirected back with a flash message' })
    return back(c)
  }),
  // 303 to another page of this app: an Inertia visit, no page load
  props: defineHandler((c) => {
    flash(c, { message: 'Redirected from /redirects' })
    return c.redirect('/props', 303)
  }),
  // a #fragment is lost when fetch follows a redirect: Fondu answers Inertia with 409 + X-Inertia-Redirect
  fragment: defineHandler((c) => c.redirect('/redirects#target', 303)),
  // another site (or a page that isn't Inertia's): 409 + X-Inertia-Location, the browser loads it
  external: defineHandler((c) => location(c, '/api/health')),
}
