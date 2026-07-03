"use client";

import type { EpisodeAlert, Recommendation, ToastMessage, UserRating, WatchStatus } from "@/lib/types";
import type { LibraryEntryDraft } from "./EditLibraryEntryModal";
import { EpisodeAlertsSection } from "./EpisodeAlertsSection";
import { LibrarySection } from "./LibrarySection";
import { DismissedRecommendationsSection, RecommendationsSection } from "./RecommendationsSection";
import { SparkRefreshButton } from "./SparkRefreshButton";

interface RecommendedViewProps {
  alerts: EpisodeAlert[];
  recommendations: Recommendation[];
  savedQueue: UserRating[];
  allRecommendations: Recommendation[];
  dismissedRecommendations: Recommendation[];
  sparkRunning: boolean;
  onSparkRefresh: () => void;
  onToast: (toast: ToastMessage) => void;
  onDismissAlert: (id: string, rowIndex: number) => void;
  onDismissRec: (id: string, reasons: string, comments: string) => void;
  onRestoreRec: (id: string) => void;
  onSaveRec: (item: Recommendation, status: "want_to_watch" | "watching") => Promise<void>;
  onMoveStage: (item: UserRating, status: WatchStatus) => Promise<void>;
  onUpdate: (item: UserRating, draft: LibraryEntryDraft) => Promise<void>;
  onDelete: (item: UserRating) => Promise<void>;
}

export function RecommendedView({
  alerts,
  recommendations,
  savedQueue,
  allRecommendations,
  dismissedRecommendations,
  sparkRunning,
  onSparkRefresh,
  onToast,
  onDismissAlert,
  onDismissRec,
  onRestoreRec,
  onSaveRec,
  onMoveStage,
  onUpdate,
  onDelete,
}: RecommendedViewProps) {
  const hasContent = alerts.length > 0 || savedQueue.length > 0 || recommendations.length > 0;

  return (
    <>
      <SparkRefreshButton running={sparkRunning} onRefresh={onSparkRefresh} />
      {!hasContent ? (
        <div className="empty-state empty-state-compact">
          No recommendations right now — tap Spark above for new picks.
        </div>
      ) : (
        <>
          <EpisodeAlertsSection
            items={alerts}
            onToast={onToast}
            onDismiss={onDismissAlert}
          />
          {savedQueue.length > 0 && (
            <LibrarySection
              label="Saved for later"
              variant="want-to-watch"
              items={savedQueue}
              recommendations={allRecommendations}
              showRecContent
              onMoveStage={onMoveStage}
              onUpdate={onUpdate}
              onDelete={onDelete}
            />
          )}
          <RecommendationsSection
            items={recommendations}
            onToast={onToast}
            onSave={onSaveRec}
            onDismiss={onDismissRec}
          />
        </>
      )}
      <DismissedRecommendationsSection
        items={dismissedRecommendations}
        onToast={onToast}
        onRestore={onRestoreRec}
      />
    </>
  );
}
