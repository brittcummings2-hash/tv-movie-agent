"use client";

import { useState } from "react";
import type { Recommendation, ToastMessage } from "@/lib/types";
import { buildRecommendationMeta, buildRecommendationTags } from "@/lib/rec-tags";
import { formatFinishTags, parseFinishTags } from "@/lib/finish-tags";
import { MediaCard, MediaCardGrid } from "./MediaCard";
import { NotForMeModal, type NotForMePayload } from "./NotForMeModal";
import { createToast } from "./Toast";

interface RecommendationsSectionProps {
  items: Recommendation[];
  onToast: (toast: ToastMessage) => void;
  onSave: (item: Recommendation, status: "want_to_watch" | "watching") => Promise<void>;
  onDismiss: (id: string, reasons: string, comments: string) => void;
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
  onDismiss: (id: string, reasons: string, comments: string) => void;
  onToast: (toast: ToastMessage) => void;
}) {
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  async function dismiss(payload: NotForMePayload) {
    const reasons = formatFinishTags(payload.tags);
    const res = await fetch("/api/recommendations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: item.id,
        fields: {
          user_action: "dismiss",
          user_reasons: reasons,
          user_comments: payload.comments,
        },
      }),
    });
    if (!res.ok) {
      onToast(createToast("error", "Could not dismiss recommendation"));
      throw new Error("Failed");
    }
    onDismiss(item.id, reasons, payload.comments);
    onToast(createToast("success", `Dismissed ${item.title} — restore it from the bottom of this tab`));
  }

  const description = item.the_hook || item.why_she_will_love_it;

  return (
    <>
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
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => setFeedbackOpen(true)}>
              Not for me
            </button>
          </>
        }
      />
      {feedbackOpen && (
        <NotForMeModal
          item={item}
          onClose={() => setFeedbackOpen(false)}
          onComplete={dismiss}
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
  const [open, setOpen] = useState(false);

  if (items.length === 0) return null;

  return (
    <section className="section-block dismissed-block">
      <button
        type="button"
        className="dismissed-toggle"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
      >
        Dismissed ({items.length}) {open ? "▾" : "▸"}
      </button>
      {open && (
        <MediaCardGrid>
          {items.map((item) => (
            <DismissedCard key={item.id} item={item} onToast={onToast} onRestore={onRestore} />
          ))}
        </MediaCardGrid>
      )}
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
        <button type="button" className="btn btn-ghost btn-xs" onClick={restore}>
          Restore
        </button>
      }
    />
  );
}
