# Security

## Reporting a vulnerability

Please report it privately: [open a security advisory](https://github.com/fondujs/fondu/security/advisories/new)
(GitHub's private vulnerability reporting). Don't open a public issue, pull request or discussion about it.

Say what is affected (a version of `fondu`, a target: Bun, Cloudflare Workers or Node), how to reproduce it, and what
an attacker could do with it. You'll get an answer within a week; a fix is released as a new version, with an advisory
crediting you if you like.

## Supported versions

Only the latest release of `fondu` gets fixes. The example apps in `apps/` are demos, not packages; reports about them
are welcome too.

## Releases

Every version of `fondu` on npm is built and staged by this repository's release workflow (trusted publishing, with
provenance) and goes live only after a maintainer approves it with 2FA. A version without provenance (other than
0.1.0, published by hand) did not come from here.
