import type { Context, Handler, MiddlewareHandler } from 'hono'
import { createFactory } from 'hono/factory'
import { validator, type Input, type Schemas } from './validate.ts'

const factory = createFactory()

type Final<S extends Schemas> = (c: Context, input: Input<S>) => Response | Promise<Response>

/**
 * Validated input for the handler, after the middleware (a guard runs before the request body is read):
 * `defineHandler.withValidator({ body, query, params })(...middleware, (c, { body, query, params }) => …)`.
 * Any Standard Schema. Invalid input: back to the page with the errors (Inertia), or 422 `{ errors }`.
 */
function withValidator<S extends Schemas>(schemas: S) {
  return (...handlers: [...middleware: MiddlewareHandler[], handler: Final<S>]): Array<Handler | MiddlewareHandler> => {
    const handler = handlers.pop() as Final<S>
    const [validate, input] = validator(schemas)
    return [...(handlers as MiddlewareHandler[]), validate, (c) => handler(c, input(c))]
  }
}

/** Route handlers: `defineHandler(...middleware, handler)` (Hono's `createHandlers`), and `.withValidator()`. */
export const defineHandler = Object.assign(factory.createHandlers, { withValidator })

/** A middleware, for `_middleware.ts` files and your own guards (Hono's `createMiddleware`). */
export const defineMiddleware = factory.createMiddleware
