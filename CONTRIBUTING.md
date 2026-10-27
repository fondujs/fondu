# Contributing

Fondu is built on Hono and Vite, and writes only what none of them does: a change that lets the platform (Hono, Vite,
the browser, the runtime) do the work is preferred to one that adds code.

Pull requests are opened by the repository's collaborators. To report a bug or propose a change, open an
[issue](https://github.com/fondujs/fondu/issues): a reproduction for a bug, the case for a feature. Once the approach is
agreed, a maintainer makes the change, or invites you to.

## Setup

[Bun](https://bun.sh) 1.3.14 or later (and Node 20.19 or later for the Node example).

```bash
bun install            # also builds packages/fondu, and installs the git hooks (lefthook)
bun run dev            # rebuild packages/fondu on change
bun run test           # the protocol, on a small app with app.request()
bun run check          # format (oxfmt), lint (oxlint), typecheck
```

In VS Code, the recommended extensions (`.vscode/extensions.json`: oxc, Tailwind CSS, MDX) format and fix each file as it
is saved, as the commit hook does.

`bun run --filter create-fondu test` creates an app for each target (Bun, Cloudflare Workers, Node) with `packages/fondu` as
built here, and runs it in development and production.

`apps/demo` is the end-to-end test of every feature. Start it (`bun run dev`, or `bun run preview`), then run its
checks with Chrome or Chromium:

```bash
cd apps/demo && bun run dev
CHROME_PATH=/path/to/chrome node e2e/run.mjs http://localhost:5173
```

A change to `packages/fondu` should pass both.

## Commits and pull requests

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org): `feat:`, `fix:`, `docs:`,
`chore:`… The commit-msg hook checks them, and the release notes are made from them, so write them for users.

A pull request: one change, with a test (`packages/fondu/test`) or an e2e check when behavior changes, and the README
updated when the API does.

## Checking a change

- **Types are behavior.** A change to a public type (`render`, `href`, `share`, `flash`, `withValidator`, the
  generated types) has a `tsc` test in `packages/fondu/test/types.test.ts` (`@ts-expect-error` for what must fail),
  with the empty case (a page without props, a route without params), the app's own declarations (shared props,
  flash data) and each optional argument given.
- **What the template runs, a test runs.** Scripts, git hooks and generated config are each run by the
  create-fondu test at least once, with nothing to do too (no files, ignored files only).
- **Edge inputs.** None, one, many; encoded (`%2e%2e`, `%2f`); hidden or ignored files; an index signature or
  `never` in a type.
- **Siblings alike.** A fix to one of a pair (fmt and lint, GET and POST, Node and Bun, development and
  production) is checked on the other.
- **Request handling** (`server/`, the server's entry): what the request controls (the path, `Host`, `Referer`,
  cookies, the body) and where it goes (file paths, redirects, HTML, regular expressions, another request), each
  with a test.
- **Before a release**, the request-handling check on what changed since the last one:
  `git diff v<last>..main -- packages/fondu/src`.

A pull request says which of these it checked.

## The protocol

A page is answered as a document, or as JSON to Fondu's client: the server side is `server/protocol.ts` (with
`server/flash.ts`, `server/http.ts`, `server/validate.ts`), the browser side `client/navigation.ts`, on the History
API. A change to it:

- has its server case tested in `packages/fondu/test/protocol.test.ts`;
- is checked in a browser: links, forms, Back and Forward, a redirect, a new build. A change to `client/navigation.ts`
  in Chromium, Firefox and Safari.

## Describing Fondu

One wording everywhere: the READMEs, both `package.json` descriptions, the GitHub description, fondu.dev and
`llms.txt`.

- The tagline: Server routes. React pages. No API in between.
- What Fondu is: A small meta-framework for full-stack React apps, built on Hono and Vite. It runs on Bun, Cloudflare
  Workers and Node.
- What an app is: a Fondu app: full-stack React on Hono and Vite.
- Hono and Vite, in that order; the targets in alphabetical order (Bun, Cloudflare Workers, Node).

## Releases

Maintainers release with `bun run release` from the repository's root, on an up-to-date `main` (`git pull` first:
a release made on an old `main` is refused when it is pushed): fondu and create-fondu get the same version
(create-fondu's apps depend on `^` its own version). CI stages both on npm and a maintainer approves them (npmjs.com
→ Staged Packages, or `npm stage approve <id>`, with 2FA).

The version, by what changed since the last release (`bun run release` offers them; not `next`, which only adds one
to the last number):

| Changed          | Before 1.0            | From 1.0              |
| ---------------- | --------------------- | --------------------- |
| something breaks | minor (0.6 → 0.7)     | major (1 → 2)         |
| a feature        | minor (0.6 → 0.7)     | minor (1.0 → 1.1)     |
| fixes only       | patch (0.6.0 → 0.6.1) | patch (1.0.0 → 1.0.1) |

1.0 itself is a major.

Before a release, read what npm will show and what new apps get, as it can only change with the next version:

- `README.md`: fondu's npm page (CI copies it into `packages/fondu`); its links absolute, as npm resolves relative
  ones inside the package
- `packages/create-fondu/README.md`: create-fondu's npm page
- `packages/create-fondu/template/`: the new app's `README.md` and `AGENTS.md`
- the docs (`apps/site`), for what the release changes

After it: deploy fondu.dev and the demo, and create an app on each target with the published create-fondu.
