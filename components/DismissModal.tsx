"use client";

import { useEffect, useState } from "react";
import { StarRating } from "./StarRating";

export interface DismissPayload {
  rating: number;
  tags: string[];
  comments: string;
}

/** Why a rec didn't land — the recommendation engine treats these as avoid-signal. */
const DISMISS_TAGS = [
  "Not My Vibe",
  "Tried It, Quit Early",
  "Too Slow to Start",
  "Didn't Hook Me",
  "Not Enough Mystery",
  "Too Bleak",
  "Romance-Heavy",
  "Too Procedural",
  "Heard Mixed Things",
  "Already Seen It",
];

interface DismissModalProps {
  title: string;
  onClose: () => void;
  onComplete: (payload: DismissPayload) => Promise<void>;
}

export function DismissModal({ title, onClose, onComplete }: DismissModalProps) {
  const [rating, setRating] = useState(0);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [comments, setComments] = useState("");
  const [saving, setSaving] = useState(false);

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
        aria-labelledby="dismiss-title"
      >
        <h2 id="dismiss-title" className="modal-title">
          Not watching {title}?
        </h2>
        <p className="modal-copy">
          Optional — rate it and tap why, so future picks learn what to skip. It
          moves to your Dismissed list on the Watched tab (restore it anytime).
        </p>
        <form onSubmit={handleSubmit}>
          <div className="form-field finish-rating-field finish-rating-field--first">
            <label>Your rating</label>
            <StarRating value={rating} interactive onChange={setRating} />
          </div>
          <div className="form-field">
            <label>Why not?</label>
            <div className="finish-tag-options">
              {DISMISS_TAGS.map((tag) => {
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
          </div>
          <div className="form-field">
            <label htmlFor="dismiss-comments">Anything else?</label>
            <textarea
              id="dismiss-comments"
              className="form-textarea"
              rows={2}
              value={comments}
              onChange={(event) => setComments(event.target.value)}
              placeholder="e.g. watched 6 minutes and bailed"
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
              {saving ? "Saving…" : "Dismiss"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
