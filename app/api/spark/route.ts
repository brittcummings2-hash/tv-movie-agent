import { NextResponse } from "next/server";
import { invalidateCachedPrefix } from "@/lib/sheet-cache";
import { runSparkRecommendations } from "@/lib/spark";

export const maxDuration = 60;

export async function POST() {
  try {
    const result = await runSparkRecommendations();
    invalidateCachedPrefix("recommendations:");
    invalidateCachedPrefix("bootstrap:");
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Spark refresh failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
