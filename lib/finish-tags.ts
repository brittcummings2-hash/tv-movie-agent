import type { Recommendation, UserRating } from "./types";

const MAX_TAG_LENGTH = 32;
const MAX_TAG_WORDS = 4;

export const RATING_TIER_LABELS: Record<number, string> = {
  5: "All-Time Fave",
  4: "Really Loved It",
  3: "Good / Liked It",
  2: "Meh / Mixed",
  1: "Didn't Like It",
  0: "DNF",
};

/** Tags tuned to Brittany's taste: female-led mysteries, elite worlds, twisty thrillers, smart true crime. */
export const RATING_FINISH_TAGS: Record<number, readonly string[]> = {
  5: [
    "Unpredictable Twists",
    "Obsessive Characters",
    "Central Mystery",
    "Perfect Pacing",
    "Satisfying Ending",
    "Smart Writing",
    "Layered Mystery",
    "Morally Gray Leads",
    "Couldn't Look Away",
    "Instant Rewatch",
  ],
  4: [
    "Great Characters",
    "Kept Me Hooked",
    "Strong Mystery",
    "Solid Pacing",
    "Good Twist",
    "Would Rewatch",
    "Almost Perfect Ending",
    "Worth the Hype",
    "Dark but Satisfying",
    "Glad I Finished",
  ],
  3: [
    "Watchable",
    "Good Not Great",
    "Some Great Episodes",
    "Fell Off Mid-Season",
    "Slow Start, Worth It",
    "Decent Mystery",
    "Mixed Bag",
    "Fine Overall",
    "Uneven but Finished",
    "Strong Start, Weak Finish",
  ],
  2: [
    "Overhyped",
    "Disappointing Ending",
    "Lost Steam Mid-Season",
    "Annoying Characters",
    "Too Slow",
    "Too Predictable",
    "Romance Took Over",
    "True Crime Fatigue",
    "Couldn't Connect",
    "Ending Ruined It",
  ],
  1: [
    "Boring",
    "Weak Writing",
    "Not My Vibe",
    "Unlikable Leads",
    "Too Dark, No Payoff",
    "Too Procedural",
    "Felt Exploitative",
    "Bad Ending",
    "Waste of Time",
    "No Payoff at All",
  ],
  0: [
    "Too Slow to Start",
    "Wrong Genre for Me",
    "Lost Interest Early",
    "Not Enough Mystery",
    "Too Bleak",
    "Wanted Tension, Got Comedy",
    "Heard It Gets Worse",
    "Survival Trauma Focus",
  ],
};

function uniqueTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tag of tags) {
    const trimmed = tag.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function isValidTag(tag: string): boolean {
  if (tag.length > MAX_TAG_LENGTH) return false;
  if (tag.split(/\s+/).length > MAX_TAG_WORDS) return false;
  if (/^(it is|which may|for those|focused on)/i.test(tag)) return false;
  return true;
}

function splitPipeTags(value: string): string[] {
  if (!value.trim()) return [];
  return value
    .split("|")
    .map((part) => part.trim())
    .filter((part) => isValidTag(part));
}

export function getFinishTagsForRating(rating: number): string[] {
  const rounded = Math.round(rating);
  if (rounded <= 0) return [...RATING_FINISH_TAGS[0]];
  if (rounded >= 5) return [...RATING_FINISH_TAGS[5]];
  return [...RATING_FINISH_TAGS[rounded]];
}

export function getRatingTierLabel(rating: number): string {
  const rounded = Math.round(rating);
  if (rounded <= 0) return RATING_TIER_LABELS[0];
  if (rounded >= 5) return RATING_TIER_LABELS[5];
  return RATING_TIER_LABELS[rounded];
}

export function buildFinishTagSuggestions(
  item: UserRating,
  _recommendation: Recommendation | undefined,
  rating: number
): string[] {
  if (rating < 1) return [];

  const tierTags = getFinishTagsForRating(rating);
  const tierKeys = new Set(tierTags.map((tag) => tag.toLowerCase()));
  const existing = splitPipeTags(item.why_reasons).filter((tag) => tierKeys.has(tag.toLowerCase()));

  return uniqueTags([...existing, ...tierTags]).filter(isValidTag);
}

export function formatFinishTags(tags: string[]): string {
  return tags.map((tag) => tag.trim()).filter(Boolean).join(" | ");
}

export function parseFinishTags(value: string): string[] {
  return splitPipeTags(value);
}

export function filterTagsForRating(tags: string[], rating: number): string[] {
  const allowed = new Set(getFinishTagsForRating(rating).map((tag) => tag.toLowerCase()));
  return tags.filter((tag) => allowed.has(tag.toLowerCase()));
}
