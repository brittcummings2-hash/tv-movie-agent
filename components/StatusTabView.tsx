"use client";

import { useMemo } from "react";
import type { EpisodeAlert, Recommendation, UserRating, WatchStatus } from "@/lib/types";
import { normalizeTitle } from "@/lib/search";
import type { AppTab } from "./Nav";
import { LibrarySection } from "./LibrarySection";

import type { LibraryEntryDraft } from "./EditLibraryEntryModal";

interface StatusTabViewProps {
  tab: Exclude<AppTab, "recommended">;
  items: UserRating[];
  recommendations: Recommendation[];
  alerts?: EpisodeAlert[];
  onDismissAlert?: (alert: EpisodeAlert) => void;
  onMoveStage: (item: UserRating, status: WatchStatus) => Promise<void>;
  onRate: (item: UserRating, rating: number) => Promise<void>;
  onUpdate: (item: UserRating, draft: LibraryEntryDraft) => Promise<void>;
  onDelete: (item: UserRating) => Promise<void>;
  onProfileShow?: (item: UserRating) => void;
}

function matchesStatus(item: UserRating, status: string): boolean {
  return item.watch_status.toLowerCase() === status;
}

export function StatusTabView({
  tab,
  items,
  recommendations,
  alerts,
  onDismissAlert,
  onMoveStage,
  onRate,
  onUpdate,
  onDelete,
  onProfileShow,
}: StatusTabViewProps) {
  // An unseen episode alert surfaces a show in In Progress regardless of where
  // it's stored — so a finished show with a new episode pops back in. Dismissing
  // the alert (flipping `seen`) drops it back to its real stage.
  const alertTitles = useMemo(() => {
    const set = new Set<string>();
    for (const alert of alerts ?? []) {
      if (alert.seen) continue;
      const key = normalizeTitle(alert.show_title);
      if (key) set.add(key);
    }
    return set;
  }, [alerts]);

  const hasAlert = (item: UserRating) => alertTitles.has(normalizeTitle(item.show_title));

  const sortByRecent = (a: UserRating, b: UserRating) =>
    b.updated_at.localeCompare(a.updated_at) || a.show_title.localeCompare(b.show_title);

  // In Progress splits into three groups: a new episode dropped, actively
  // watching, and caught up (waiting for the next episode).
  const newEpisodes = useMemo(
    () => items.filter((item) => hasAlert(item)).sort(sortByRecent),
    [items, alertTitles]
  );

  const watchingNow = useMemo(
    () =>
      items
        .filter((item) => matchesStatus(item, "watching") && !hasAlert(item))
        .sort(sortByRecent),
    [items, alertTitles]
  );

  const caughtUp = useMemo(
    () =>
      items
        .filter((item) => matchesStatus(item, "caught_up") && !hasAlert(item))
        .sort(sortByRecent),
    [items, alertTitles]
  );

  const watched = useMemo(
    () =>
      items
        .filter((item) => matchesStatus(item, "watched") && !hasAlert(item))
        .sort(
          (a, b) =>
            b.updated_at.localeCompare(a.updated_at) ||
            a.show_title.localeCompare(b.show_title)
        ),
    [items, alertTitles]
  );

  const dnf = useMemo(
    () =>
      items
        .filter((item) => matchesStatus(item, "dnf") && !hasAlert(item))
        .sort((a, b) => a.show_title.localeCompare(b.show_title)),
    [items, alertTitles]
  );

  if (tab === "watching") {
    const total = newEpisodes.length + watchingNow.length + caughtUp.length;
    if (total === 0) {
      return (
        <div className="empty-state empty-state-compact">
          Nothing in progress — start something from Recommended.
        </div>
      );
    }
    const hasOtherGroups = newEpisodes.length > 0 || caughtUp.length > 0;
    return (
      <>
        {newEpisodes.length > 0 && (
          <LibrarySection
            label="New Episodes"
            variant="alerts"
            items={newEpisodes}
            recommendations={recommendations}
            showRecContent
            showNextEpisode
            alerts={alerts}
            onDismissAlert={onDismissAlert}
            onMoveStage={onMoveStage}
            onUpdate={onUpdate}
            onDelete={onDelete}
            onProfileShow={onProfileShow}
          />
        )}
        {watchingNow.length > 0 && (
          <LibrarySection
            label="Watching"
            variant="in-progress"
            hideLabel={!hasOtherGroups}
            items={watchingNow}
            recommendations={recommendations}
            showRecContent
            showNextEpisode
            onMoveStage={onMoveStage}
            onUpdate={onUpdate}
            onDelete={onDelete}
            onProfileShow={onProfileShow}
          />
        )}
        {caughtUp.length > 0 && (
          <LibrarySection
            label="Caught Up · Waiting for Next Episode"
            variant="want-to-watch"
            items={caughtUp}
            recommendations={recommendations}
            showRecContent
            showNextEpisode
            onMoveStage={onMoveStage}
            onUpdate={onUpdate}
            onDelete={onDelete}
            onProfileShow={onProfileShow}
          />
        )}
      </>
    );
  }

  if (watched.length === 0 && dnf.length === 0) {
    return (
      <div className="empty-state empty-state-compact">
        Nothing finished yet — mark a show done from In Progress.
      </div>
    );
  }

  return (
    <>
      <LibrarySection
        label="Watched"
        variant="watched"
        hideLabel
        items={watched}
        recommendations={recommendations}
        showRecContent
        collapsible
        collapseAfter={8}
        showRating
        onMoveStage={onMoveStage}
        onRate={onRate}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />
      <LibrarySection
        label="Did Not Finish"
        variant="dnf"
        items={dnf}
        recommendations={recommendations}
        showRecContent
        onMoveStage={onMoveStage}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />
    </>
  );
}
