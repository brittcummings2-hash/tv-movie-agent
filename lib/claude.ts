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
  /** Hard per-call budget. A stalled call must fail fast, not eat the run. */
  timeoutMs?: number;
  /** SDK retries; default 1. Pass 0 when the caller owns its own fallback. */
  maxRetries?: number;
  /** Observe the raw response text (pre-parse) — for diagnosing empty payloads. */
  onText?: (text: string) => void;
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

  // Two hard-won lessons encoded here (both took the twice-weekly cron down
  // for weeks):
  // - Stream instead of a single blocking request: long web-search turns sit
  //   idle for minutes on a non-streaming connection and something in the
  //   path eventually gives up, so the call "hangs" until the SDK timeout.
  // - Web-search turns can end with stop_reason "pause_turn" — partial
  //   content the caller must send back to continue. Treating it as final
  //   yielded "no JSON object" failures.
  const deadline = Date.now() + (request.timeoutMs ?? 120_000);
  const messages: Anthropic.Messages.MessageParam[] = [
    { role: "user", content: request.user },
  ];

  let response: Anthropic.Message;
  for (;;) {
    const remaining = deadline - Date.now();
    if (remaining <= 5_000) {
      throw new Error("Claude call exceeded its time budget");
    }

    // The SDK's timeout only guards the connection — a stream that keeps
    // trickling can run forever. The abort signal makes the budget real.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remaining);
    try {
      const stream = getClient().messages.stream(
        {
          model: getModel(),
          max_tokens: request.maxTokens ?? 8192,
          thinking: { type: "adaptive" },
          ...(request.effort ? { output_config: { effort: request.effort } } : {}),
          system: request.system,
          tools,
          messages,
        },
        {
          timeout: remaining,
          maxRetries: request.maxRetries ?? 1,
          signal: controller.signal,
        }
      );
      response = await stream.finalMessage();
    } finally {
      clearTimeout(timer);
    }

    if (response.stop_reason !== "pause_turn") break;
    messages.push({
      role: "assistant",
      content: response.content as Anthropic.Messages.ContentBlockParam[],
    });
  }

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  request.onText?.(text);

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
