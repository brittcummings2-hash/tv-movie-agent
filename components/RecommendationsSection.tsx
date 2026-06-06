"use client";

import Image from "next/image";
import type { DailyDigest, Recommendation, ToastMessage } from "@/lib/types";
import { createToast } from "./Toast";

interface RecommendationsSectionProps {
  digest: DailyDigest | null;
  items: Recommendation[];
  onToast: (toast: ToastMessage) => void;
  onAction: (id: string, action: string) => void;
}

function Poster({ url, title, className }: { url?: string | null; title: string; className: string }) {
  if (!url) {
    return <div className={`${className} poster-placeholder`}>{title.slice(0, 2)}</div>;
  }
  return (
    <Image src={url} alt="" width={96} height={144} className={className} unoptimized />
  );
}

function HeroCard({ item }: { item: Recommendation }) {
  return (
    <div className="card hero-card section-block">
      <div className="hero-backdrop">
        {item.heroUrl ? (
          <Image src={item.heroUrl} alt="" width={1200} height={220} unoptimized />
        ) : null}
        <div className="hero-backdrop-overlay" />
        <div className="hero-content">
          <div className="card-title">{item.title}</div>
          <div className="card-meta">
            {[item.platform, item.type].filter(Boolean).join(" · ")}
          </div>
          <span className="hero-fit">Fit score {item.fit_score}</span>
          {item.why_she_will_love_it && (
            <div className="card-desc">{item.why_she_will_love_it}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function RecCard({
  item,
  onAction,
  onToast,
}: {
  item: Recommendation;
  onAction: (id: string, action: string) => void;
  onToast: (toast: ToastMessage) => void;
}) {
  async function setAction(action: string) {
    try {
      const res = await fetch("/api/recommendations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, field: "user_action", value: action }),
      });
      if (!res.ok) throw new Error("Failed");
      onAction(item.id, action);
      onToast(createToast("success", `Marked as ${action}`));
    } catch {
      onToast(createToast("error", "Could not update recommendation"));
    }
  }

  return (
    <div className="card rec-card">
      <Poster url={item.posterUrl} title={item.title} className="rec-poster" />
      <div>
        <div className="card-title">{item.title}</div>
        <div className="card-meta">
          {[item.platform, item.type, item.available_now ? "Available now" : ""]
            .filter(Boolean)
            .join(" · ")}
        </div>
        {item.the_hook && <div className="card-desc">{item.the_hook}</div>}
        {item.comp_shows.length > 0 && (
          <div className="comp-tags">
            {item.comp_shows.map((show) => (
              <span key={show} className="tag tag-muted">
                {show}
              </span>
            ))}
          </div>
        )}
        {item.caution && <div className="caution-callout">{item.caution}</div>}
        {item.buzz_source && (
          <div className="card-meta" style={{ marginTop: 8 }}>
            {item.buzz_source}
          </div>
        )}
        <div className="card-actions">
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setAction("accept")}>
            Save
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAction("dismiss")}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

export function RecommendationsSection({
  digest,
  items,
  onToast,
  onAction,
}: RecommendationsSectionProps) {
  const [hero, ...rest] = items;

  return (
    <section>
      {digest && (
        <div className="digest-banner">
          Today&apos;s digest ({digest.digest_date}):{" "}
          {digest.recommendations.map((r) => r.title).join(", ") || "No picks listed"}
        </div>
      )}

      {items.length === 0 ? (
        <div className="empty-state">No Spark recommendations yet.</div>
      ) : (
        <>
          {hero && <HeroCard item={hero} />}
          <div className="section-label">More picks</div>
          {rest.map((item) => (
            <RecCard key={item.id} item={item} onAction={onAction} onToast={onToast} />
          ))}
        </>
      )}
    </section>
  );
}
