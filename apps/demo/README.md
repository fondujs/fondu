# Fondu demo

Every Inertia feature, one page each, on Cloudflare Workers with D1 and Better Auth: https://demo.fondu.dev

## Run it

```bash
cp .dev.vars.example .dev.vars
bun run dev        # in workerd, with a local D1
bun run preview    # the production build, locally
```

## Deploy (by hand)

Once, with the fondu.dev zone on the same Cloudflare account:

```bash
bunx wrangler login
bunx wrangler secret put BETTER_AUTH_SECRET   # a value from `openssl rand -base64 32`; create the Worker when asked
bun run deploy                                # creates the D1 database (its id is written to wrangler.jsonc: commit it)
bun run db:migrate                            # the tables and the demo accounts, in the remote database
```

Then `bun run deploy` for each new version (and `bun run db:migrate` when `migrations/` changed).

- The demo signs in with its two accounts (on the sign-in page); sign-up is turned off.
- Every 6 hours a cron (wrangler.jsonc) puts the data back to the seed: `resetDemo()` in `app/modules/demo/demo.server.ts`.
- `robots.txt` keeps it out of search engines.
