"use client";

import { useMemo, useState } from "react";
import type { EpisodeAlert, Recommendation, UserRating, WatchStatus } from "@/lib/types";
import { findRecommendationForTitle, normalizeTitle } from "@/lib/search";
import { formatNextEpisode } from "@/lib/tmdb";
import { buildLibraryCardContent } from "@/lib/rec-tags";
import { MediaCard, MediaCardGrid } from "./MediaCard";
import { SectionLabel, type SectionVariant } from "./SectionLabel";
import { LibraryCardActions } from "./LibraryCardActions";
import type { LibraryEntryDraft } from "./EditLibraryEntryModal";

interface LibrarySectionProps {
  label: string;
  variant: SectionVariant;
  items: UserRating[];
  recommendations?: Recommendation[];
  showRecContent?: boolean;
  emptyMessage?: string;
  hideLabel?: boolean;
  collapsible?: boolean;
  collapseAfter?: number;
  showRating?: boolean;
  showNextEpisode?: boolean;
  alerts?: EpisodeAlert[];
  onDismissAlert?: (alert: EpisodeAlert) => void;
  onMoveStage?: (item: UserRating, status: WatchStatus) => void;
  onRate?: (item: UserRating, rating: number) => void;
  onUpdate?: (item: UserRating, draft: LibraryEntryDraft) => Promise<void>;
  onDelete?: (item: UserRating) => Promise<void>;
  onProfileShow?: (item: UserRating) => void;
  onUpdateProgress?: (item: UserRating, season: number, episode: number) => void;
}

export function LibrarySection({
  label,
  variant,
  items,
  recommendations = [],
  showRecContent = false,
  emptyMessage,
  hideLabel = false,
  collapsible = false,
  collapseAfter = 8,
  showRating = false,
  showNextEpisode = false,
  alerts,
  onDismissAlert,
  onMoveStage,
  onRate,
  onUpdate,
  onDelete,
  onProfileShow,
  onUpdateProgress,
}: LibrarySectionProps) {
  const [expanded, setExpanded] = useState(false);

  const alertByTitle = useMemo(() => {
    const map = new Map<string, EpisodeAlert>();
    for (const alert of alerts ?? []) {
      if (alert.seen) continue;
      const key = normalizeTitle(alert.show_title);
      if (key && !map.has(key)) map.set(key, alert);
    }
    return map;
  }, [alerts]);

  if (items.length === 0) {
    if (!emptyMessage) return null;
    return (
      <section className={`section-block section-block--${variant}`}>
        <SectionLabel label={label} variant={variant} />
        <p className="section-empty">{emptyMessage}</p>
      </section>
    );
  }

  const canCollapse = collapsible && items.length > collapseAfter;
  const visibleItems = canCollapse && !expanded ? items.slice(0, collapseAfter) : items;

  return (
    <section className={`section-block section-block--${variant}`}>
      {!hideLabel && <SectionLabel label={label} variant={variant} />}
      <MediaCardGrid>
        {visibleItems.map((item) => {
          const recommendation = findRecommendationForTitle(item.show_title, recommendations);
          const cardContent = buildLibraryCardContent(item, recommendation, showRecContent);
          const alert = onDismissAlert ? alertByTitle.get(normalizeTitle(item.show_title)) : undefined;
          const needsProfile =
            Boolean(onProfileShow) && !(recommendation && recommendation.fit_score > 0);
          const statusLine = showNextEpisode
            ? formatNextEpisode(item.next_episode_air_date, item.series_status)
            : null;
          // Episode progress only makes sense on TV shows she's actively watching.
          const isMovie = (item.media_type ?? "").toLowerCase() === "movie";
          const progress =
            onUpdateProgress && item.watch_status.toLowerCase() === "watching" && !isMovie
              ? {
                  season: item.current_season,
                  episode: item.current_episode,
                  onChange: (season: number, episode: number) =>
                    onUpdateProgress(item, season, episode),
                }
              : null;

          return (
            <MediaCard
              key={item.id}
              title={item.show_title}
              meta={cardContent.meta}
              description={cardContent.description}
              posterUrl={item.posterUrl ?? recommendation?.posterUrl}
              trailerUrl={item.trailerUrl ?? recommendation?.trailerUrl}
              tags={cardContent.tags}
              rating={item.rating}
              showRating={showRating}
              onRate={(rating) => onRate?.(item, rating)}
              statusLine={statusLine}
              progress={progress}
              episodeAlert={
                alert && onDismissAlert
                  ? { text: alert.alert_text, onDismiss: () => onDismissAlert(alert) }
                  : null
              }
              actions={
                <LibraryCardActions
                  item={item}
                  onMoveStage={onMoveStage}
                  onUpdate={onUpdate}
                  onDelete={onDelete}
                  onProfileShow={needsProfile ? onProfileShow : undefined}
                />
              }
            />
          );
        })}
      </MediaCardGrid>
      {canCollapse && (
        <button
          type="button"
          className="section-toggle"
          onClick={() => setExpanded((prev) => !prev)}
        >
          {expanded ? "Show less" : `Show all ${items.length} watched`}
        </button>
      )}
    </section>
  );
}
