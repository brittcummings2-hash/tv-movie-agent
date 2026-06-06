export const PORTAL_SESSION_COOKIE = "portal_session";

export function getPortalPassword(): string | null {
  const password = process.env.PORTAL_PASSWORD?.trim();
  return password || null;
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqualString(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let i = 0; i < left.length; i += 1) {
    result |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return result === 0;
}

export async function createSessionToken(password: string): Promise<string> {
  return sha256Hex(password);
}

export async function getExpectedSessionToken(): Promise<string | null> {
  const password = getPortalPassword();
  if (!password) return null;
  return createSessionToken(password);
}

export async function isValidSessionToken(token: string | undefined): Promise<boolean> {
  const expected = await getExpectedSessionToken();
  if (!expected || !token) return false;
  return timingSafeEqualString(token, expected);
}

export function isPortalAuthEnabled(): boolean {
  return Boolean(getPortalPassword());
}
