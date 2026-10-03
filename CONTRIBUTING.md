# Contributing to Shorwatch

Thanks for helping measure real public keys instead of guessing at them.

## Getting set up

```bash
git clone https://github.com/aniruddhaadak80/shorwatch.git
cd shorwatch
npm ci
npm run dev
```

There is nothing to configure. No API key, no account, no database to provision.
Development runs against an embedded PGlite database in `./.pglite`, and every
live data source Shorwatch uses is keyless.

## The quality gates

Run these before you open a pull request:

```bash
npm run typecheck   # tsc --noEmit, strict mode
npm run lint        # eslint, zero warnings tolerated
npm run test        # vitest unit suite
npm run build       # production build
npm run check       # all four in sequence
```

For the browser journey, start a server and point Playwright at it:

```bash
npm run build
node scripts/start-local.mjs 3000
BASE_URL=http://localhost:3000 npm run test:e2e
```

To verify a deployment end to end, including the MCP endpoint and integrity
replay:

```bash
BASE_URL=https://<your-alias>.vercel.app npm run verify
```

## Where things live

| Path | Responsibility |
| --- | --- |
| `src/lib/der.ts` | DER reader that extracts SubjectPublicKeyInfo from a certificate |
| `src/lib/engine/` | The scoring engine, resource model and quantum advisor |
| `src/lib/integrity/seal.ts` | Canonical JSON and the SHA-384 audit chain |
| `src/lib/sources/` | Live source adapters and the sealed offline fallback |
| `src/lib/db/` | Schema plus the Neon and PGlite adapters |
| `src/lib/service.ts` | The single service layer every write path uses |
| `src/lib/mcp/tools.ts` | Tool definitions and handlers |
| `src/app/` | Routes, both user-facing and API |

## Ground rules

1. **The engine is the contract.** If you change a score, a deadline or a factor
   weight, bump `ENGINE_VERSION` in `src/lib/engine/constants.ts`, update the
   table on `/standards`, and explain the change in the pull request.
2. **Every constant is published.** A number that moves a decision belongs in
   `constants.ts` with a source, not inline in a component.
3. **No self-reported key material.** Findings come from the wire. Do not add a
   form that asks a visitor what algorithm they use.
4. **Sealed fallback data must stay labelled.** Anything from
   `SEALED_FALLBACK` carries `status: "fallback"` and must never be presented as
   current.
5. **Mutations append to the chain.** Add an audit event for any new write.
6. **Tests must fail before the fix.** A pull request whose tests pass against
   the unfixed code proves nothing.

## Reporting bugs

Open an issue with the host you measured, what you expected, and what Shorwatch
showed. If it involves parsing, the certificate fingerprint is the most useful
detail you can include.

Security issues follow [SECURITY.md](SECURITY.md) instead.

## Hacktoberfest

Good first contributions: add an algorithm OID to `src/lib/der.ts` with a test
fixture, add a post-quantum parameter set to `PQC_PARAMETERS`, extend the
Certificate Transparency adapter, or improve an accessible state. Comment the
issue you are working on so effort is not duplicated.