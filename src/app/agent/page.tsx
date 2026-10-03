import type { Metadata } from "next";
import { PageIntro } from "@/components/ui";
import { AgentConsole } from "@/components/agent-console";
import { toolsList } from "@/lib/mcp/tools";
import { SITE } from "@/config/site";

export const metadata: Metadata = {
  title: "Agent",
  description:
    "A live JSON-RPC 2.0 console for the Shorwatch MCP endpoint. Every tool call travels the same service layer the interface uses.",
  alternates: { canonical: "/agent" },
};

export default function AgentPage() {
  const { tools } = toolsList();
  const readOnly = tools.filter((tool) => tool.annotations.readOnlyHint);
  const mutating = tools.filter((tool) => !tool.annotations.readOnlyHint);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
      <PageIntro
        eyebrow="agent interface"
        title="Eleven tools over JSON-RPC 2.0"
        body="The endpoint is a real MCP-style server. Reads return live measurements, mutations write through the same service layer the buttons use, and an idempotency key makes a retried mutation safe."
      />

      <div className="my-8 grid gap-6 lg:grid-cols-2">
        <ToolTable title="Read and analyse" tools={readOnly} />
        <ToolTable title="Mutate" tools={mutating} />
      </div>

      <div className="panel mb-8 p-4">
        <p className="legend legend-strong">Connect an MCP client</p>
        <pre className="readout mt-2 overflow-auto border border-rule bg-bench p-3 text-xs leading-relaxed">{JSON.stringify(
          {
            mcpServers: {
              shorwatch: {
                type: "http",
                url: `${SITE.liveUrl}/api/mcp`,
              },
            },
          },
          null,
          2,
        )}</pre>
        <p className="legend mt-2">
          The same configuration is served at{" "}
          <a href="/mcp.json" className="text-signal-live underline underline-offset-2">
            /mcp.json
          </a>
          .
        </p>
      </div>

      <AgentConsole />
    </div>
  );
}

function ToolTable({
  title,
  tools,
}: {
  title: string;
  tools: ReturnType<typeof toolsList>["tools"];
}) {
  return (
    <section className="panel">
      <div className="border-b border-rule px-4 py-3">
        <h2 className="legend legend-strong">
          {title} · {tools.length}
        </h2>
      </div>
      <ul className="divide-y divide-rule-soft">
        {tools.map((tool) => (
          <li key={tool.name} className="p-4">
            <code className="readout text-sm font-semibold">{tool.name}</code>
            <p className="mt-1 text-xs leading-relaxed text-ink-dim">{tool.description}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}