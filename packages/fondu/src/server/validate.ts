import type { Context, MiddlewareHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'

import { flashErrors } from './flash.js'
import { back, wantsPage } from './http.js'

/** The Standard Schema interface (zod, valibot, arktype…), the part used here. */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': {
    readonly version: 1
    readonly vendor: string
    readonly validate: (value: unknown) => StandardResult<Output> | Promise<StandardResult<Output>>
    readonly types?: { readonly input: Input; readonly output: Output } | undefined
  }
}
type StandardResult<Output> =
  | { readonly value: Output; readonly issues?: undefined }
  | {
      readonly issues: ReadonlyArray<{
        readonly message: string
        readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }>
      }>
    }
type InferOutput<S> = S extends StandardSchemaV1<unknown, infer O> ? O : never

/**
 * Field errors (`{ email: 'Enter a valid email' }`). Thrown from an action, or by `withValidator`: Inertia's requests
 * and plain forms go back to the page they came from with the errors (its `errors` prop, as Laravel does); other
 * requests (an API client) get 422 `{ errors }`.
 */
export class ValidationError extends Error {
  readonly errors: Record<string, string>
  constructor(errors: Record<string, string>) {
    super('Validation failed')
    this.errors = errors
    this.name = 'ValidationError'
  }
}

export function validationErrorResponse(c: Context, error: ValidationError): Response {
  if (!wantsPage(c)) return c.json({ errors: error.errors }, 422)
  const bag = c.req.header('x-inertia-error-bag')
  flashErrors(c, bag ? { [bag]: error.errors } : error.errors)
  return back(c)
}

/**
 * A request body as one object: JSON, or form fields with PHP-style names, as Inertia's `useForm` sends files
 * (`notify[0]`, `user[name]`) and as plain forms write them (`notify[]`); files are `File`s, empty file inputs
 * are left out. Names that would change the object itself (`__proto__`…) are ignored.
 */
export async function readBody(c: Context): Promise<unknown> {
  const type = c.req.header('content-type') ?? ''
  if (type.includes('application/json')) return c.req.json()
  if (!type.includes('multipart/form-data') && !type.includes('application/x-www-form-urlencoded')) return {}
  const form = await c.req.formData()
  const body: Record<string, unknown> = {}
  for (const [key, value] of form.entries()) {
    if (typeof value !== 'string' && value.size === 0 && value.name === '') continue
    const path = key.replace(/\]/g, '').split('[')
    if (path.some((p) => p === '__proto__' || p === 'constructor' || p === 'prototype')) continue
    let target: Record<string, unknown> = body
    path.forEach((segment, i) => {
      const last = i === path.length - 1
      const name = segment === '' ? String(Object.keys(target).length) : segment // `a[]`: the next index
      if (last) {
        if (name in target && path.length === 1) target[name] = [target[name], value].flat() // `a=1&a=2`
        else target[name] = value
      } else {
        target = (target[name] ??= {}) as Record<string, unknown>
      }
    })
  }
  return arrays(body)
}

/** objects whose keys are 0..n-1 become arrays */
const arrays = (value: unknown): unknown => {
  if (typeof value !== 'object' || value === null || value instanceof File || Array.isArray(value)) return value
  const entries = Object.entries(value).map(([k, v]) => [k, arrays(v)] as const)
  const isList = entries.length > 0 && entries.every(([k], i) => k === String(i))
  return isList ? entries.map(([, v]) => v) : Object.fromEntries(entries)
}

const pathOf = (path: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }> | undefined) =>
  (path ?? []).map((p) => String(typeof p === 'object' ? p.key : p)).join('.')

/** What `withValidator` checks: the request body (JSON or form), the query, the route params. */
export interface Schemas {
  body?: StandardSchemaV1
  query?: StandardSchemaV1
  params?: StandardSchemaV1
}
export type Input<S extends Schemas> = { [K in keyof S]: S[K] extends StandardSchemaV1 ? InferOutput<S[K]> : never }

/**
 * The validation step of `withValidator`: a middleware, and the validated input of its request. Params that don't
 * fit the schema are a 404 (`/users/abc` names no user); invalid body or query fields are a `ValidationError`. A Precognition
 * request (Inertia's live validation: `<Form validate>`, `useForm().withPrecognition()`) stops here: 204 when
 * valid, 422 `{ errors }` otherwise, the handler never runs.
 */
export function validator<S extends Schemas>(schemas: S): [MiddlewareHandler, (c: Context) => Input<S>] {
  const inputs = new WeakMap<Context, Input<S>>()
  const middleware: MiddlewareHandler = async (c, next) => {
    const values = {
      body: () => readBody(c),
      query: () => c.req.query(),
      params: () => c.req.param(),
    }
    const input: Record<string, unknown> = {}
    const errors: Record<string, string> = {}
    for (const key of Object.keys(schemas) as Array<keyof Schemas>) {
      const result = await schemas[key]!['~standard'].validate(await values[key]())
      // route params that don't fit: the URL names nothing here
      if (result.issues && key === 'params') throw new HTTPException(404)
      if (result.issues) for (const issue of result.issues) errors[pathOf(issue.path)] ??= issue.message
      else input[key] = result.value
    }
    if (c.req.header('precognition') === 'true') {
      const only = c.req.header('precognition-validate-only')?.split(',').filter(Boolean)
      const shown = only ? Object.fromEntries(Object.entries(errors).filter(([field]) => only.includes(field))) : errors
      const headers = { Precognition: 'true', Vary: 'Precognition' }
      return Object.keys(shown).length
        ? c.json({ errors: shown }, 422, headers)
        : c.body(null, 204, { ...headers, 'Precognition-Success': 'true' })
    }
    if (Object.keys(errors).length) throw new ValidationError(errors)
    inputs.set(c, input as Input<S>)
    await next()
  }
  return [middleware, (c) => inputs.get(c)!]
}
