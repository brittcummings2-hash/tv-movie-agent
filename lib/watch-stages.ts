import type { WatchStatus } from "./types";

export const PIPELINE_STAGES = ["want_to_watch", "watching", "watched"] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const STAGE_LABELS: Record<string, string> = {
  want_to_watch: "Want to Watch",
  watching: "In Progress",
  caught_up: "Caught Up",
  watched: "Watched",
  dnf: "Did Not Finish",
};

export type CanonicalWatchStatus = "want_to_watch" | "watching" | "caught_up" | "watched" | "dnf";

/**
 * Collapse any human/agent-written status label into a canonical key.
 * Handles "In progress", "Watching now", "Want to Watch", "Done", etc.
 * Sheets are hand-edited, so the same stage shows up under many spellings.
 */
export function normalizeWatchStatus(value: unknown): CanonicalWatchStatus {
  const status = String(value ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  if (status === "dnf" || status === "did_not_finish" || status === "dropped" || status === "abandoned") {
    return "dnf";
  }
  if (
    status === "caught_up" ||
    status === "caught" ||
    status === "waiting" ||
    status === "up_to_date" ||
    status === "current"
  ) {
    return "caught_up";
  }
  if (status === "watching" || status === "in_progress" || status === "watching_now" || status === "started") {
    return "watching";
  }
  if (
    status === "want_to_watch" ||
    status === "want" ||
    status === "queue" ||
    status === "queued" ||
    status === "watchlist" ||
    status === "saved" ||
    status === "to_watch"
  ) {
    return "want_to_watch";
  }
  return "watched";
}

export function isPipelineStage(status: string): status is PipelineStage {
  return PIPELINE_STAGES.includes(status as PipelineStage);
}

export function nextPipelineStage(status: string): PipelineStage | null {
  const index = PIPELINE_STAGES.indexOf(status as PipelineStage);
  if (index === -1 || index >= PIPELINE_STAGES.length - 1) return null;
  return PIPELINE_STAGES[index + 1];
}

export function prevPipelineStage(status: string): PipelineStage | null {
  const index = PIPELINE_STAGES.indexOf(status as PipelineStage);
  if (index <= 0) return null;
  return PIPELINE_STAGES[index - 1];
}

export function stageActionLabel(from: string, to: WatchStatus): string {
  if (to === "watching") return "Start";
  if (to === "caught_up") return "Caught up";
  if (to === "watched") return "Done";
  if (to === "want_to_watch") return "Queue";
  if (to === "dnf") return "DNF";
  return STAGE_LABELS[to] ?? to;
}
