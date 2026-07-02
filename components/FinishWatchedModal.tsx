"use client";

import { useEffect, useMemo, useState } from "react";
import type { Recommendation, UserRating } from "@/lib/types";
import {
  buildFinishTagSuggestions,
  filterTagsForRating,
  getRatingTierLabel,
  parseFinishTags,
} from "@/lib/finish-tags";
import { StarRating } from "./StarRating";

export interface FinishWatchedPayload {
  rating: number;
  tags: string[];
  comments: string;
}

interface FinishWatchedModalProps {
  item: UserRating;
  recommendation?: Recommendation;
  onClose: () => void;
  onComplete: (payload: FinishWatchedPayload) => Promise<void>;
}

export function FinishWatchedModal({
  item,
  recommendation,
  onClose,
  onComplete,
}: FinishWatchedModalProps) {
  const [rating, setRating] = useState(item.rating || 0);
  const [selectedTags, setSelectedTags] = useState<string[]>(() => parseFinishTags(item.why_reasons));
  const [comments, setComments] = useState(item.comments);
  const [saving, setSaving] = useState(false);

  const suggestions = useMemo(
    () => buildFinishTagSuggestions(item, recommendation, rating),
    [item, recommendation, rating]
  );

  const tierLabel = rating >= 1 ? getRatingTierLabel(rating) : null;

  useEffect(() => {
    if (rating < 1) return;
    setSelectedTags((prev) => filterTagsForRating(prev, rating));
  }, [rating]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function toggleTag(tag: string) {
    setSelectedTags((prev) => {
      const key = tag.toLowerCase();
      if (prev.some((entry) => entry.toLowerCase() === key)) {
        return prev.filter((entry) => entry.toLowerCase() !== key);
      }
      return [...prev, tag];
    });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (rating < 1) return;
    setSaving(true);
    try {
      await onComplete({ rating, tags: selectedTags, comments: comments.trim() });
      onClose();
    } catch {
      // Error toast handled by parent
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal-card finish-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-labelledby="finish-title"
      >
        <h2 id="finish-title" className="modal-title">
          Finished {item.show_title}?
        </h2>
        <p className="modal-copy">Rate it first, then tap what stood out.</p>
        <form onSubmit={handleSubmit}>
          <div className="form-field finish-rating-field finish-rating-field--first">
            <label>Your rating</label>
            <StarRating value={rating} interactive onChange={setRating} />
            {tierLabel && <p className="finish-tier-label">{tierLabel}</p>}
          </div>
          <div className="form-field">
            <label>What did you think?</label>
            {rating < 1 ? (
              <p className="finish-tags-hint">Pick a star rating to see tag options.</p>
            ) : (
              <div className="finish-tag-options">
                {suggestions.map((tag) => {
                  const selected = selectedTags.some(
                    (entry) => entry.toLowerCase() === tag.toLowerCase()
                  );
                  return (
                    <button
                      key={tag}
                      type="button"
                      className={`tag tag-muted finish-tag-option${selected ? " finish-tag-option--selected" : ""}`}
                      onClick={() => toggleTag(tag)}
                      aria-pressed={selected}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="form-field">
            <label htmlFor="finish-comments">Comments</label>
            <textarea
              id="finish-comments"
              className="form-textarea"
              rows={3}
              value={comments}
              onChange={(event) => setComments(event.target.value)}
              placeholder="Anything else worth remembering?"
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving || rating < 1}>
              {saving ? "Saving…" : "Mark as Watched"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
