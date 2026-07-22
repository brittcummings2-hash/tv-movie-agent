"use client";

import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { EpisodeAlert, Recommendation, ToastMessage, UserRating, WatchStatus } from "@/lib/types";
import {
  filterActiveRecommendations,
  filterAlerts,
  filterLibraryItems,
  filterRecommendations,
  findRecommendationForTitle,
  findSearchResultTab,
  normalizeTitle,
} from "@/lib/search";
import { formatFinishTags } from "@/lib/finish-tags";
import { structuredFromRecommendation } from "@/lib/structured-entry";
import { AddShowModal } from "./AddShowModal";
import type { DismissPayload } from "./DismissModal";
import type { LibraryEntryDraft } from "./EditLibraryEntryModal";
import { FinishWatchedModal, type FinishWatchedPayload } from "./FinishWatchedModal";
import { StatusTabView } from "./StatusTabView";
import { StatsView } from "./StatsView";
import { Nav } from "./Nav";
import { ToastContainer, createToast } from "./Toast";
import { RecommendedView } from "./RecommendedView";
import type { AppTab } from "./Nav";

function buildPosterRequests(data: {
  library: UserRating[];
  recommendations: Recommendation[];
  alerts: EpisodeAlert[];
}) {
  return [
    ...data.library.map((item) => ({
      id: `lib:${item.id}`,
      title: item.show_title,
      releaseDate: item.release_date,
    })),
    ...data.recommendations.map((item) => ({
      id: `rec:${item.id}`,
      title: item.title,
      type: item.type,
      releaseDate: item.release_date,
    })),
    ...data.alerts.map((item) => ({
      id: `alert:${item.id}:${item.rowIndex}`,
      title: item.show_title,
      kind: "tv" as const,
    })),
  ];
}

