"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui";
import { SITE } from "@/config/site";

interface Preset {
  name: string;
  label: string;
  kind: "read" | "analysis" | "write";
  description: string;
  body: Record<string, unknown>;
}

const PRESETS: Preset[] = [
  {
    name: "probe_host",
    label: "Measure a host",
    kind: "analysis",
    description: "Read-only live handshake plus a full engine result. Stores nothing.",
    body: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "probe_host", arguments: { host: "vercel.com", retentionYears: 10 } },
    },
  },
  {
    name: "list_watches",
    label: "List watches",
    kind: "read",
    description: "Read-only listing with the latest summary for each watch.",
    body: { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "list_watches", arguments: { limit: 10 } } },
  },
  {
    name: "rank_watches",
    label: "Rank the queue",
    kind: "read",
    description: "Every watch ordered by how soon its quantum deadline arrives.",
    body: { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "rank_watches", arguments: {} } },
  },
  {
    name: "create_watch",
    label: "Create a watch",
    kind: "write",
    description: "Mutating. Creates a watch, measures it live and persists the observation.",
    body: {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "create_watch",
        arguments: { host: "wikipedia.org", label: "Agent-created", idempotencyKey: "agent-demo-1" },
      },
    },
  },
  {
    name: "record_decision",
    label: "Record a decision",
    kind: "write",
    description: "Mutating. Same endpoint the decision buttons use, with an idempotency key.",
    body: {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: {
        name: "record_decision",
        arguments: { id: "REPLACE_WITH_A_WATCH_ID", decision: "hybrid_migrate", idempotencyKey: "agent-decision-1" },
      },
    },
  },
  {
    name: "verify_integrity",
    label: "Replay every chain",
    kind: "read",
    description: "Recomputes each SHA-384 chain and reports the first broken link.",
    body: { jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "verify_integrity", arguments: { id: "all" } } },
  },
];

const TONE: Record<Preset["kind"], string> = {
  read: "border-signal-ok text-signal-ok",
  analysis: "border-signal-quantum text-signal-quantum",
  write: "border-signal-warn text-signal-warn",
};

/** Timing helpers live outside the component so they are not treated as render work. */
function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export function AgentConsole() {
  const [request, setRequest] = useState(JSON.stringify(PRESETS[0].body, null, 2));
  const [response, setResponse] = useState<string>("// Send a call to see the response.");
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resultLink, setResultLink] = useState<string | null>(null);

  async function send(body: unknown) {
    setBusy(true);
    setError(null);
    setResultLink(null);
    const started = nowMs();
    try {
      const httpResponse = await fetch("/api/mcp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const text = await httpResponse.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
      setResponse(JSON.stringify(parsed, null, 2));
      setElapsed(Math.round(nowMs() - started));

      // Surface a link to anything the call just persisted.
      const maybe = parsed as {
        result?: { structuredContent?: { watch?: { id?: string } } };
      };
      const watchId = maybe?.result?.structuredContent?.watch?.id;
      if (typeof watchId === "string") setResultLink(`/watches/${watchId}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "the request failed");
      setResponse("// no response");
    } finally {
      setBusy(false);
    }
  }

  function sendEdited() {
    try {
      const parsed = JSON.parse(request);
      void send(parsed);
    } catch {
      setError("the request box does not contain valid JSON");
    }
  }

  return (
    <div className="space-y-6">
      <section className="panel">
        <div className="border-b border-rule px-4 py-3">
          <h2 className="legend legend-strong">Preloaded calls</h2>
          <p className="mt-0.5 text-xs text-ink-faint">
            Each button sends a real JSON-RPC request to {SITE.liveUrl.replace(/^https?:\/\//, "")}/api/mcp
          </p>
        </div>
        <div className="grid gap-px bg-rule sm:grid-cols-2 lg:grid-cols-3">
          {PRESETS.map((preset) => (
            <div key={preset.name} className="flex flex-col bg-panel p-4">
              <span className={`legend w-fit border px-2 py-1 ${TONE[preset.kind]}`}>
                {preset.kind}
              </span>
              <h3 className="mt-2 font-display text-base font-semibold">{preset.label}</h3>
              <code className="readout mt-1 text-xs text-ink-dim">{preset.name}</code>
              <p className="mt-2 flex-1 text-xs leading-relaxed text-ink-dim">
                {preset.description}
              </p>
              <Button
                variant="secondary"
                className="mt-3"
                disabled={busy}
                onClick={() => {
                  setRequest(JSON.stringify(preset.body, null, 2));
                  void send(preset.body);
                }}
              >
                {busy ? "Calling…" : "Run"}
              </Button>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel">
          <div className="flex items-center justify-between border-b border-rule px-4 py-3">
            <h2 className="legend legend-strong">Request</h2>
            <p className="legend">JSON-RPC 2.0</p>
          </div>
          <div className="p-4">
            <label htmlFor="agent-request" className="sr-only">
              JSON-RPC request body
            </label>
            <textarea
              id="agent-request"
              value={request}
              onChange={(event) => setRequest(event.target.value)}
              rows={16}
              spellCheck={false}
              className="readout w-full border border-rule bg-bench p-3 text-xs leading-relaxed"
            />
            <Button className="mt-3" onClick={sendEdited} disabled={busy}>
              {busy ? "Calling…" : "Send"}
            </Button>
          </div>
        </section>

        <section className="panel">
          <div className="flex items-center justify-between border-b border-rule px-4 py-3">
            <h2 className="legend legend-strong">Response</h2>
            <p className="legend" aria-live="polite">
              {elapsed === null ? "idle" : `${elapsed} ms`}
            </p>
          </div>
          <div className="p-4">
            {error ? (
              <p role="alert" className="mb-3 border border-signal-risk p-3 text-sm text-signal-risk">
                {error}
              </p>
            ) : null}
            <pre className="readout max-h-[28rem] overflow-auto border border-rule bg-bench p-3 text-xs leading-relaxed">
              {response}
            </pre>
            {resultLink ? (
              <p className="mt-3 border border-signal-ok p-3 text-sm text-signal-ok">
                Persisted.{" "}
                <Link href={resultLink} className="underline underline-offset-2">
                  Open the watch
                </Link>
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}