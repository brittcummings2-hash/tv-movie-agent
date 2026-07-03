"use client";

import { useEffect, useState } from "react";
import type { Recommendation } from "@/lib/types";

export interface NotForMePayload {
  tags: string[];
  comments: string;
}

/** Why a rec didn't land — this feeds Spark's taste model as avoid-signal. */
const NOT_FOR_ME_TAGS = [
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

interface NotForMeModalProps {
  item: Recommendation;
  onClose: () => void;
  onComplete: (payload: NotForMePayload) => Promise<void>;
}

export function NotForMeModal({ item, onClose, onComplete }: NotForMeModalProps) {
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
      await onComplete({ tags: selectedTags, comments: comments.trim() });
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
        aria-labelledby="notforme-title"
      >
        <h2 id="notforme-title" className="modal-title">
          Not feeling {item.title}?
        </h2>
        <p className="modal-copy">
          Optional — tap why, and Spark learns what to skip next time. You can restore
          dismissed picks from the bottom of the Recommended tab.
        </p>
        <form onSubmit={handleSubmit}>
          <div className="form-field">
            <label>Why not?</label>
            <div className="finish-tag-options">
              {NOT_FOR_ME_TAGS.map((tag) => {
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
            <label htmlFor="notforme-comments">Anything else?</label>
            <textarea
              id="notforme-comments"
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
              {saving ? "Saving…" : "Dismiss pick"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
