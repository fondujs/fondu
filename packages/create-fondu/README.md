# create-fondu

Create a [Fondu](https://fondu.dev) app: full-stack React on Hono, Vite and Inertia, with Tailwind CSS, for Bun,
Cloudflare Workers or Node.

```bash
bun create fondu@latest my-app
npm create fondu@latest my-app
pnpm create fondu@latest my-app
```

Options (`--help` lists them):

- `--target bun|cloudflare|node`: where the app runs
- `--checks` / `--no-checks`: code checks: oxfmt and oxlint, git hooks that run them and check commit messages
  (lefthook, commitlint), VS Code settings that format on save
- `--git` / `--no-git`: a git repository, where the install sets up the hooks
- `--no-install`
- `-y`, `--yes`: the defaults for what the options don't say (my-app, no checks, git, install), without asking

```bash
bun create fondu@latest my-app --target cloudflare --checks --yes
```

Then the [quick start](https://fondu.dev/docs/quick-start), and the [docs](https://fondu.dev/docs).
