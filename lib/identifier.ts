import {
  AsYouType,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js/min";

export type Identifier = {
  kind: "email" | "phone";
  /** Normalized value we store: lowercase email or E.164 phone. */
  value: string;
  /** Pretty version for "we sent a code to …". */
  display: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function looksLikeEmail(input: string) {
  return /[@a-z]/i.test(input.replace(/^\+/, ""));
}

export function parseIdentifier(input: string, country?: CountryCode): Identifier | null {
  const raw = input.trim();
  if (!raw) return null;

  if (raw.includes("@")) {
    const email = raw.toLowerCase();
    return EMAIL_RE.test(email) ? { kind: "email", value: email, display: email } : null;
  }

  const phone = parsePhoneNumberFromString(raw, country);
  if (!phone || !phone.isValid()) return null;
  return { kind: "phone", value: phone.number, display: phone.formatInternational() };
}

export function formatPhoneAsYouType(input: string, country: CountryCode) {
  return new AsYouType(country).input(input);
}

export function dialCode(country: CountryCode) {
  return `+${getCountryCallingCode(country)}`;
}

/** Best guess at the visitor's country from their browser locale. */
export function guessCountry(): CountryCode {
  if (typeof navigator === "undefined") return "US";
  for (const lang of navigator.languages ?? [navigator.language]) {
    const region = lang.split("-")[1]?.toUpperCase();
    if (region && region.length === 2 && isSupportedCountry(region)) return region as CountryCode;
  }
  return "US";
}

function isSupportedCountry(code: string) {
  try {
    getCountryCallingCode(code as CountryCode);
    return true;
  } catch {
    return false;
  }
}
