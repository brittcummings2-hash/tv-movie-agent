"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { ToastMessage, UserRating, Recommendation } from "@/lib/types";
import { createToast } from "./Toast";

interface AddShowModalProps {
  onClose: () => void;
  onAdded: (item: UserRating, recommendation?: Recommendation, sparkPending?: boolean) => void;
  onToast: (toast: ToastMessage) => void;
}

type AddStatus = "watching" | "want_to_watch";

export function AddShowModal({ onClose, onAdded, onToast }: AddShowModalProps) {
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<AddStatus>("watching");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const showTitle = title.trim();
    if (!showTitle || submitting) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/watched", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entry: {
            show_title: showTitle,
            rating: 0,
            release_date: "",
            platform: "",
            watch_status: status,
            comments: "",
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not add show");

      onAdded(
        data.item as UserRating,
        data.recommendation as Recommendation | undefined,
        Boolean(data.sparkPending)
      );
      const label = status === "watching" ? "In Progress" : "Recommended";
      const toastMessage = data.sparkPending
        ? `Added ${data.item?.show_title ?? showTitle} to ${label} — Spark is profiling it`
        : `Added ${data.item?.show_title ?? showTitle} to ${label}`;
      onToast(createToast("success", toastMessage));
      onClose();
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Could not add show";
      onToast(createToast("error", msg));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal-card"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-labelledby="add-show-title"
      >
        <h2 id="add-show-title" className="modal-title">
          Add a show
        </h2>
        <p className="modal-copy">Enter the title and where it should go.</p>
        <form onSubmit={handleSubmit}>
          <div className="form-field">
            <label htmlFor="add-show-input">Title</label>
            <input
              ref={inputRef}
              id="add-show-input"
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Widows Bay"
              aria-label="Show or movie title"
              disabled={submitting}
            />
          </div>
          <div className="form-field">
            <label>Add to</label>
            <div className="add-status-options">
              <button
                type="button"
                className={`tag tag-muted add-status-option${status === "watching" ? " add-status-option--selected" : ""}`}
                onClick={() => setStatus("watching")}
                aria-pressed={status === "watching"}
              >
                In Progress
              </button>
              <button
                type="button"
                className={`tag tag-muted add-status-option${status === "want_to_watch" ? " add-status-option--selected" : ""}`}
                onClick={() => setStatus("want_to_watch")}
                aria-pressed={status === "want_to_watch"}
              >
                Saved for later
              </button>
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={submitting || !title.trim()}>
              {submitting ? "Adding…" : "Add"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
