export function formatGoogleSheetsError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (lower.includes("invalid_grant")) {
    return "Google sign-in expired. Run npm run google:auth locally, then update GOOGLE_REFRESH_TOKEN on Vercel.";
  }

  if (lower.includes("google oauth missing")) {
    return "Google OAuth is not configured on the server.";
  }

  if (lower.includes("google_sheet_id")) {
    return "GOOGLE_SHEET_ID is not configured on the server.";
  }

  return message || "Failed to load tracker";
}
