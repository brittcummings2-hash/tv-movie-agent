"use client";

import { useEffect, useState } from "react";
import type { UserRating } from "@/lib/types";
import { StarRating } from "./StarRating";

export interface LibraryEntryDraft {
  show_title: string;
  platform: string;
  release_date: string;
  rating: number;
  comments: string;
}

interface EditLibraryEntryModalProps {
  item: UserRating;
  onClose: () => void;
  onSave: (draft: LibraryEntryDraft) => Promise<void>;
}

export function EditLibraryEntryModal({ item, onClose, onSave }: EditLibraryEntryModalProps) {
  const [draft, setDraft] = useState<LibraryEntryDraft>({
    show_title: item.show_title,
    platform: item.platform,
    release_date: item.release_date,
    rating: item.rating,
    comments: item.comments,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await onSave(draft);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal-card"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-labelledby="edit-entry-title"
      >
        <h2 id="edit-entry-title" className="modal-title">
          Edit {item.show_title}
        </h2>
        <form onSubmit={handleSubmit}>
          <div className="form-field">
            <label htmlFor="edit-title">Title</label>
            <input
              id="edit-title"
              value={draft.show_title}
              onChange={(event) => setDraft((prev) => ({ ...prev, show_title: event.target.value }))}
              required
            />
          </div>
          <div className="form-field">
            <label htmlFor="edit-platform">Platform</label>
            <input
              id="edit-platform"
              value={draft.platform}
              onChange={(event) => setDraft((prev) => ({ ...prev, platform: event.target.value }))}
            />
          </div>
          <div className="form-field">
            <label htmlFor="edit-release">Release date</label>
            <input
              id="edit-release"
              value={draft.release_date}
              placeholder="YYYY-MM"
              onChange={(event) => setDraft((prev) => ({ ...prev, release_date: event.target.value }))}
            />
          </div>
          <div className="form-field">
            <label>Rating</label>
            <StarRating
              value={draft.rating}
              interactive
              onChange={(rating) => setDraft((prev) => ({ ...prev, rating }))}
            />
          </div>
          <div className="form-field">
            <label htmlFor="edit-comments">Notes (not shown on card)</label>
            <textarea
              id="edit-comments"
              className="form-textarea"
              rows={3}
              value={draft.comments}
              onChange={(event) => setDraft((prev) => ({ ...prev, comments: event.target.value }))}
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
