import { NextResponse } from "next/server";
import { mapRecommendations } from "@/lib/mappers";
import { invalidateCachedPrefix } from "@/lib/sheet-cache";
import { findRecommendationForTitle } from "@/lib/search";
import { getSheetRows } from "@/lib/sheets";
import { SHEET_TABS } from "@/lib/types";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const title = searchParams.get("title")?.trim() ?? "";
    if (!title) {
      return NextResponse.json({ error: "Missing title" }, { status: 400 });
    }

    invalidateCachedPrefix("bootstrap:");
    invalidateCachedPrefix("recommendations:");

    const rows = await getSheetRows(SHEET_TABS.RECOMMENDATIONS);
    const recommendations = mapRecommendations(rows);
    const recommendation = findRecommendationForTitle(title, recommendations);

    const ready = Boolean(
      recommendation &&
        recommendation.fit_score > 0 &&
        (recommendation.the_hook || recommendation.why_she_will_love_it) &&
        (recommendation.why_options_positive || recommendation.why_she_will_love_it)
    );

    return NextResponse.json(
      { ready, recommendation: ready ? recommendation : null },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Poll failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
