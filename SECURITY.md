# Security Policy

## Supported versions

Shorwatch is a pre-1.0 measurement tool. Fixes land on `main` and there is no
long-term support branch.

| Version | Supported |
| --- | --- |
| `main` | Yes |

## Reporting a vulnerability

Please report security issues privately rather than opening a public issue.
Use GitHub's **Report a vulnerability** button on the Security tab of
<https://github.com/aniruddhaadak80/shorwatch>, or open a private advisory.

Include what an attacker can achieve, the route or file involved, and
reproduction steps if you have them. You can expect an acknowledgement within a
week. Fixes for confirmed issues are published as a release and credited in the
advisory unless you prefer otherwise.

## What Shorwatch is and is not

Shorwatch **measures** public key material and **projects** a deadline. It is a
planning aid, not a security control.

- It is not a vulnerability scanner and does not find CVEs.
- It does not decrypt anything and stores no secrets.
- Its deadline projections are an explicitly published, order-of-magnitude model,
  not a forecast. Read the disclaimer on `/standards` before acting on one.
- The OpenSSL configuration it exports is a starting point for review, never a
  drop-in deployment.

Never point Shorwatch at a host you are not authorised to scan. It performs a
plain TLS handshake and DNS lookups only, and records nothing about the target's
content, but the hosts you add are your responsibility.

## Security properties of this codebase

| Property | How it is enforced |
| --- | --- |
| No user accounts | An HTTP-only cookie holds a 128-bit random owner id, set in `src/proxy.ts` |
| No cross-session access | Every query is scoped by `owner_id`; a record owned by another session returns 404 |
| Protected deletion | `DELETE` requires the record's current engine seal, which only a reader of that record knows |
| Auditable history | Every write appends to a SHA-384 chain; `/verify` names the first broken link |
| No secret storage | No secret, token or credential is read, written or logged |
| Input validation | Hosts, labels, notes, retention and machine models are bounded and enum-checked in `src/lib/validation.ts` |
| Parameterised SQL | All statements use bind parameters; identifiers are allowlisted |
| Error containment | Unexpected errors are logged server-side and answered with a generic message |
| Write throttling | Per-session fixed-window limits, documented as best-effort on serverless |

## Abuse controls and their limits

Writes are limited per session per minute (12 probes, 20 creates, 60 updates).
On a serverless runtime that map is per instance, so it is a **best-effort
deterrent against accidental bursts, not a security boundary**. The durable
limits come from the database: a unique constraint on `(watch_id, spki_sha256)`
stops duplicate observations, list endpoints are bounded, and every record is
scoped to one owner. A deployment that needs hard rate limiting should put a
hosted limiter in front of `/api/watches` and `/api/mcp`.

## Outbound requests

Shorwatch makes three kinds of outbound call, all time-bounded, none
authenticated: a TLS handshake to the host you ask for, DNS-over-HTTPS queries
to `dns.google`, an issuance lookup against Cert Spotter, and an address lookup
against Shodan InternetDB. A future adapter should keep to allowlisted origins.