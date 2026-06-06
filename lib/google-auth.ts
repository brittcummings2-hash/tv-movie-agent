import { google } from "googleapis";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

function getOAuthAuth() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN?.trim();

  if (!clientId || !clientSecret || !refreshToken) {
    return null;
  }

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: refreshToken });
  return oauth2;
}

export function getGoogleAuth() {
  const oauth = getOAuthAuth();
  if (!oauth) {
    throw new Error(
      "Google OAuth missing. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN in .env.local"
    );
  }
  return oauth;
}

export function getSheetId(): string {
  const id = process.env.GOOGLE_SHEET_ID?.trim();
  if (!id) {
    throw new Error("GOOGLE_SHEET_ID is not configured");
  }
  return id;
}

export { SCOPES };
