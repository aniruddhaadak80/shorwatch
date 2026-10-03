"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { REPO_LINK_LABEL, SITE } from "@/config/site";
import { GithubMark } from "./github-mark";

interface NavItem {
  href: string;
  label: string;
}

export function SiteHeader({ navigation }: { navigation: readonly NavItem[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-bench/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label={`${SITE.name} home`}>
          <span
            aria-hidden="true"
            className="bezel flex size-7 items-center justify-center text-[0.6rem] font-bold"
          >
            SW
          </span>
          <span className="font-display text-lg font-semibold tracking-tight">
            {SITE.name}
          </span>
        </Link>

        <nav aria-label="Primary" className="ml-auto hidden items-center gap-1 md:flex">
          {navigation.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={close}
                aria-current={active ? "page" : undefined}
                className={`legend px-2.5 py-1.5 transition-colors ${
                  active
                    ? "legend-strong border-b-2 border-signal-live"
                    : "hover:text-ink"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <a
          href={SITE.repoUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${REPO_LINK_LABEL} — opens ${SITE.repoUrl} in a new tab`}
          title={`${REPO_LINK_LABEL} — ${SITE.repoUrl}`}
          data-testid="repo-link-header"
          className="ml-auto inline-flex items-center gap-2 border border-bezel bg-bezel px-3 py-2 text-xs font-medium text-bench transition-colors hover:bg-ink md:ml-0"
        >
          <GithubMark />
          <span className="hidden sm:inline">{REPO_LINK_LABEL}</span>
          <span className="sm:hidden">GitHub</span>
        </a>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="mobile-nav"
          className="inline-flex size-9 items-center justify-center border border-rule bg-panel md:hidden"
        >
          <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
          {open ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
        </button>
      </div>

      {open ? (
        <nav
          id="mobile-nav"
          aria-label="Mobile"
          className="border-t border-rule bg-panel md:hidden"
        >
          <ul className="mx-auto w-full max-w-7xl px-4 py-2 sm:px-6">
            {navigation.map((item) => (
              <li key={item.href} className="border-b border-rule-soft last:border-b-0">
                <Link
                  href={item.href}
                  onClick={close}
                  aria-current={pathname === item.href ? "page" : undefined}
                  className="legend flex items-center justify-between py-3"
                >
                  {item.label}
                  <span aria-hidden="true">&rarr;</span>
                </Link>
              </li>
            ))}
            <li className="py-3">
              <a
                href={SITE.repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${REPO_LINK_LABEL} — opens ${SITE.repoUrl} in a new tab`}
                data-testid="repo-link-mobile"
                className="legend inline-flex items-center gap-2 border border-bezel bg-bezel px-3 py-2 text-bench"
              >
                <GithubMark />
                {REPO_LINK_LABEL}
              </a>
            </li>
          </ul>
        </nav>
      ) : null}
    </header>
  );
}