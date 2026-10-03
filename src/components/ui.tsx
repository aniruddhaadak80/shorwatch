import type { ReactNode } from "react";
import Link from "next/link";

/** Verdict to colour, used consistently everywhere a verdict is rendered. */
export const VERDICT_TONE: Record<string, string> = {
  harvestable_now: "border-signal-risk text-signal-risk",
  exposed_before_crq: "border-signal-warn text-signal-warn",
  window_closing: "border-signal-live text-signal-live",
  quantum_viable: "border-signal-ok text-signal-ok",
};

export function VerdictBadge({ verdict, label }: { verdict: string; label: string }) {
  return (
    <span
      className={`legend inline-flex items-center gap-1.5 border px-2 py-1 ${
        VERDICT_TONE[verdict] ?? "border-rule text-ink-dim"
      }`}
    >
      <span aria-hidden="true" className="size-1.5 bg-current" />
      {label}
    </span>
  );
}

export function SourceChip({
  label,
  status,
  fetchedAt,
}: {
  label: string;
  status: string;
  fetchedAt?: string;
}) {
  const live = status === "live";
  return (
    <span
      className={`legend inline-flex items-center gap-1.5 border px-2 py-1 ${
        live ? "border-signal-live text-signal-live" : "border-signal-warn text-signal-warn"
      }`}
    >
      <span aria-hidden="true" className="size-1.5 bg-current" />
      {label}
      <span className="text-ink-faint">
        {live ? "live" : "offline sample"}
        {fetchedAt ? ` · ${fetchedAt.slice(0, 16).replace("T", " ")} UTC` : ""}
      </span>
    </span>
  );
}

export function Loading({ label = "Reading" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="panel relative overflow-hidden p-6 sweep"
    >
      <p className="legend">{label}</p>
      <div className="mt-3 h-2 w-2/3 bg-rule-soft" />
      <div className="mt-2 h-2 w-1/2 bg-rule-soft" />
      <span className="sr-only">{label}…</span>
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="panel graticule p-8 text-center">
      <p className="legend legend-strong">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-dim">{body}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = "That did not work",
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" className="border border-signal-risk p-6">
      <p className="legend" style={{ color: "var(--color-signal-risk)" }}>
        {title}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-ink">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="legend mt-4 border border-signal-risk px-3 py-2 text-signal-risk"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function Button({
  children,
  variant = "primary",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
}) {
  const tone =
    variant === "primary"
      ? "border-bezel bg-bezel text-bench hover:bg-ink"
      : variant === "danger"
        ? "border-signal-risk text-signal-risk hover:bg-signal-risk hover:text-bench"
        : "border-rule bg-panel text-ink hover:border-ink";
  return (
    <button
      {...rest}
      className={`legend inline-flex items-center justify-center gap-2 border px-4 py-2.5 transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${tone}`}
    >
      {children}
    </button>
  );
}

export function Panel({
  title,
  legend,
  children,
  actions,
}: {
  title: string;
  legend?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="panel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule px-4 py-3">
        <div>
          <h2 className="legend legend-strong">{title}</h2>
          {legend ? <p className="mt-0.5 text-xs text-ink-faint">{legend}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function PageIntro({
  eyebrow,
  title,
  body,
  children,
}: {
  eyebrow: string;
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <div className="border-b border-rule pb-8">
      <p className="legend">{eyebrow}</p>
      <h1 className="mt-2 max-w-3xl font-display text-3xl leading-tight font-semibold sm:text-4xl">
        {title}
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-dim sm:text-base">{body}</p>
      {children ? <div className="mt-6">{children}</div> : null}
    </div>
  );
}

export function MonoValue({
  label,
  value,
  tone,
}: {
  label: string;
  value: ReactNode;
  tone?: "risk" | "ok" | "live" | "quantum" | "warn";
}) {
  const colour =
    tone === "risk"
      ? "text-signal-risk"
      : tone === "ok"
        ? "text-signal-ok"
        : tone === "live"
          ? "text-signal-live"
          : tone === "quantum"
            ? "text-signal-quantum"
            : tone === "warn"
              ? "text-signal-warn"
              : "text-ink";
  return (
    <div className="border border-rule px-3 py-2.5">
      <p className="legend">{label}</p>
      <p className={`readout mt-1 text-lg font-semibold ${colour}`}>{value}</p>
    </div>
  );
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="legend text-ink-dim transition-colors hover:text-ink">
      <span aria-hidden="true">&larr;</span> {children}
    </Link>
  );
}