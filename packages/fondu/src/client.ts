import { http } from '@inertiajs/react'

import { fillPattern, pageDataPath } from './paths.js'
import type { Routes } from './types.js'

/**
 * Typed URLs from `app/routes/` (as React Router's `href`): `href('/users/:id', { id })` → `'/users/7'`;
 * one of a file's `actions`: `href('/users/:id?delete', { id })`. Only patterns that exist; params are required.
 * The method is Inertia's: `<Link href={href('/logout')} method="post" as="button">`, `<Form action=… method="post">`.
 */
type Keys = keyof Routes & string
type Actions = {
  [P in Keys]: Routes[P] extends { actions: infer A } ? `${P}?${keyof A & string}` : never
}[Keys]
export type Href = [Keys] extends [never] ? string : Keys | Actions

type ParamNames<P extends string> = P extends `${string}:${infer Name}{${string}}${infer Rest}`
  ? Name | ParamNames<Rest>
  : P extends `${string}:${infer Name}/${infer Rest}`
    ? Name | ParamNames<`/${Rest}`>
    : P extends `${string}:${infer Name}?${string}`
      ? Name
      : P extends `${string}:${infer Name}`
        ? Name
        : never
type Args<P extends string> = [ParamNames<P>] extends [never]
  ? []
  : [params: { [K in ParamNames<P>]: string | number }]

export function href<P extends Href>(path: P, ...[params]: Args<P>): string {
  return fillPattern(path, params)
}

/**
 * `fondu({ prerender: true })` adds this to the client entry: visits ask for the page object at
 * `/_fondu/pages/<path>.json`, a static file for a prerendered page, the server's answer for any other. A page
 * object of another build reloads the page as a document, as the server's 409 would.
 */
export function prerendered() {
  const loaded = document.querySelector('script[data-page]')?.textContent
  const version = loaded ? (JSON.parse(loaded) as { version?: string | null }).version : null
  http.onRequest((config) => {
    const url = new URL(config.url, location.href)
    if (config.method !== 'get' || !config.headers?.['X-Inertia'] || url.origin !== location.origin)
      return config
    return { ...config, url: pageDataPath(url.pathname) + url.search }
  })
  http.onResponse((response) => {
    if (!version || response.status !== 200 || !response.headers['x-inertia']) return response
    const page = JSON.parse(response.data) as { url: string; version?: string | null }
    if (!page.version || page.version === version) return response
    return {
      status: 409,
      data: '',
      headers: { 'x-inertia-location': page.url, 'x-inertia-version': page.version },
    }
  })
}
