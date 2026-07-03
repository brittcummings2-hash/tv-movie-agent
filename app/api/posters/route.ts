import { NextResponse } from "next/server";
import { resolveLibraryMedia, type PosterRequestItem } from "@/lib/poster-batch";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const items = Array.isArray(body.items) ? (body.items as PosterRequestItem[]) : [];
    const media = await resolveLibraryMedia(items);
    return NextResponse.json(media, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load posters";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
