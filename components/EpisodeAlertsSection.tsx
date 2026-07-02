"use client";

import type { EpisodeAlert, ToastMessage } from "@/lib/types";
import { MediaCard, MediaCardGrid } from "./MediaCard";
import { SectionLabel } from "./SectionLabel";
import { createToast } from "./Toast";

interface EpisodeAlertsSectionProps {
  items: EpisodeAlert[];
  onToast: (toast: ToastMessage) => void;
  onDismiss: (id: string, rowIndex: number) => void;
}

export function EpisodeAlertsSection({ items, onToast, onDismiss }: EpisodeAlertsSectionProps) {
  if (items.length === 0) return null;

  async function dismiss(item: EpisodeAlert) {
    try {
      const res = await fetch("/api/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, rowIndex: item.rowIndex }),
      });
      if (!res.ok) throw new Error("Failed");
      onDismiss(item.id, item.rowIndex);
      onToast(createToast("success", "Alert dismissed"));
    } catch {
      onToast(createToast("error", "Could not dismiss alert"));
    }
  }

  return (
    <section className="section-block section-block--alerts">
      <SectionLabel label="New Episodes" variant="alerts" />
      <MediaCardGrid>
        {items.map((item) => (
          <MediaCard
            key={`${item.id}-${item.rowIndex}`}
            title={item.show_title || "Show update"}
            meta={item.alert_date}
            description={item.alert_text}
            posterUrl={item.posterUrl}
            actions={
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => dismiss(item)}>
                Dismiss
              </button>
            }
          />
        ))}
      </MediaCardGrid>
    </section>
  );
}
