declare module 'virtual:fondu/assets' {
  /** Client asset version (production builds); a navigation from other assets loads as a document. */
  export const version: string | null
  /** Some route exports `prerender`. */
  export const prerender: boolean
  export function assetTags(component: string, nonce?: string): string
}
declare module 'virtual:fondu/ssr' {
  /** `null` when `ssr: false`. */
  export const renderPage:
    | ((
        page: import('./client/navigation.js').PageObject,
        options: {
          nonce?: string
          signal?: AbortSignal
          onError?: (error: unknown) => void
          bootstrapScriptContent?: string
        },
      ) => Promise<import('./client/app.js').Rendered>)
    | null
  export function renderMarkup(element: import('react').ReactElement): string | Promise<string>
}
