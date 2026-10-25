import { fillPattern } from './paths.js'
import type { Routes } from './types.js'

/**
 * Typed URLs from `app/routes/` (as React Router's `href`): `href('/users/:id', { id })` → `'/users/7'`;
 * one of a file's `actions`: `href('/users/:id?delete', { id })`. Only patterns that exist; params are required.
 * A form's action too: `<form method="post" action={href('/logout')}>`.
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

export {
  startApp,
  usePage,
  useNavigating,
  reload,
  __entry,
  renderPage,
  type AppOptions,
  type Errors,
} from './client/app.js'
export { loadDocument, type Page } from './client/navigation.js'
