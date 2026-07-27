import { NextResponse } from "next/server";
import { searchTitleCandidates } from "@/lib/tmdb";

/** Candidate matches for a typed title, so the add flow can disambiguate. */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim() ?? "";
    if (!query) {
      return NextResponse.json({ candidates: [] });
    }

    const candidates = await searchTitleCandidates(query);
    return NextResponse.json({ candidates }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
