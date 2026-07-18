# Provider and Platform References

Consulted on: 2026-07-18

## Telegram

- [Telegram Mini Apps](https://core.telegram.org/bots/webapps) — official
  reference for `themeParams`, `colorScheme`, `ready()`, BackButton,
  `safeAreaInset`, `contentSafeAreaInset`, compact launch mode, and fullscreen
  capability. Used only to normalize the design and webview constraints.

## Monnify

No Monnify endpoint, payload, status, retry, signature, webhook, charge, or
payout behavior was implemented in Milestone 1, so no Monnify behavior page was
consulted or encoded.

Before any Monnify implementation, consult and record the exact current pages
under [developers.monnify.com](https://developers.monnify.com/) required by
`docs/04_MONNIFY_INTEGRATION.md`. The adapter remains explicitly disabled.

## Toolchain references

- [Node.js release schedule](https://nodejs.org/en/about/previous-releases) —
  verified Node 24 as an LTS release line.
- [Next.js App Router](https://nextjs.org/docs/app) and
  [Next.js deployment](https://nextjs.org/docs/app/getting-started/deploying) —
  standalone output and App Router health route foundation.
