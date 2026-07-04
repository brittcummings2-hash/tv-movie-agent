"use client";

import { useState } from "react";
import type { Recommendation, ToastMessage, UserRating } from "@/lib/types";
import { buildRecommendationMeta, buildRecommendationTags } from "@/lib/rec-tags";
import { formatFinishTags, parseFinishTags } from "@/lib/finish-tags";
import { MediaCard, MediaCardGrid } from "./MediaCard";
import { DismissModal, type DismissPayload } from "./DismissModal";
import { SectionLabel } from "./SectionLabel";
import { StarRating } from "./StarRating";
import { createToast } from "./Toast";

interface RecommendationsSectionProps {
  items: Recommendation[];
  onToast: (toast: ToastMessage) => void;
  onSave: (item: Recommendation, status: "watching") => Promise<void>;
  onDismiss: (id: string, rating: number, reasons: string, comments: string) => void;
}

export function RecommendationsSection({
  items,
  onToast,
  onSave,
  onDismiss,
}: RecommendationsSectionProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section className="section-block section-block--for-you">
      <MediaCardGrid>
        {items.map((item, index) => (
          <RecCard
            key={item.id}
            item={item}
            badge={index === 0 ? "Top pick" : undefined}
            onSave={onSave}
            onDismiss={onDismiss}
            onToast={onToast}
          />
        ))}
      </MediaCardGrid>
    </section>
  );
}

function RecCard({
  item,
  badge,
  onSave,
  onDismiss,
  onToast,
}: {
  item: Recommendation;
  badge?: string;
  onSave: (item: Recommendation, status: "watching") => Promise<void>;
  onDismiss: (id: string, rating: number, reasons: string, comments: string) => void;
  onToast: (toast: ToastMessage) => void;
}) {
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  async function dismiss(payload: DismissPayload) {
    const reasons = formatFinishTags(payload.tags);
    const res = await fetch("/api/recommendations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: item.id,
        fields: {
          user_action: "dismiss",
          user_rating: payload.rating > 0 ? String(payload.rating) : "",
          user_reasons: reasons,
          user_comments: payload.comments,
        },
      }),
    });
    if (!res.ok) {
      onToast(createToast("error", "Could not dismiss recommendation"));
      throw new Error("Failed");
    }
    onDismiss(item.id, payload.rating, reasons, payload.comments);
    onToast(createToast("success", `Dismissed ${item.title} — find it under Watched › Dismissed`));
  }

  const description = item.the_hook || item.why_she_will_love_it;

  return (
    <>
      <MediaCard
        title={item.title}
        meta={buildRecommendationMeta(item)}
        description={description}
        posterUrl={item.posterUrl}
        trailerUrl={item.trailerUrl}
        badge={badge}
        tags={buildRecommendationTags(item)}
        actions={
          <>
            <button type="button" className="btn btn-primary btn-xs" onClick={() => onSave(item, "watching")}>
              Start Watching
            </button>
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => setFeedbackOpen(true)}>
              Dismiss
            </button>
          </>
        }
      />
      {feedbackOpen && (
        <DismissModal
          title={item.title}
          onClose={() => setFeedbackOpen(false)}
          onComplete={dismiss}
        />
      )}
    </>
  );
}

interface SavedItemsSectionProps {
  items: UserRating[];
  recommendations: Recommendation[];
  onStart: (item: UserRating) => Promise<void>;
  onDismiss: (item: UserRating, payload: DismissPayload) => Promise<void>;
}

/**
 * Legacy "saved for later" library items, shown in the Recommended tab with the
 * same two actions as fresh picks. Nothing moves on its own — she taps Start or
 * Dismiss.
 */
export function SavedItemsSection({
  items,
  recommendations,
  onStart,
  onDismiss,
}: SavedItemsSectionProps) {
  if (items.length === 0) return null;

  return (
    <section className="section-block section-block--for-you">
      <MediaCardGrid>
        {items.map((item) => (
          <SavedItemCard
            key={item.id}
            item={item}
            recommendation={recommendations.find(
              (rec) => rec.title.toLowerCase() === item.show_title.toLowerCase()
            )}
            onStart={onStart}
            onDismiss={onDismiss}
          />
        ))}
      </MediaCardGrid>
    </section>
  );
}

function SavedItemCard({
  item,
  recommendation,
  onStart,
  onDismiss,
}: {
  item: UserRating;
  recommendation?: Recommendation;
  onStart: (item: UserRating) => Promise<void>;
  onDismiss: (item: UserRating, payload: DismissPayload) => Promise<void>;
}) {
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  const meta = recommendation
    ? buildRecommendationMeta(recommendation)
    : [item.platform, item.release_date].filter(Boolean).join(" · ");
  const description =
    recommendation?.the_hook || recommendation?.why_she_will_love_it || item.overview || undefined;
  const tags = recommendation ? buildRecommendationTags(recommendation) : [];

  return (
    <>
      <MediaCard
        title={item.show_title}
        meta={meta}
        description={description}
        posterUrl={item.posterUrl ?? recommendation?.posterUrl}
        trailerUrl={item.trailerUrl ?? recommendation?.trailerUrl}
        tags={tags}
        actions={
          <>
            <button type="button" className="btn btn-primary btn-xs" onClick={() => onStart(item)}>
              Start Watching
            </button>
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => setFeedbackOpen(true)}>
              Dismiss
            </button>
          </>
        }
      />
      {feedbackOpen && (
        <DismissModal
          title={item.show_title}
          onClose={() => setFeedbackOpen(false)}
          onComplete={(payload) => onDismiss(item, payload)}
        />
      )}
    </>
  );
}

interface DismissedSectionProps {
  items: Recommendation[];
  onToast: (toast: ToastMessage) => void;
  onRestore: (id: string) => void;
}

export function DismissedRecommendationsSection({
  items,
  onToast,
  onRestore,
}: DismissedSectionProps) {
  if (items.length === 0) return null;

  return (
    <section className="section-block section-block--dnf">
      <SectionLabel label="Dismissed" variant="dnf" />
      <MediaCardGrid>
        {items.map((item) => (
          <DismissedCard key={item.id} item={item} onToast={onToast} onRestore={onRestore} />
        ))}
      </MediaCardGrid>
    </section>
  );
}

function DismissedCard({
  item,
  onToast,
  onRestore,
}: {
  item: Recommendation;
  onToast: (toast: ToastMessage) => void;
  onRestore: (id: string) => void;
}) {
  const reasonTags = parseFinishTags(item.user_reasons);
  const rating = Math.round(Number(item.user_rating) || 0);

  async function restore() {
    try {
      const res = await fetch("/api/recommendations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, field: "user_action", value: "" }),
      });
      if (!res.ok) throw new Error("Failed");
      onRestore(item.id);
      onToast(createToast("success", `${item.title} is back in your picks`));
    } catch {
      onToast(createToast("error", "Could not restore recommendation"));
    }
  }

  return (
    <MediaCard
      title={item.title}
      meta={buildRecommendationMeta(item)}
      posterUrl={item.posterUrl}
      tags={reasonTags}
      description={item.user_comments || undefined}
      actions={
        <>
          {rating > 0 && <StarRating value={rating} />}
          <button type="button" className="btn btn-ghost btn-xs" onClick={restore}>
            Restore
          </button>
        </>
      }
    />
  );
}
