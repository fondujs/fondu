export { defineHandler, defineMiddleware } from './server/handler.js'
export { render, share, encryptHistory, type RenderOptions } from './server/protocol.js'
export { back, location, isInertia, wantsPage } from './server/http.js'
export {
  optional,
  always,
  defer,
  once,
  merge,
  prepend,
  deepMerge,
  scroll,
  type Prop,
  type Paginated,
} from './server/props.js'
export { flash, clearHistory } from './server/flash.js'
export { ValidationError, type StandardSchemaV1 } from './server/validate.js'
export { withoutSsr, type DocumentParts, type DocumentTemplate } from './server/document.js'
export type { Register } from './types.js'
// last: createApp imports the app's routes, which import this module (the exports above are ready by then)
export { createApp, type CreateAppOptions } from './server/app.js'
