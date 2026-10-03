"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The message is logged locally only; nothing is sent anywhere.
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-20">
      <p className="legend" style={{ color: "var(--color-signal-risk)" }}>
        Something broke
      </p>
      <h1 className="mt-2 font-display text-2xl font-semibold">
        This page could not be completed
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-dim">
        The failure was contained and nothing was left half-written. Try again, or start from the
        workspace.
      </p>
      {error.digest ? (
        <p className="readout mt-3 text-xs text-ink-faint">reference {error.digest}</p>
      ) : null}
      <div className="mt-6 flex flex-wrap gap-3">
        <Button onClick={reset}>Try again</Button>
        <Link
          href="/"
          className="legend border border-rule bg-panel px-4 py-2.5 transition-colors hover:border-ink"
        >
          Back to the start
        </Link>
      </div>
    </div>
  );
}