"use client";

import type { Recommendation, ToastMessage } from "@/lib/types";
import { buildRecommendationMeta, buildRecommendationTags } from "@/lib/rec-tags";
import { MediaCard, MediaCardGrid } from "./MediaCard";
import { createToast } from "./Toast";

interface RecommendationsSectionProps {
  items: Recommendation[];
  onToast: (toast: ToastMessage) => void;
  onSave: (item: Recommendation, status: "want_to_watch" | "watching") => Promise<void>;
  onDismiss: (id: string) => void;
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
  onSave: (item: Recommendation, status: "want_to_watch" | "watching") => Promise<void>;
  onDismiss: (id: string) => void;
  onToast: (toast: ToastMessage) => void;
}) {
  async function dismiss() {
    try {
      const res = await fetch("/api/recommendations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, field: "user_action", value: "dismiss" }),
      });
      if (!res.ok) throw new Error("Failed");
      onDismiss(item.id);
    } catch {
      onToast(createToast("error", "Could not dismiss recommendation"));
    }
  }

  const description = item.the_hook || item.why_she_will_love_it;

  return (
    <MediaCard
      title={item.title}
      meta={buildRecommendationMeta(item)}
      description={description}
      posterUrl={item.posterUrl}
      badge={badge}
      tags={buildRecommendationTags(item)}
      actions={
        <>
          <button type="button" className="btn btn-primary btn-xs" onClick={() => onSave(item, "want_to_watch")}>
            Want to Watch
          </button>
          <button type="button" className="btn btn-primary btn-xs" onClick={() => onSave(item, "watching")}>
            Start Watching
          </button>
          <button type="button" className="btn btn-ghost btn-xs" onClick={dismiss}>
            Dismiss
          </button>
        </>
      }
    />
  );
}
