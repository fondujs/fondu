# fondu.dev

Fondu's website and docs, built with Fondu on Cloudflare Workers: https://fondu.dev

- The docs are MDX pages in `app/routes/docs/`, in the order of `app/docs.ts` (the sidebar, the titles, `llms.txt`).
- Every page is static (`app/routes/_middleware.ts`); `bun run build` then indexes them for the search (Pagefind).
- Code is highlighted at build time (Shiki), `llms.txt` and `llms-full.txt` are written from the MDX (`markdown.ts`).

## Run it

```bash
bun run dev        # the search needs a build: it works in preview
bun run preview    # the production build, locally
```

## Deploy (by hand)

With the fondu.dev zone on the same Cloudflare account: `bunx wrangler login` once, then `bun run deploy`.
