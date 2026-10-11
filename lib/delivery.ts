import "server-only";
import type { Identifier } from "./identifier";

export type DeliveryResult = { devCode?: string };

const appName = "Shelf";

function appHost() {
  try {
    return new URL(process.env.APP_URL ?? "http://localhost:3000").host;
  } catch {
    return "localhost:3000";
  }
}

const smsConfigured = () =>
  Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      (process.env.TWILIO_FROM || process.env.TWILIO_MESSAGING_SERVICE_SID),
  );

const emailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);

/** Codes are shown on screen (and logged) when no real provider is set up. Never in production unless opted in. */
const devCodesAllowed = () =>
  process.env.NODE_ENV !== "production" || process.env.ALLOW_DEV_CODES === "1";

export async function deliverCode(to: Identifier, code: string): Promise<DeliveryResult> {
  const configured = to.kind === "phone" ? smsConfigured() : emailConfigured();
  if (!configured) {
    if (!devCodesAllowed()) {
      throw new Error(`${to.kind === "phone" ? "SMS" : "Email"} sign-in isn’t set up yet.`);
    }
    console.log(`\n  🔑 Login code for ${to.display}: ${code}\n`);
    return { devCode: code };
  }
  if (to.kind === "phone") await sendSms(to.value, code);
  else await sendEmail(to.value, code);
  return {};
}

async function sendSms(phone: string, code: string) {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  // The last line lets Android Chrome autofill the code (WebOTP); iOS picks up "code" automatically.
  const body = `${code} is your ${appName} code.\n\n@${appHost().split(":")[0]} #${code}`;
  const form = new URLSearchParams({ To: phone, Body: body });
  if (process.env.TWILIO_MESSAGING_SERVICE_SID) {
    form.set("MessagingServiceSid", process.env.TWILIO_MESSAGING_SERVICE_SID);
  } else {
    form.set("From", process.env.TWILIO_FROM!);
  }
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form,
  });
  if (!res.ok) {
    console.error("Twilio error", res.status, await res.text());
    throw new Error("We couldn’t text that number. Double-check it?");
  }
}

async function sendEmail(email: string, code: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: email,
      // Code first so it's readable straight from the notification.
      subject: `${code} is your ${appName} code`,
      text: `Your ${appName} sign-in code is ${code}. It expires in 10 minutes.`,
      html: `<div style="font-family:system-ui,sans-serif;padding:24px">
        <p style="color:#6f6a62;margin:0 0 8px">Your ${appName} sign-in code</p>
        <p style="font-size:36px;letter-spacing:8px;font-weight:600;margin:0 0 16px">${code}</p>
        <p style="color:#6f6a62;margin:0">It expires in 10 minutes. If you didn’t ask for it, ignore this email.</p>
      </div>`,
    }),
  });
  if (!res.ok) {
    console.error("Resend error", res.status, await res.text());
    throw new Error("We couldn’t email that address. Double-check it?");
  }
}