async function fetchLibraryMedia(items: ReturnType<typeof buildPosterRequests>) {
  if (items.length === 0) return null;

  const res = await fetch("/api/posters", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
  if (!res.ok) return null;

  const body = (await res.json()) as {
    posters?: Record<string, string | null>;
    overviews?: Record<string, string | null>;
    platforms?: Record<string, string>;
    releaseDates?: Record<string, string>;
    episodeCounts?: Record<string, number | null>;
    nextEpisodes?: Record<string, string | null>;
    seriesStatuses?: Record<string, string | null>;
    trailers?: Record<string, string | null>;
  };
  return {
    posters: body.posters ?? {},
    overviews: body.overviews ?? {},
    platforms: body.platforms ?? {},
    releaseDates: body.releaseDates ?? {},
    episodeCounts: body.episodeCounts ?? {},
    nextEpisodes: body.nextEpisodes ?? {},
    seriesStatuses: body.seriesStatuses ?? {},
    trailers: body.trailers ?? {},
  };
}

function mergeLibraryMedia(
  media: {
    posters: Record<string, string | null>;
    overviews: Record<string, string | null>;
    platforms: Record<string, string>;
    releaseDates: Record<string, string>;
    episodeCounts: Record<string, number | null>;
    nextEpisodes: Record<string, string | null>;
    seriesStatuses: Record<string, string | null>;
    trailers: Record<string, string | null>;
  },
  setLibrary: Dispatch<SetStateAction<UserRating[]>>,
  setRecommendations: Dispatch<SetStateAction<Recommendation[]>>,
  setAlerts: Dispatch<SetStateAction<EpisodeAlert[]>>
) {
  setLibrary((prev) =>
    prev.map((item) => {
      const key = `lib:${item.id}`;
      return {
        ...item,
        posterUrl: media.posters[key] ?? item.posterUrl ?? null,
        overview: media.overviews[key] ?? item.overview ?? null,
        platform: item.platform || media.platforms[key] || "",
        release_date: item.release_date || media.releaseDates[key] || "",
        episode_count: media.episodeCounts[key] ?? item.episode_count ?? null,
        next_episode_air_date: media.nextEpisodes[key] ?? item.next_episode_air_date ?? null,
        series_status: media.seriesStatuses[key] ?? item.series_status ?? null,
        trailerUrl: media.trailers[key] ?? item.trailerUrl ?? null,
      };
    })
  );
  setRecommendations((prev) =>
    prev.map((item) => ({
      ...item,
      posterUrl: media.posters[`rec:${item.id}`] ?? item.posterUrl ?? null,
      trailerUrl: media.trailers[`rec:${item.id}`] ?? item.trailerUrl ?? null,
    }))
  );
  setAlerts((prev) =>
    prev.map((item) => ({
      ...item,
      posterUrl: media.posters[`alert:${item.id}:${item.rowIndex}`] ?? item.posterUrl ?? null,
    }))
  );
}

async function loadPostersInBackground(
  data: {
    library: UserRating[];
    recommendations: Recommendation[];
    alerts: EpisodeAlert[];
  },
  merge: (media: NonNullable<Awaited<ReturnType<typeof fetchLibraryMedia>>>) => void
) {
  const priorityLibrary = data.library.filter((item) => {
    const status = item.watch_status.toLowerCase();
    return status === "watching" || status === "want_to_watch";
  });
  const restLibrary = data.library.filter((item) => {
    const status = item.watch_status.toLowerCase();
    return status !== "watching" && status !== "want_to_watch";
  });

  const priorityMedia = await fetchLibraryMedia(
    buildPosterRequests({
      library: priorityLibrary,
      recommendations: data.recommendations,
      alerts: data.alerts,
    })
  );
  if (priorityMedia) merge(priorityMedia);

  const restMedia = await fetchLibraryMedia(
    buildPosterRequests({
      library: restLibrary,
      recommendations: [],
      alerts: [],
    })
  );
  if (restMedia) merge(restMedia);
}

function normalizeTitleForMatch(value: string): string {
  return normalizeTitle(value);
}

export function AppShell() {
  const [activeTab, setActiveTab] = useState<AppTab>("watching");
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [alerts, setAlerts] = useState<EpisodeAlert[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [library, setLibrary] = useState<UserRating[]>([]);
  const [finishingItem, setFinishingItem] = useState<UserRating | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [freshPicksBusy, setFreshPicksBusy] = useState(false);

  const handleToast = useCallback((toast: ToastMessage) => {
    setToasts((prev) => [...prev, toast]);
  }, []);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = setTimeout(() => setToasts((prev) => prev.slice(1)), 3500);
    return () => clearTimeout(timer);
  }, [toasts]);

  const load = useCallback(async (options?: { silent?: boolean; fresh?: boolean }) => {
    if (!options?.silent) setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(options?.fresh ? "/api/bootstrap?fresh=1" : "/api/bootstrap");
      const data = (await res.json()) as {
        alerts?: EpisodeAlert[];
        recommendations?: Recommendation[];
        library?: UserRating[];
        error?: string;
      };

      if (!res.ok) {
        throw new Error(data.error ?? "Failed to load data");
      }

      const alertsData = data.alerts ?? [];
      const recsData = data.recommendations ?? [];
      const watchedData = data.library ?? [];

      setAlerts(alertsData);
      setRecommendations(recsData);
      setLibrary(watchedData);

      void loadPostersInBackground(
        {
          library: watchedData,
          recommendations: recsData,
          alerts: alertsData,
        },
        (media) => mergeLibraryMedia(media, setLibrary, setRecommendations, setAlerts)
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load your tracker";
      setLoadError(message);
      handleToast(createToast("error", message));
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, [handleToast]);

  useEffect(() => {
    load();
  }, [load]);

  const activeRecommendations = useMemo(
    () => filterActiveRecommendations(recommendations, library),
    [recommendations, library]
  );

  const dismissedRecommendations = useMemo(
    () =>
      recommendations.filter((item) => item.user_action.trim().toLowerCase() === "dismiss"),
    [recommendations]
  );

  const filteredAlerts = useMemo(
    () => filterAlerts(alerts, searchQuery),
    [alerts, searchQuery]
  );

  const filteredRecommendations = useMemo(
    () => filterRecommendations(activeRecommendations, searchQuery),
    [activeRecommendations, searchQuery]
  );

  const filteredLibrary = useMemo(
    () => filterLibraryItems(library, searchQuery),
    [library, searchQuery]
  );

  // Legacy "saved for later" items live in the Recommended tab now, alongside
  // fresh picks — they only move when she taps Start or Dismiss.
  const savedItems = useMemo(
    () =>
      filteredLibrary
        .filter((item) => item.watch_status.toLowerCase() === "want_to_watch")
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at) || a.show_title.localeCompare(b.show_title)),
    [filteredLibrary]
  );

  // Any alert that matches a show in her library surfaces as a "New episode"
  // badge on that show in In Progress, so Recommended only shows orphan alerts
  // (a new episode for something she hasn't logged yet).
  const libraryTitles = useMemo(
    () => new Set(library.map((item) => normalizeTitleForMatch(item.show_title))),
    [library]
  );

  const recommendedAlerts = useMemo(
    () => filteredAlerts.filter((alert) => !libraryTitles.has(normalizeTitleForMatch(alert.show_title))),
    [filteredAlerts, libraryTitles]
  );

  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return;

    const matchTab = findSearchResultTab(activeTab === "stats" ? "watching" : activeTab, trimmed, {
      library,
      activeRecommendations,
      alerts,
    });
    if (matchTab && matchTab !== activeTab) {
      setActiveTab(matchTab);
    }
  }, [searchQuery, library, activeRecommendations, alerts, activeTab]);

  async function persistLibraryItem(
    item: UserRating,
    overrides: Partial<{
      show_title: string;
      platform: string;
      release_date: string;
      rating: number;
      why_reasons: string;
      comments: string;
      watch_status: string;
    }>
  ): Promise<UserRating> {
    const res = await fetch("/api/watched", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        existingId: item.id,
        entry: {
          show_title: item.show_title,
          platform: item.platform,
          release_date: item.release_date,
          rating: item.rating,
          why_reasons: item.why_reasons,
          comments: item.comments,
          watch_status: item.watch_status,
          ...overrides,
        },
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed");
    return data.item as UserRating;
  }

  async function moveStage(item: UserRating, status: WatchStatus) {
    if (status === "watched") {
      setFinishingItem(item);
      return;
    }

    const label =
      status === "watching"
        ? "In Progress"
        : status === "caught_up"
          ? "Caught Up"
          : status === "want_to_watch"
            ? "Recommended"
            : status === "watched"
              ? "Watched"
              : "Did Not Finish";

    try {
      const savedItem = await persistLibraryItem(item, { watch_status: status });
      setLibrary((prev) => prev.map((row) => (row.id === item.id ? savedItem : row)));
      handleToast(createToast("success", `Moved ${item.show_title} to ${label}`));
      // Stay on the current tab — the card moves itself to the right group/tab,
      // but don't navigate her away from where she's working.
    } catch {
      handleToast(createToast("error", "Could not update show"));
    }
  }

  async function completeFinish(item: UserRating, payload: FinishWatchedPayload) {
    try {
      const savedItem = await persistLibraryItem(item, {
        rating: payload.rating,
        why_reasons: formatFinishTags(payload.tags),
        comments: payload.comments,
        watch_status: "watched",
      });
      setLibrary((prev) => prev.map((row) => (row.id === item.id ? savedItem : row)));
      setFinishingItem(null);
      handleToast(createToast("success", `Marked ${item.show_title} as watched`));
    } catch {
      handleToast(createToast("error", "Could not save your rating"));
      throw new Error("Failed");
    }
  }

  async function updateProgress(item: UserRating, season: number, episode: number) {
    // Optimistic — flip the numbers immediately, roll back on failure.
    const previous = { current_season: item.current_season, current_episode: item.current_episode };
    setLibrary((prev) =>
      prev.map((row) =>
        row.id === item.id ? { ...row, current_season: season, current_episode: episode } : row
      )
    );
    try {
      const res = await fetch("/api/watched", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          fields: { current_season: season, current_episode: episode },
        }),
      });
      if (!res.ok) throw new Error("Failed");
    } catch {
      setLibrary((prev) =>
        prev.map((row) => (row.id === item.id ? { ...row, ...previous } : row))
      );
      handleToast(createToast("error", "Could not save episode progress"));
    }
  }

  async function rateShow(item: UserRating, rating: number) {
    try {
      const savedItem = await persistLibraryItem(item, { rating });
      setLibrary((prev) => prev.map((row) => (row.id === item.id ? savedItem : row)));
      handleToast(createToast("success", `Rated ${item.show_title} ${rating}/5`));
    } catch {
      handleToast(createToast("error", "Could not update show"));
    }
  }

  async function updateLibraryEntry(item: UserRating, draft: LibraryEntryDraft) {
    try {
      const res = await fetch("/api/watched", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          existingId: item.id,
          entry: {
            show_title: draft.show_title.trim(),
            platform: draft.platform.trim(),
            release_date: draft.release_date.trim(),
            rating: draft.rating,
            why_reasons: item.why_reasons,
            comments: draft.comments.trim(),
            watch_status: item.watch_status,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");

      const savedItem = data.item as UserRating;
      setLibrary((prev) => prev.map((row) => (row.id === item.id ? savedItem : row)));
      handleToast(createToast("success", `Updated ${draft.show_title}`));
    } catch {
      handleToast(createToast("error", "Could not update show"));
    }
  }

  async function deleteLibraryEntry(item: UserRating) {
    try {
      const res = await fetch("/api/watched", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id }),
      });
      if (!res.ok) throw new Error("Failed");

      setLibrary((prev) => prev.filter((row) => row.id !== item.id));
      handleToast(createToast("success", `Removed ${item.show_title}`));
    } catch {
      handleToast(createToast("error", "Could not delete show"));
    }
  }

  async function dismissAlert(alert: EpisodeAlert) {
    setAlerts((prev) => prev.filter((a) => !(a.id === alert.id && a.rowIndex === alert.rowIndex)));
    const item = library.find(
      (row) => normalizeTitleForMatch(row.show_title) === normalizeTitleForMatch(alert.show_title)
    );
    try {
      const res = await fetch("/api/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: alert.id, rowIndex: alert.rowIndex }),
      });
      if (!res.ok) throw new Error("Failed");

      // Watching the new episode means she's caught up — move the show to the
      // "Caught Up · Waiting for Next Episode" group (unless it's already there).
      if (item && item.watch_status.toLowerCase() !== "caught_up") {
        const savedItem = await persistLibraryItem(item, { watch_status: "caught_up" });
        setLibrary((prev) => prev.map((row) => (row.id === item.id ? savedItem : row)));
        handleToast(createToast("success", `${alert.show_title} → Caught up, waiting for next episode`));
      } else {
        handleToast(createToast("success", "Marked as watched"));
      }
    } catch {
      setAlerts((prev) => [alert, ...prev]);
      handleToast(createToast("error", "Could not update show"));
    }
  }

  async function profileShow(item: UserRating) {
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: item.show_title,
          platform: item.platform,
          release_date: item.release_date,
          watch_status: item.watch_status,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");

      if (data.recommendation) {
        const recommendation = data.recommendation as Recommendation;
        setRecommendations((prev) => {
          const existing = prev.find((rec) => rec.id === recommendation.id);
          return existing
            ? prev.map((rec) => (rec.id === recommendation.id ? recommendation : rec))
            : [recommendation, ...prev];
        });
        handleToast(createToast("success", `Profiled ${item.show_title}`));
      } else {
        handleToast(createToast("error", `Could not profile ${item.show_title}`));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not profile this show";
      handleToast(createToast("error", message));
    }
  }

  async function runFreshPicks() {
    if (freshPicksBusy) return;
    setFreshPicksBusy(true);
    handleToast(createToast("info", "Finding fresh picks — this takes up to a minute"));
    try {
      const res = await fetch("/api/recommend/run", { method: "POST" });
      // Gateway timeouts return HTML, not JSON — don't let parsing mask them.
      const data = (await res.json().catch(() => ({}))) as { added?: number; error?: string };
      if (!res.ok) {
        throw new Error(
          data.error ?? (res.status === 504 ? "The picks run timed out — try again in a minute" : "Could not refresh picks")
        );
      }
      await load({ silent: true, fresh: true });
      setActiveTab("recommended");
      handleToast(createToast("success", `Added ${data.added ?? 0} fresh picks to your Watch List`));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not refresh picks";
      handleToast(createToast("error", message));
      // The run may still have landed rows server-side before the timeout.
      void load({ silent: true, fresh: true });
    } finally {
      setFreshPicksBusy(false);
    }
  }

  async function saveRecommendation(item: Recommendation, status: "watching") {
    const existing = library.find(
      (entry) => normalizeTitleForMatch(entry.show_title) === normalizeTitleForMatch(item.title)
    );

    const entry = structuredFromRecommendation({
      title: item.title,
      release_date: item.release_date,
      platform: item.platform,
      type: item.type,
      watch_status: status,
    });

    try {
      const res = await fetch("/api/watched", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entry,
          existingId: existing?.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");

      const savedItem = data.item as UserRating;
      setLibrary((prev) => {
        if (existing) {
          return prev.map((row) => (row.id === existing.id ? savedItem : row));
        }
        return [savedItem, ...prev];
      });

      const actionRes = await fetch("/api/recommendations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, field: "user_action", value: "accept" }),
      });
      if (!actionRes.ok) throw new Error("Failed");

      setRecommendations((prev) =>
        prev.map((rec) => (rec.id === item.id ? { ...rec, user_action: "accept" } : rec))
      );

      handleToast(createToast("success", `Started ${item.title} — find it in In Progress`));
    } catch {
      handleToast(createToast("error", "Could not save recommendation"));
    }
  }

  async function startSavedItem(item: UserRating) {
    await moveStage(item, "watching");
  }

  async function dismissSavedItem(item: UserRating, payload: DismissPayload) {
    try {
      const savedItem = await persistLibraryItem(item, {
        watch_status: "dnf",
        rating: payload.rating,
        why_reasons: formatFinishTags(payload.tags),
        comments: payload.comments,
      });
      setLibrary((prev) => prev.map((row) => (row.id === item.id ? savedItem : row)));
      handleToast(createToast("success", `Dismissed ${item.show_title} — find it under Watched › Did Not Finish`));
    } catch {
      handleToast(createToast("error", "Could not dismiss show"));
      throw new Error("Failed");
    }
  }

  return (
    <div className="page">
      <Nav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onAddClick={() => setAddOpen(true)}
        onFreshPicks={() => void runFreshPicks()}
        freshPicksBusy={freshPicksBusy}
      />
      <main className="container">
        {loading ? (
          <div className="loading">Loading...</div>
        ) : loadError ? (
          <div className="load-error">
            <h2 className="load-error-title">Could not load your tracker</h2>
            <p className="load-error-copy">{loadError}</p>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => load()}>
              Try again
            </button>
          </div>
        ) : (
          <>
            <div className={activeTab === "watching" ? "portal-panel" : "portal-panel portal-panel-hidden"}>
              <StatusTabView
                tab="watching"
                items={filteredLibrary}
                recommendations={recommendations}
                alerts={alerts}
                onDismissAlert={dismissAlert}
                onMoveStage={moveStage}
                onRate={rateShow}
                onUpdate={updateLibraryEntry}
                onDelete={deleteLibraryEntry}
                onProfileShow={profileShow}
                onUpdateProgress={updateProgress}
              />
            </div>
            <div className={activeTab === "recommended" ? "portal-panel" : "portal-panel portal-panel-hidden"}>
              <RecommendedView
                alerts={recommendedAlerts}
                recommendations={filteredRecommendations}
                allRecommendations={recommendations}
                savedItems={savedItems}
                onToast={handleToast}
                onDismissAlert={(id, rowIndex) =>
                  setAlerts((prev) => prev.filter((a) => !(a.id === id && a.rowIndex === rowIndex)))
                }
                onDismissRec={(id, rating, reasons, comments) =>
                  setRecommendations((prev) =>
                    prev.map((item) =>
                      item.id === id
                        ? {
                            ...item,
                            user_action: "dismiss",
                            user_rating: rating > 0 ? String(rating) : "",
                            user_reasons: reasons,
                            user_comments: comments,
                          }
                        : item
                    )
                  )
                }
                onSaveRec={saveRecommendation}
                onStartSaved={startSavedItem}
                onDismissSaved={dismissSavedItem}
              />
            </div>
            <div className={activeTab === "watched" ? "portal-panel" : "portal-panel portal-panel-hidden"}>
              <StatusTabView
                tab="watched"
                items={filteredLibrary}
                recommendations={recommendations}
                alerts={alerts}
                dismissedRecommendations={dismissedRecommendations}
                onMoveStage={moveStage}
                onRate={rateShow}
                onUpdate={updateLibraryEntry}
                onDelete={deleteLibraryEntry}
                onRestoreRec={(id) =>
                  setRecommendations((prev) =>
                    prev.map((item) => (item.id === id ? { ...item, user_action: "" } : item))
                  )
                }
                onToast={handleToast}
              />
            </div>
            <div className={activeTab === "stats" ? "portal-panel" : "portal-panel portal-panel-hidden"}>
              <StatsView library={library} />
            </div>
          </>
        )}
      </main>
      {addOpen && (
        <AddShowModal
          onClose={() => setAddOpen(false)}
          onAdded={(item) => {
            setLibrary((prev) => [item, ...prev]);
            // Fit-score profile generates in the background; the card appears
            // immediately and the profile merges in when ready.
            void profileShow(item);
            void loadPostersInBackground(
              { library: [item], recommendations: [], alerts: [] },
              (media) => mergeLibraryMedia(media, setLibrary, setRecommendations, setAlerts)
            );
            if (item.watch_status.toLowerCase() === "watching") {
              setActiveTab("watching");
            } else if (item.watch_status.toLowerCase() === "want_to_watch") {
              setActiveTab("recommended");
            }
          }}
          onToast={handleToast}
        />
      )}
      {finishingItem && (
        <FinishWatchedModal
          item={finishingItem}
          recommendation={findRecommendationForTitle(finishingItem.show_title, recommendations)}
          onClose={() => setFinishingItem(null)}
          onComplete={(payload) => completeFinish(finishingItem, payload)}
        />
      )}
      <ToastContainer toasts={toasts} />
    </div>
  );
}
