"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ToastMessage, UserRating } from "@/lib/types";
import { StarRating } from "./StarRating";
import { createToast } from "./Toast";

type Filter = "all" | "watched" | "dnf";

interface WatchedViewProps {
  onToast: (toast: ToastMessage) => void;
}

function Poster({ url, title }: { url?: string | null; title: string }) {
  if (!url) {
    return <div className="watched-poster poster-placeholder">{title.slice(0, 2)}</div>;
  }
  return (
    <Image src={url} alt="" width={64} height={96} className="watched-poster" unoptimized />
  );
}

export function WatchedView({ onToast }: WatchedViewProps) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<UserRating[]>([]);
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/watched");
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setItems(data.items ?? []);
    } catch {
      onToast(createToast("error", "Could not load watched list"));
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const list = items.filter((item) => {
      if (filter === "all") return true;
      return item.watch_status.toLowerCase() === filter;
    });
    return list.sort((a, b) => b.rating - a.rating || a.show_title.localeCompare(b.show_title));
  }, [items, filter]);

  if (loading) {
    return <div className="loading">Loading watched shows...</div>;
  }

  return (
    <>
      <div className="filter-chips">
        {(["all", "watched", "dnf"] as Filter[]).map((value) => (
          <button
            key={value}
            type="button"
            className={`filter-chip ${filter === value ? "active" : ""}`}
            onClick={() => setFilter(value)}
          >
            {value === "all" ? "All" : value.toUpperCase()}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">No shows match this filter.</div>
      ) : (
        <div className="watched-grid">
          {filtered.map((item) => (
            <div key={item.id} className="card watched-card">
              <Poster url={item.posterUrl} title={item.show_title} />
              <div>
                <div className="card-title">{item.show_title}</div>
                <div className="card-meta">
                  {[item.platform, item.watch_status].filter(Boolean).join(" · ")}
                </div>
                <div style={{ marginTop: 6 }}>
                  <StarRating value={item.rating} />
                </div>
                {item.comments && <div className="card-desc">{item.comments}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
