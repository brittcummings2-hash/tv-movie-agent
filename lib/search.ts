import type { EpisodeAlert, Recommendation, UserRating } from "./types";

export type SearchTab = "watching" | "recommended" | "watched";

export function normalizeTitle(value: string): string {
  return value.toLowerCase().replace(/^the\s+/, "").replace(/[^a-z0-9]+/g, " ").trim();
}

const LIBRARY_ACTIVE_STATUSES = new Set(["want_to_watch", "watching", "watched"]);

export function isRecommendationResolved(
  recommendation: Recommendation,
  library: UserRating[]
): boolean {
  const action = recommendation.user_action.trim().toLowerCase();
  if (action === "accept" || action === "dismiss") return true;

  const normalizedTitle = normalizeTitle(recommendation.title);
  return library.some((entry) => {
    if (normalizeTitle(entry.show_title) !== normalizedTitle) return false;
    return LIBRARY_ACTIVE_STATUSES.has(entry.watch_status.toLowerCase());
  });
}

export function filterActiveRecommendations(
  recommendations: Recommendation[],
  library: UserRating[]
): Recommendation[] {
  const resolvedTitles = new Set<string>();
  for (const rec of recommendations) {
    if (isRecommendationResolved(rec, library)) {
      resolvedTitles.add(normalizeTitle(rec.title));
    }
  }

  return recommendations.filter((item) => !resolvedTitles.has(normalizeTitle(item.title)));
}

export function findRecommendationForTitle(
  title: string,
  recommendations: Recommendation[]
): Recommendation | undefined {
  const normalizedTitle = normalizeTitle(title);
  return recommendations.find((rec) => normalizeTitle(rec.title) === normalizedTitle);
}

export function matchesSearchQuery(query: string, fields: (string | undefined | null)[]): boolean {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return true;
  return fields.some((field) => field?.toLowerCase().includes(trimmed));
}

export function filterLibraryItems(items: UserRating[], query: string): UserRating[] {
  return items.filter((item) =>
    matchesSearchQuery(query, [item.show_title, item.platform, item.comments])
  );
}

export function filterRecommendations(items: Recommendation[], query: string): Recommendation[] {
  return items.filter((item) =>
    matchesSearchQuery(query, [
      item.title,
      item.platform,
      item.type,
      item.the_hook,
      item.why_she_will_love_it,
      item.comp_shows.join(" "),
    ])
  );
}

export function filterAlerts(items: EpisodeAlert[], query: string): EpisodeAlert[] {
  return items.filter((item) =>
    matchesSearchQuery(query, [item.show_title, item.alert_text])
  );
}

interface SearchTabData {
  library: UserRating[];
  activeRecommendations: Recommendation[];
  alerts: EpisodeAlert[];
}

export function tabHasSearchMatches(tab: SearchTab, query: string, data: SearchTabData): boolean {
  const trimmed = query.trim();
  if (!trimmed) return true;

  if (tab === "watching") {
    return (
      filterLibraryItems(
        data.library.filter((item) => item.watch_status.toLowerCase() === "watching"),
        trimmed
      ).length > 0
    );
  }

  if (tab === "recommended") {
    const savedMatches = filterLibraryItems(
      data.library.filter((item) => item.watch_status.toLowerCase() === "want_to_watch"),
      trimmed
    ).length;
    const recMatches = filterRecommendations(data.activeRecommendations, trimmed).length;
    const alertMatches = filterAlerts(data.alerts, trimmed).length;
    return savedMatches + recMatches + alertMatches > 0;
  }

  return (
    filterLibraryItems(
      data.library.filter((item) => {
        const status = item.watch_status.toLowerCase();
        return status === "watched" || status === "dnf";
      }),
      trimmed
    ).length > 0
  );
}

export function findSearchResultTab(
  currentTab: SearchTab,
  query: string,
  data: SearchTabData
): SearchTab | null {
  const trimmed = query.trim();
  if (!trimmed) return null;
  if (tabHasSearchMatches(currentTab, trimmed, data)) return currentTab;

  const tabs: SearchTab[] = ["watching", "recommended", "watched"];
  for (const tab of tabs) {
    if (tab !== currentTab && tabHasSearchMatches(tab, trimmed, data)) return tab;
  }
  return null;
}
