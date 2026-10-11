import "server-only";
import { parseIdentifier } from "./identifier";

/**
 * Database location. A local SQLite file in development; on Vercel (read-only disk) it must be a
 * hosted libSQL database: DATABASE_URL, or the TURSO_* variables Vercel's Turso integration adds.
 */
export const databaseUrl = () =>
  process.env.DATABASE_URL || process.env.TURSO_DATABASE_URL || (process.env.VERCEL ? null : "file:data/shelf.db");

export const databaseToken = () => process.env.DATABASE_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN || undefined;

export const smsConfigured = () =>
  Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      (process.env.TWILIO_FROM || process.env.TWILIO_MESSAGING_SERVICE_SID),
  );

export const emailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);

const isProduction = () => process.env.NODE_ENV === "production";
const devCodesSetting = () => process.env.ALLOW_DEV_CODES?.trim() ?? "";

/** Whether some sign-ins may get their code on screen instead of by SMS/email. */
export const devCodesEnabled = () => !isProduction() || devCodesSetting() !== "";

/**
 * On-screen codes: always in development. In production only when ALLOW_DEV_CODES is set,
 * either to "1" (anyone, for a private demo) or to a comma-separated list of the phone numbers
 * (with country code) and emails that may sign in that way.
 */
export function devCodesAllowedFor(identifier: string) {
  if (!isProduction()) return true;
  const setting = devCodesSetting();
  if (setting === "1") return true;
  return setting
    .split(",")
    .map((entry) => parseIdentifier(entry)?.value)
    .some((value) => value === identifier);
}

/** Which sign-in tabs can actually deliver a code on this server. */
export const signInChannels = () => ({
  phone: smsConfigured() || devCodesEnabled(),
  email: emailConfigured() || devCodesEnabled(),
});

/** Public host name, for the WebOTP line in texts. */
export function appHost() {
  const base =
    process.env.APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "") ||
    "http://localhost:3000";
  try {
    return new URL(base).hostname;
  } catch {
    return "localhost";
  }
}
