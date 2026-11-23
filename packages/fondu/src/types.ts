/** Filled in by the generated `fondu.gen.d.ts` (`routes`) and by the app (`shared`, `flash`) with `declare module 'fondu'`. */
export interface Register {}

export type Routes = Register extends { routes: infer R } ? R : undefined
export type Shared = Register extends { shared: infer S } ? S : Record<string, unknown>
export type Flash = Register extends { flash: infer F } ? F : Record<string, unknown>
