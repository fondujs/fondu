import type { Context, Handler, MiddlewareHandler } from 'hono'
import { createFactory } from 'hono/factory'

import { validator, type Input, type Schemas } from './validate.js'

const factory = createFactory()

type Final<S extends Schemas> = (c: Context, input: Input<S>) => Response | Promise<Response>
type Handlers = Array<Handler | MiddlewareHandler>

/** @internal a type only, never a value: the schemas a `withValidator` handler checks, for `href()`'s `query` */
export declare const schemasOf: unique symbol
/** handlers of `withValidator`: with their schemas, in the type only (`href()` types the query by them) */
export type Validated<S extends Schemas> = Handlers & { readonly [schemasOf]?: S }

/** overloads, as Hono's `createHandlers` has them: the last handler's parameters are typed reliably */
interface WithInput<S extends Schemas> {
  (handler: Final<S>): Validated<S>
  (m1: MiddlewareHandler, handler: Final<S>): Validated<S>
  (m1: MiddlewareHandler, m2: MiddlewareHandler, handler: Final<S>): Validated<S>
  (
    m1: MiddlewareHandler,
    m2: MiddlewareHandler,
    m3: MiddlewareHandler,
    handler: Final<S>,
  ): Validated<S>
}

/**
 * Validated input for the handler, after the middleware (a guard runs before the request body is read):
 * `defineHandler.withValidator({ body, query, params })(...middleware, (c, { body, query, params }) => …)`.
 * Any Standard Schema. Invalid input: back to the page with the errors, or 422 `{ errors }`.
 * More than three middleware: combine them with `every()` from `hono/combine`.
 */
function withValidator<S extends Schemas>(schemas: S): WithInput<S> {
  return (...handlers: Array<MiddlewareHandler | Final<S>>): Handlers => {
    const handler = handlers.pop() as Final<S>
    const [validate, input] = validator(schemas)
    return [...(handlers as MiddlewareHandler[]), validate, (c) => handler(c, input(c))]
  }
}

/** Route handlers: `defineHandler(...middleware, handler)` (Hono's `createHandlers`), and `.withValidator()`. */
export const defineHandler = Object.assign(factory.createHandlers, { withValidator })

/** A middleware, for `_middleware.ts` files and your own guards (Hono's `createMiddleware`). */
export const defineMiddleware = factory.createMiddleware
