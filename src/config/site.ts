/**
 * Single source of truth for product identity, navigation and outbound links.
 * Header, mobile menu, footer, landing CTA, metadata and public manifests all
 * read from here so the repository URL is never duplicated across components.
 */

/**
 * The verified production alias. Kept as a literal fallback so metadata,
 * sitemap and the agent manifest are correct even when the environment variable
 * is absent, for example during a local production build.
 */
export const PRODUCTION_URL = "https://shorwatch-aniruddha-adaks-projects.vercel.app";

function normaliseBase(value: string | undefined, fallback: string): string {
  const raw = (value ?? "").trim();
  if (!raw) return fallback;
  return raw.replace(/\/+$/, "");
}

export const SITE = {
  name: "Shorwatch",
  tagline: "Know which public keys an adversary can already harvest.",
  description:
    "Shorwatch reads the certificate a server is actually serving, corroborates how long that exact key has been public in Certificate Transparency, and computes a post-quantum harvest deadline you can triage and export.",
  /** Repository slug. The URL is derived, never retyped. */
  repoSlug: "aniruddhaadak80/shorwatch",
  get repoUrl(): string {
    return `https://github.com/${SITE.repoSlug}`;
  },
  /** Base URL of the deployed production alias. Set NEXT_PUBLIC_SITE_URL in production. */
  liveUrl: normaliseBase(process.env.NEXT_PUBLIC_SITE_URL, PRODUCTION_URL),
  author: "Aniruddha Adak",
  license: "MIT",
  engineName: "shorwatch-quantum",
  engineVersion: "1.0.0",
  mcpProtocolVersion: "2025-06-18",
} as const;

export const NAV = [
  { href: "/watches", label: "Watches" },
  { href: "/analysis", label: "Analysis" },
  { href: "/standards", label: "Standards" },
  { href: "/export", label: "Export" },
  { href: "/agent", label: "Agent" },
  { href: "/verify", label: "Verify" },
  { href: "/settings", label: "Settings" },
] as const;

/** Label used by every outbound repository control. Kept identical across surfaces. */
export const REPO_LINK_LABEL = "Star on GitHub";