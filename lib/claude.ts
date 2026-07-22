import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function isClaudeConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

function getClient(): Anthropic {
  if (!isClaudeConfigured()) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }
  if (!client) {
    client = new Anthropic();
  }
  return client;
}

function getModel(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || "claude-opus-4-8";
}

export interface ClaudeJsonRequest {
  system: string;
  user: string;
  /** Allow the model to ground buzz/availability claims via web search. */
  webSearches?: number;
  maxTokens?: number;
  /** "low" keeps latency-sensitive calls fast; omit for the default depth. */
  effort?: "low" | "medium" | "high";
}

/**
 * Ask Claude for a JSON payload. The response text may include prose or
 * search citations around the JSON, so the first balanced object is parsed
 * out rather than trusting the raw text.
 */
export async function askClaudeJson<T>(request: ClaudeJsonRequest): Promise<T> {
  const tools: Anthropic.Messages.ToolUnion[] = [];
  if (request.webSearches && request.webSearches > 0) {
    tools.push({
      type: "web_search_20260209",
      name: "web_search",
      max_uses: request.webSearches,
    });
  }

  const response = await getClient().messages.create({
    model: getModel(),
    max_tokens: request.maxTokens ?? 8192,
    thinking: { type: "adaptive" },
    ...(request.effort ? { output_config: { effort: request.effort } } : {}),
    system: request.system,
    tools,
    messages: [{ role: "user", content: request.user }],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  if (!text.trim()) {
    throw new Error("Claude returned no content");
  }

  return extractJson<T>(text);
}

export function extractJson<T>(text: string): T {
  const cleaned = text.replace(/```(?:json)?/g, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Claude response contained no JSON object");
  }
  return JSON.parse(cleaned.slice(start, end + 1)) as T;
}
