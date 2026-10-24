import "server-only";
import { parseIdentifier } from "./identifier";

/**
 * Database location. A local SQLite file in development; on Vercel (read-only disk) it must be a
 * hosted libSQL database: DATABASE_URL, or the TURSO_* variables Vercel's Turso integration adds.
 * The local file keeps the name it had before the app was called Trove, so existing data stays put.
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

/** Whether some sign-ins can get a code without a texting or email provider. */
export const devCodesEnabled = () => !isProduction() || devCodesSetting() !== "";

const warned = new Set<string>();

/** A comma-separated list of phone numbers and emails, normalized like sign-in identifiers. "14155550123" reads as "+14155550123". */
function identifierList(setting: string, name: string) {
  return setting
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .flatMap((entry) => {
      const parsed =
        parseIdentifier(entry) ?? (/^[\d\s().-]+$/.test(entry) ? parseIdentifier(`+${entry.replace(/\D/g, "")}`) : null);
      if (!parsed && !warned.has(entry)) {
        warned.add(entry);
        console.warn(
          `${name} entry "${entry}" isn’t a phone number or email. Write phone numbers as +<country code><number>, e.g. +14155550123.`,
        );
      }
      return parsed ? [parsed.value] : [];
    });
}

const allowList = () => identifierList(devCodesSetting(), "ALLOW_DEV_CODES");

/** Whoever runs this Trove (OWNERS: their phone numbers or emails): they read the feedback and the numbers. */
export const isOwner = (user: { phone: string | null; email: string | null }) => {
  const owners = identifierList(process.env.OWNERS ?? "", "OWNERS");
  return [user.phone, user.email].some((v) => v && owners.includes(v));
};

/** Accounts the numbers leave out: the owners, plus test accounts listed in NOT_COUNTED. */
export const notCounted = (user: { phone: string | null; email: string | null }) => {
  const test = identifierList(process.env.NOT_COUNTED ?? "", "NOT_COUNTED");
  return isOwner(user) || [user.phone, user.email].some((v) => v && test.includes(v));
};

/** The time zone the numbers count days in (TIME_ZONE, e.g. America/Los_Angeles). New York unless set. */
export function timeZone() {
  const tz = process.env.TIME_ZONE?.trim() || "America/New_York";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    if (!warned.has(tz)) {
      warned.add(tz);
      console.warn(`TIME_ZONE "${tz}" isn’t a time zone; counting days in New York time. Use a name like America/Los_Angeles.`);
    }
    return "America/New_York";
  }
}

/**
 * How a sign-in code reaches someone when no texting/email provider is set up:
 * - "screen": shown in the app. Always in development; in production only with ALLOW_DEV_CODES=1,
 *   which lets anyone sign in as anyone (private demos only).
 * - "log": written to the server log (Vercel → Logs), for the numbers and emails listed in
 *   ALLOW_DEV_CODES. Only people who can open the project's logs can read it.
 * - null: no way to deliver it.
 */
export function devCodeDelivery(identifier: string): "screen" | "log" | null {
  if (!isProduction() || devCodesSetting() === "1") return "screen";
  return allowList().includes(identifier) ? "log" : null;
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
