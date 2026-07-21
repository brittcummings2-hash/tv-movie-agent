"use client";

import type { EpisodeAlert, Recommendation, ToastMessage, UserRating } from "@/lib/types";
import type { DismissPayload } from "./DismissModal";
import { EpisodeAlertsSection } from "./EpisodeAlertsSection";
import { RecommendationsSection, SavedItemsSection } from "./RecommendationsSection";

interface RecommendedViewProps {
  alerts: EpisodeAlert[];
  recommendations: Recommendation[];
  allRecommendations: Recommendation[];
  savedItems: UserRating[];
  onToast: (toast: ToastMessage) => void;
  onDismissAlert: (id: string, rowIndex: number) => void;
  onDismissRec: (id: string, rating: number, reasons: string, comments: string) => void;
  onSaveRec: (item: Recommendation, status: "watching") => Promise<void>;
  onStartSaved: (item: UserRating) => Promise<void>;
  onDismissSaved: (item: UserRating, payload: DismissPayload) => Promise<void>;
}

export function RecommendedView({
  alerts,
  recommendations,
  allRecommendations,
  savedItems,
  onToast,
  onDismissAlert,
  onDismissRec,
  onSaveRec,
  onStartSaved,
  onDismissSaved,
}: RecommendedViewProps) {
  const hasContent = alerts.length > 0 || recommendations.length > 0 || savedItems.length > 0;

  if (!hasContent) {
    return (
      <div className="empty-state empty-state-compact">
        Your watch list is empty — add something with +, or tap Fresh picks in the header.
      </div>
    );
  }

  return (
    <>
      <EpisodeAlertsSection items={alerts} onToast={onToast} onDismiss={onDismissAlert} />
      <SavedItemsSection
        items={savedItems}
        recommendations={allRecommendations}
        onStart={onStartSaved}
        onDismiss={onDismissSaved}
      />
      <RecommendationsSection
        items={recommendations}
        onToast={onToast}
        onSave={onSaveRec}
        onDismiss={onDismissRec}
      />
    </>
  );
}
