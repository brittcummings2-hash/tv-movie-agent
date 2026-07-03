"use client";

import { useMemo } from "react";
import type { UserRating } from "@/lib/types";
import { parseFinishTags } from "@/lib/finish-tags";

interface StatsViewProps {
  library: UserRating[];
}

interface BarRow {
  label: string;
  count: number;
}

function countBy(items: UserRating[], key: (item: UserRating) => string): BarRow[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const label = key(item).trim();
    if (!label) continue;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

function BarList({ title, rows }: { title: string; rows: BarRow[] }) {
  if (rows.length === 0) return null;
  const max = Math.max(...rows.map((row) => row.count));
  return (
    <div className="stats-card">
      <h3 className="stats-card-title">{title}</h3>
      <div className="stats-bars">
        {rows.map((row) => (
          <div key={row.label} className="stats-bar-row">
            <span className="stats-bar-label">{row.label}</span>
            <span className="stats-bar-track">
              <span
                className="stats-bar-fill"
                style={{ width: `${Math.max(4, (row.count / max) * 100)}%` }}
              />
            </span>
            <span className="stats-bar-value">{row.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TagCloud({ title, tags }: { title: string; tags: BarRow[] }) {
  if (tags.length === 0) return null;
  return (
    <div className="stats-card">
      <h3 className="stats-card-title">{title}</h3>
      <div className="tag-row">
        {tags.map((tag) => (
          <span key={tag.label} className="tag tag-muted">
            {tag.label}
            {tag.count > 1 ? ` ×${tag.count}` : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

function topTags(items: UserRating[], limit: number): BarRow[] {
  const counts = new Map<string, { label: string; count: number }>();
  for (const item of items) {
    for (const tag of parseFinishTags(item.why_reasons)) {
      const key = tag.toLowerCase();
      const entry = counts.get(key);
      if (entry) entry.count += 1;
      else counts.set(key, { label: tag, count: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}

export function StatsView({ library }: StatsViewProps) {
  const stats = useMemo(() => {
    const watched = library.filter((item) => item.watch_status.toLowerCase() === "watched");
    const dnf = library.filter((item) => item.watch_status.toLowerCase() === "dnf");
    const inProgress = library.filter(
      (item) => item.watch_status.toLowerCase() === "watching"
    );
    const rated = watched.filter((item) => item.rating > 0);
    const avgRating =
      rated.length > 0
        ? rated.reduce((sum, item) => sum + item.rating, 0) / rated.length
        : 0;

    const ratingRows: BarRow[] = [5, 4, 3, 2, 1].map((stars) => ({
      label: "★".repeat(stars),
      count: rated.filter((item) => item.rating === stars).length,
    }));

    const platformRows = countBy(watched, (item) => item.platform).slice(0, 6);

    const yearRows = countBy(watched, (item) => (item.updated_at || "").slice(0, 4)).sort(
      (a, b) => b.label.localeCompare(a.label)
    );

    const loveTags = topTags(
      watched.filter((item) => item.rating >= 4),
      12
    );
    const avoidTags = topTags(
      [...dnf, ...watched.filter((item) => item.rating > 0 && item.rating <= 2)],
      12
    );

    return {
      watchedCount: watched.length,
      dnfCount: dnf.length,
      inProgressCount: inProgress.length,
      fiveStarCount: rated.filter((item) => item.rating === 5).length,
      avgRating,
      ratingRows,
      platformRows,
      yearRows,
      loveTags,
      avoidTags,
    };
  }, [library]);

  if (library.length === 0) {
    return (
      <div className="empty-state empty-state-compact">
        No stats yet — start logging what you watch.
      </div>
    );
  }

  return (
    <div className="stats-view">
      <div className="stats-tiles">
        <div className="stats-tile">
          <span className="stats-tile-value">{stats.watchedCount}</span>
          <span className="stats-tile-label">Watched</span>
        </div>
        <div className="stats-tile">
          <span className="stats-tile-value">
            {stats.avgRating > 0 ? stats.avgRating.toFixed(1) : "—"}
          </span>
          <span className="stats-tile-label">Avg rating</span>
        </div>
        <div className="stats-tile">
          <span className="stats-tile-value">{stats.fiveStarCount}</span>
          <span className="stats-tile-label">All-time faves</span>
        </div>
        <div className="stats-tile">
          <span className="stats-tile-value">{stats.inProgressCount}</span>
          <span className="stats-tile-label">In progress</span>
        </div>
      </div>

      <div className="stats-grid">
        <BarList title="Your ratings" rows={stats.ratingRows} />
        <BarList title="Where you watch" rows={stats.platformRows} />
        <BarList title="Finished by year" rows={stats.yearRows} />
        <TagCloud title="What you love" tags={stats.loveTags} />
        <TagCloud title="What doesn't work" tags={stats.avoidTags} />
      </div>
    </div>
  );
}
