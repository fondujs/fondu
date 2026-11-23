# MDX

Docs: [MDX pages](https://fondu.dev/docs/mdx.md).

An `.mdx` file in `app/routes/` is a page at its URL, rendered on GET: Markdown with JSX and imported React components.
It suits docs and articles.

## Setup

```sh
npm install -D @mdx-js/rollup
```

```ts
// vite.config.ts
import mdx from '@mdx-js/rollup'

export default defineConfig({
  plugins: [{ enforce: 'pre', ...mdx() }, fondu({ target: 'node' })],
})
```

Remark and rehype plugins go in `mdx()`'s options.

## A page

```mdx
{/* app/routes/guide/intro.mdx: /guide/intro */}
import { Counter } from '#/components/counter.tsx'

# Introduction

Some **Markdown**, and a component: <Counter />
```

- It has no handlers. A `_middleware.ts` around it can `share()` props, which are in `props` (`{props.title}`), and set
  `prerender`.
- It renders inside the `_layout.tsx` files above it. `export const layout = [Site]` chooses them (see
  [routes-and-pages.md](routes-and-pages.md)).
- To change what the Markdown becomes (links, tables), use MDX's `providerImportSource` with `@mdx-js/react`'s
  `MDXProvider` in a layout.
- In development, an edit updates the page in place (React Fast Refresh).

## Exports

An MDX page can't export `loader`, `action`, `actions`, HTTP methods, `prerender` or `params`: the app stops at
startup. Put `prerender` in a `.tsx` route or a `_middleware.ts`. `layout` is reserved (since 0.20.0). Any other export
is allowed, but Fondu may reserve new names in a minor release.
