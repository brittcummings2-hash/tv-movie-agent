"use client";

import { useCallback, useEffect, useState } from "react";
import type { DailyDigest, EpisodeAlert, Recommendation, ToastMessage } from "@/lib/types";
import { EpisodeAlertsSection } from "./EpisodeAlertsSection";
import { RecommendationsSection } from "./RecommendationsSection";
import { createToast } from "./Toast";

interface UpNextViewProps {
  onToast: (toast: ToastMessage) => void;
}

export function UpNextView({ onToast }: UpNextViewProps) {
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<EpisodeAlert[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [digest, setDigest] = useState<DailyDigest | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [alertsRes, recsRes, digestRes] = await Promise.all([
        fetch("/api/alerts"),
        fetch("/api/recommendations"),
        fetch("/api/digest"),
      ]);

      if (!alertsRes.ok || !recsRes.ok || !digestRes.ok) {
        throw new Error("Failed to load Up Next data");
      }

      const alertsData = await alertsRes.json();
      const recsData = await recsRes.json();
      const digestData = await digestRes.json();

      setAlerts(alertsData.items ?? []);
      setRecommendations(recsData.items ?? []);
      setDigest(digestData.digest ?? null);
    } catch {
      onToast(createToast("error", "Could not load Up Next"));
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <div className="loading">Loading Up Next...</div>;
  }

  return (
    <>
      <EpisodeAlertsSection
        items={alerts}
        onToast={onToast}
        onDismiss={(id, rowIndex) =>
          setAlerts((prev) => prev.filter((a) => !(a.id === id && a.rowIndex === rowIndex)))
        }
      />
      <RecommendationsSection
        digest={digest}
        items={recommendations}
        onToast={onToast}
        onAction={(id, action) =>
          setRecommendations((prev) =>
            prev.map((item) => (item.id === id ? { ...item, user_action: action } : item))
          )
        }
      />
    </>
  );
}
