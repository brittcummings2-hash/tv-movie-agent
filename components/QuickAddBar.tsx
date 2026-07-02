"use client";

import { FormEvent, useState } from "react";
import type { ToastMessage, UserRating } from "@/lib/types";
import { createToast } from "./Toast";

interface QuickAddBarProps {
  onAdded: (item: UserRating) => void;
  onToast: (toast: ToastMessage) => void;
}

export function QuickAddBar({ onAdded, onToast }: QuickAddBarProps) {
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const text = message.trim();
    if (!text || submitting) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/watched", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Could not add show");
      }

      onAdded(data.item as UserRating);
      setMessage("");
      const title = data.item?.show_title ?? "Show";
      onToast(createToast("success", `Added ${title}`));
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Could not add show";
      onToast(createToast("error", msg));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="quick-add" onSubmit={handleSubmit}>
      <input
        className="quick-add-input"
        type="text"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder='e.g. "Want to watch Severance" or "Finished Shogun, 5 stars"'
        aria-label="Add a show or movie in plain English"
        disabled={submitting}
      />
      <button type="submit" className="btn btn-primary quick-add-btn" disabled={submitting || !message.trim()}>
        {submitting ? "Adding..." : "Add"}
      </button>
    </form>
  );
}
