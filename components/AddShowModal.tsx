"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { ToastMessage, UserRating, Recommendation } from "@/lib/types";
import { createToast } from "./Toast";

interface AddShowModalProps {
  onClose: () => void;
  onAdded: (item: UserRating, recommendation?: Recommendation, sparkPending?: boolean) => void;
  onToast: (toast: ToastMessage) => void;
}

export function AddShowModal({ onClose, onAdded, onToast }: AddShowModalProps) {
  const [title, setTitle] = useState("");
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
            watch_status: "watching",
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
      const toastMessage = data.sparkPending
        ? `Added ${data.item?.show_title ?? showTitle} to In Progress — Spark is profiling it`
        : `Added ${data.item?.show_title ?? showTitle} to In Progress`;
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
        <p className="modal-copy">Enter the title — it goes straight to In Progress.</p>
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
