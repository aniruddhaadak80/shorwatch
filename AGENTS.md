# Working on Shorwatch

## Before you change a score

The engine is this project's contract. If you alter a score, a deadline, a
factor weight or a resource anchor:

1. Bump `ENGINE_VERSION` in `src/lib/engine/constants.ts`.
2. Update the tables on `/standards` so the published value matches the code.
3. Add or update the unit tests that pin the behaviour.
4. Explain the change and its effect on existing findings in the pull request.

## The rules that matter

- **Never take key material from a form.** Findings come from the wire
  (`src/lib/sources/tls.ts`) or from Certificate Transparency. A control that
  asks a visitor what algorithm they use does not belong here.
- **One engine.** Score only through `evaluateHarvest` in
  `src/lib/engine/index.ts`. Never recompute a score inside a component.
- **One write path.** Every mutation goes through `src/lib/service.ts`, and every
  mutation appends to the audit chain in the same call.
- **Keep fallback labelled.** Anything from `SEALED_FALLBACK` carries
  `status: "fallback"` and must never be merged into a user record.
- **Keep constants published.** A number that moves a decision belongs in
  `constants.ts` with a source, not inline in a component.
- **PGlite is local only.** `resolveAdapter()` refuses to select the embedded
  store in production without `DATABASE_URL`, and `serverExternalPackages` in
  `next.config.ts` keeps its WebAssembly out of the server bundle.

## Before you open a pull request

```bash
npm run check      # typecheck, lint, unit tests, production build
npm run test:e2e   # the browser journey, starts its own server
```

Tests must fail before the fix and pass after it. A test that passes against the
unbroken code proves nothing.

## Verifying a deployment

```bash
BASE_URL=https://shorwatch-aniruddha-adaks-projects.vercel.app npm run verify
```

This performs the full journey over real HTTP: create, read back, update, engine
analysis, an agent mutation, integrity replay and a guarded delete. For a
deployment you own you can also run the browser suite against it with
`SKIP_WEBSERVER=1 BASE_URL=… npm run test:e2e`.

## This is not the Next.js you know

This project pins **Next.js 16**. APIs, conventions and file structure differ
from older versions, and this repository also uses `src/proxy.ts` (formerly
`middleware.ts`). Before writing code against a framework API, read the guide in
`node_modules/next/dist/docs/` — `03-layouts-and-pages.md` for props and
`async` params, `15-route-handlers.md` for handlers, and `16-proxy.md` for the
proxy convention.

Two Next 16 specifics that have already bitten this codebase:

- `cookies()` is read-only inside Server Components. The session cookie is
  therefore set in `src/proxy.ts`, which runs before any render.
- Server Components and Route Handlers compile into separate module graphs, so a
  module-level cache is not process-wide. The database client is cached on
  `globalThis` for exactly this reason.