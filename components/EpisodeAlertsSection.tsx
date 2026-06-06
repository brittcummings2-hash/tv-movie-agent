"use client";

import Image from "next/image";
import type { EpisodeAlert, ToastMessage } from "@/lib/types";
import { createToast } from "./Toast";

interface EpisodeAlertsSectionProps {
  items: EpisodeAlert[];
  onToast: (toast: ToastMessage) => void;
  onDismiss: (id: string, rowIndex: number) => void;
}

function Poster({ url, title }: { url?: string | null; title: string }) {
  if (!url) {
    return <div className="alert-poster poster-placeholder">{title.slice(0, 2)}</div>;
  }
  return (
    <Image
      src={url}
      alt=""
      width={64}
      height={96}
      className="alert-poster"
      unoptimized
    />
  );
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
    <section className="section-block">
      <div className="section-label">New Episodes</div>
      {items.map((item) => (
        <div key={`${item.id}-${item.rowIndex}`} className="card alert-card">
          <Poster url={item.posterUrl} title={item.show_title} />
          <div>
            <div className="card-title">{item.show_title || "Show update"}</div>
            <div className="card-meta">{item.alert_date}</div>
            {item.alert_text && <div className="card-desc">{item.alert_text}</div>}
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => dismiss(item)}>
            Dismiss
          </button>
        </div>
      ))}
    </section>
  );
}
