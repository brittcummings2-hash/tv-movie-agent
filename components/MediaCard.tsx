"use client";

import Image from "next/image";
import { useState, type ReactNode } from "react";
import { StarRating } from "./StarRating";

const DESCRIPTION_EXPAND_THRESHOLD = 120;

interface MediaCardProps {
  title: string;
  meta?: string;
  description?: string;
  posterUrl?: string | null;
  badge?: string;
  tags?: string[];
  rating?: number;
  showRating?: boolean;
  onRate?: (rating: number) => void;
  actions?: ReactNode;
  episodeAlert?: { text: string; onDismiss: () => void } | null;
  statusLine?: { label: string; tone: "scheduled" | "waiting" | "ended" } | null;
  trailerUrl?: string | null;
  progress?: {
    season: number;
    episode: number;
    onChange: (season: number, episode: number) => void;
  } | null;
}

function ProgressControl({
  season,
  episode,
  onChange,
}: {
  season: number;
  episode: number;
  onChange: (season: number, episode: number) => void;
}) {
  if (season < 1) {
    return (
      <div className="media-card-progress">
        <button type="button" className="progress-start" onClick={() => onChange(1, 1)}>
          + Track episode progress
        </button>
      </div>
    );
  }

  return (
    <div className="media-card-progress">
      <span className="progress-label">
        S{season} · E{episode}
      </span>
      <button
        type="button"
        className="progress-btn"
        aria-label="Previous episode"
        onClick={() => (episode > 1 ? onChange(season, episode - 1) : undefined)}
        disabled={episode <= 1}
      >
        −
      </button>
      <button
        type="button"
        className="progress-btn"
        aria-label="Next episode"
        onClick={() => onChange(season, episode + 1)}
      >
        +
      </button>
      <button
        type="button"
        className="progress-btn progress-btn-season"
        aria-label="Start next season"
        title="Start next season"
        onClick={() => onChange(season + 1, 1)}
      >
        S{season + 1} →
      </button>
    </div>
  );
}

function Poster({ url, title }: { url?: string | null; title: string }) {
  if (!url) {
    return <div className="media-card-poster poster-placeholder">{title.slice(0, 2)}</div>;
  }
  return (
    <Image
      src={url}
      alt=""
      width={72}
      height={108}
      className="media-card-poster"
      unoptimized
    />
  );
}

export function MediaCard({
  title,
  meta,
  description,
  posterUrl,
  badge,
  tags = [],
  rating = 0,
  showRating = false,
  onRate,
  actions,
  episodeAlert,
  statusLine,
  trailerUrl,
  progress,
}: MediaCardProps) {
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const visibleTags = tags.map((tag) => tag.trim()).filter(Boolean);
  const canExpandDescription =
    Boolean(description) && description!.length > DESCRIPTION_EXPAND_THRESHOLD;

  return (
    <div className="card media-card">
      {badge && <span className="media-card-badge">{badge}</span>}
      <Poster url={posterUrl} title={title} />
      <div className="media-card-body">
        <div className="card-title card-title-compact">{title}</div>
        {(meta || trailerUrl) && (
          <div className="card-meta card-meta-compact">
            {meta}
            {trailerUrl && (
              <>
                {meta ? " · " : ""}
                <a
                  className="card-trailer-link"
                  href={trailerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  ▶ Trailer
                </a>
              </>
            )}
          </div>
        )}
        {episodeAlert && (
          <div className="media-card-alert">
            <div className="media-card-alert-head">
              <span className="media-card-alert-label">New episode</span>
              {episodeAlert.text && (
                <span className="media-card-alert-text">{episodeAlert.text}</span>
              )}
            </div>
            <button
              type="button"
              className="media-card-alert-action"
              onClick={episodeAlert.onDismiss}
            >
              ✓ Watched it
            </button>
          </div>
        )}
        {!episodeAlert && statusLine && (
          <div className={`media-card-nextep media-card-nextep--${statusLine.tone}`}>
            {statusLine.label}
          </div>
        )}
        {progress && (
          <ProgressControl
            season={progress.season}
            episode={progress.episode}
            onChange={progress.onChange}
          />
        )}
        {visibleTags.length > 0 && (
          <div className="tag-row">
            {visibleTags.map((tag) => (
              <span key={tag} className="tag tag-muted">
                {tag}
              </span>
            ))}
          </div>
        )}
        {description && (
          <>
            <div
              className={`card-desc card-desc-compact ${descriptionExpanded ? "" : "card-desc-clamp"}`}
            >
              {description}
            </div>
            {canExpandDescription && (
              <button
                type="button"
                className="card-desc-toggle"
                onClick={() => setDescriptionExpanded((prev) => !prev)}
              >
                {descriptionExpanded ? "Show less" : "Read more"}
              </button>
            )}
          </>
        )}
        {(showRating || actions) && (
          <div className="media-card-footer">
            {showRating && (
              <div className="media-card-rating">
                <StarRating value={rating} interactive onChange={onRate} />
              </div>
            )}
            {actions && <div className="card-actions card-actions-compact">{actions}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

export function MediaCardGrid({ children }: { children: ReactNode }) {
  return <div className="media-card-grid">{children}</div>;
}
