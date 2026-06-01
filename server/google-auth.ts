import { google } from "googleapis";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/tasks",
];

export function isGoogleOAuthConfigured(): boolean {
  return !!(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REFRESH_TOKEN
  );
}

export function hasGoogleOAuthCredentials(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function createOAuth2Client(redirectUri?: string) {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri || process.env.GOOGLE_REDIRECT_URI,
  );
}

export async function getOAuth2Client() {
  if (!hasGoogleOAuthCredentials()) {
    throw new Error(
      "Google OAuth not configured: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET required",
    );
  }
  if (!process.env.GOOGLE_REFRESH_TOKEN) {
    throw new Error("Google OAuth not configured: GOOGLE_REFRESH_TOKEN required");
  }

  const client = createOAuth2Client();
  client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return client;
}

export function getGoogleAuthUrl(redirectUri: string): string {
  const client = createOAuth2Client(redirectUri);
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });
}

export async function exchangeGoogleAuthCode(code: string, redirectUri: string) {
  const client = createOAuth2Client(redirectUri);
  const { tokens } = await client.getToken(code);
  return tokens;
}

export function resolveGoogleRedirectUri(req: { protocol: string; get: (name: string) => string | undefined }): string {
  if (process.env.GOOGLE_REDIRECT_URI) {
    return process.env.GOOGLE_REDIRECT_URI;
  }
  const host = req.get("host");
  const protocol = req.protocol === "https" || req.get("x-forwarded-proto") === "https" ? "https" : "http";
  return `${protocol}://${host}/api/google/oauth/callback`;
}
