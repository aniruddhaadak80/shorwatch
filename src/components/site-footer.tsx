import Link from "next/link";
import { REPO_LINK_LABEL, SITE } from "@/config/site";
import { GithubMark } from "./github-mark";
import { DISCLAIMER } from "@/lib/engine/constants";

interface NavItem {
  href: string;
  label: string;
}

export function SiteFooter({ navigation }: { navigation: readonly NavItem[] }) {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-16 border-t border-rule bg-bench-deep">
      <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
        <div className="grid gap-8 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <p className="legend legend-strong">{SITE.name}</p>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-dim">
              {SITE.description}
            </p>
            <a
              href={SITE.repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${REPO_LINK_LABEL} — opens ${SITE.repoUrl} in a new tab`}
              title={`${REPO_LINK_LABEL} — ${SITE.repoUrl}`}
              data-testid="repo-link-footer"
              className="mt-4 inline-flex items-center gap-2 border border-bezel bg-bezel px-3 py-2 text-xs font-medium text-bench transition-colors hover:bg-ink"
            >
              <GithubMark />
              {REPO_LINK_LABEL}
            </a>
          </div>

          <nav aria-label="Footer">
            <p className="legend">Product</p>
            <ul className="mt-3 space-y-2">
              {navigation.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-sm text-ink-dim transition-colors hover:text-ink"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <p className="legend">Project</p>
            <ul className="mt-3 space-y-2">
              <li>
                <a
                  href={`${SITE.repoUrl}/blob/main/LICENSE`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-ink-dim transition-colors hover:text-ink"
                >
                  MIT License
                </a>
              </li>
              <li>
                <a
                  href={`${SITE.repoUrl}/blob/main/CONTRIBUTING.md`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-ink-dim transition-colors hover:text-ink"
                >
                  Contributing
                </a>
              </li>
              <li>
                <a
                  href={`${SITE.repoUrl}/blob/main/SECURITY.md`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-ink-dim transition-colors hover:text-ink"
                >
                  Security policy
                </a>
              </li>
              <li>
                <a
                  href={`${SITE.repoUrl}/issues`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-ink-dim transition-colors hover:text-ink"
                >
                  Issues
                </a>
              </li>
              <li>
                <Link href="/agent" className="text-sm text-ink-dim transition-colors hover:text-ink">
                  Agent tools
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-rule pt-6">
          <p className="max-w-3xl text-xs leading-relaxed text-ink-faint">{DISCLAIMER}</p>
          <p className="mt-4 text-xs text-ink-faint">
            &copy; {year} {SITE.author}. MIT licensed.{" "}
            <a
              href={SITE.repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              Source on GitHub
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}