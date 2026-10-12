/**
 * Filled in by the generated `app/fondu.gen.d.ts` (written by the Vite plugin, committed with the app):
 * `pages`: page name → its module, `routes`: URL pattern → its route module.
 *
 * `c.get()` / `c.set()` are typed by Hono's own `ContextVariableMap`; shared props and flash by Inertia's
 * `InertiaConfig`.
 */
// biome-ignore lint: augmented by generated code
export interface Register {}

export type Pages = Register extends { pages: infer P } ? P : Record<string, unknown>
export type Routes = Register extends { routes: infer R } ? R : Record<string, unknown>
