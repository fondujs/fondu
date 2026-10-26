/**
 * Filled in by the generated `app/fondu.gen.d.ts` (written by the Vite plugin, committed with the app):
 * `routes`: URL pattern → its route module.
 *
 * And by the app, where it likes (`declare module 'fondu' { interface Register { … } }`): `shared`, the props
 * `share()` gives every page; `flash`, what `flash()` takes. `c.get()` / `c.set()` are typed by Hono's own
 * `ContextVariableMap`.
 */
// biome-ignore lint: augmented by generated code
export interface Register {}

export type Routes = Register extends { routes: infer R } ? R : Record<string, unknown>
export type Shared = Register extends { shared: infer S } ? S : Record<string, unknown>
export type Flash = Register extends { flash: infer F } ? F : Record<string, unknown>
