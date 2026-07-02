"use client";

import type { UserRating, WatchStatus } from "@/lib/types";
import { normalizeWatchStatus } from "@/lib/watch-stages";

interface StageControlsProps {
  item: UserRating;
  onMoveStage?: (item: UserRating, status: WatchStatus) => void;
  compact?: boolean;
}

export function StageControls({ item, onMoveStage, compact = false }: StageControlsProps) {
  if (!onMoveStage) return null;

  const status = normalizeWatchStatus(item.watch_status);

  const button = (to: WatchStatus, label: string, primary = false) => (
    <button
      type="button"
      className={`btn ${primary ? "btn-primary" : "btn-ghost"} btn-xs`}
      onClick={() => onMoveStage(item, to)}
    >
      {label}
    </button>
  );

  return (
    <div className={`stage-nav${compact ? " stage-nav-compact" : ""}`}>
      {status === "want_to_watch" && button("watching", "Start →", true)}
      {status === "watching" && (
        <>
          {button("caught_up", "Caught up")}
          {button("watched", "Done →", true)}
        </>
      )}
      {status === "caught_up" && (
        <>
          {button("watching", "← Watching")}
          {button("watched", "Done →", true)}
        </>
      )}
      {status === "watched" && button("watching", "← Start")}
      {status === "dnf" ? button("want_to_watch", "← Queue") : button("dnf", "DNF")}
    </div>
  );
}
