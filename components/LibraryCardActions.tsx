"use client";

import { useState } from "react";
import type { UserRating, WatchStatus } from "@/lib/types";
import { EditLibraryEntryModal, type LibraryEntryDraft } from "./EditLibraryEntryModal";
import { StageControls } from "./StageControls";

interface LibraryCardActionsProps {
  item: UserRating;
  onMoveStage?: (item: UserRating, status: WatchStatus) => void;
  onUpdate?: (item: UserRating, draft: LibraryEntryDraft) => Promise<void>;
  onDelete?: (item: UserRating) => Promise<void>;
  onProfileShow?: (item: UserRating) => void;
  onToggleCompanion?: (item: UserRating) => void;
}

export function LibraryCardActions({
  item,
  onMoveStage,
  onUpdate,
  onDelete,
  onProfileShow,
  onToggleCompanion,
}: LibraryCardActionsProps) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [profiling, setProfiling] = useState(false);

  function handleProfile() {
    if (!onProfileShow) return;
    setProfiling(true);
    onProfileShow(item);
  }

  async function handleDelete() {
    if (!onDelete) return;
    const confirmed = window.confirm(`Remove "${item.show_title}" from your library?`);
    if (!confirmed) return;
    setDeleting(true);
    try {
      await onDelete(item);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="library-card-actions">
        <StageControls item={item} onMoveStage={onMoveStage} compact />
        <div className="library-card-manage">
          {onToggleCompanion && (
            <button
              type="button"
              className={`btn btn-ghost btn-xs library-card-companion${item.watched_with ? " library-card-companion--on" : ""}`}
              onClick={() => onToggleCompanion(item)}
              aria-pressed={Boolean(item.watched_with)}
              title={item.watched_with ? "Watched with Blake — tap to unmark" : "Mark as watched with Blake"}
            >
              {item.watched_with ? "\u2665 With Blake" : "+ With Blake"}
            </button>
          )}
          {onProfileShow && (
            <button
              type="button"
              className="btn btn-ghost btn-xs library-card-profile"
              onClick={handleProfile}
              disabled={profiling}
              title="Get a fit score for this show"
            >
              {profiling ? "Profiling…" : "✦ Get fit score"}
            </button>
          )}
          {onUpdate && (
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => setEditing(true)}>
              Edit
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              className="btn btn-ghost btn-xs library-card-delete"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "…" : "Delete"}
            </button>
          )}
        </div>
      </div>
      {editing && onUpdate && (
        <EditLibraryEntryModal
          item={item}
          onClose={() => setEditing(false)}
          onSave={(draft) => onUpdate(item, draft)}
        />
      )}
    </>
  );
}
