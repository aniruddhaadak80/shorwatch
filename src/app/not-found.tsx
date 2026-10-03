import Link from "next/link";
import { SITE } from "@/config/site";

export default function NotFound() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-20">
      <p className="legend">404</p>
      <h1 className="mt-2 font-display text-2xl font-semibold">
        No such reading on this bench
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-dim">
        The address you asked for is not part of {SITE.name}. The routes that exist are listed in
        the navigation above.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/"
          className="legend border border-bezel bg-bezel px-4 py-2.5 text-bench"
        >
          Start over
        </Link>
        <Link
          href="/watches"
          className="legend border border-rule bg-panel px-4 py-2.5 transition-colors hover:border-ink"
        >
          Open the workspace
        </Link>
      </div>
    </div>
  );
}