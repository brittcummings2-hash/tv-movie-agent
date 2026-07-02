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
        {meta && <div className="card-meta card-meta-compact">{meta}</div>}
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
