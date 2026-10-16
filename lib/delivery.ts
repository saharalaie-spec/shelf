import "server-only";
import { appHost, devCodeDelivery, emailConfigured, smsConfigured } from "./config";
import type { Identifier } from "./identifier";

/** `devCode`: show it on screen. `codeInLogs`: it's in the server log for the owner to read. */
export type DeliveryResult = { devCode?: string; codeInLogs?: boolean };

const appName = "Trove";

export async function deliverCode(to: Identifier, code: string): Promise<DeliveryResult> {
  const configured = to.kind === "phone" ? smsConfigured() : emailConfigured();
  if (!configured) {
    const delivery = devCodeDelivery(to.value);
    if (!delivery) {
      console.warn(
        `No ${to.kind === "phone" ? "SMS (Twilio)" : "email (Resend)"} provider is configured, and ALLOW_DEV_CODES doesn’t include ${to.display}.`,
      );
      throw new Error(`${to.kind === "phone" ? "Texting" : "Emailing"} sign-in codes isn’t set up on this server yet.`);
    }
    console.log(`\n  🔑 Login code for ${to.display}: ${code}\n`);
    return delivery === "screen" ? { devCode: code } : { codeInLogs: true };
  }
  if (to.kind === "phone") await sendSms(to.value, code);
  else await sendEmail(to.value, code);
  return {};
}

async function sendSms(phone: string, code: string) {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  // The last line lets Android Chrome autofill the code (WebOTP); iOS picks up "code" automatically.
  const body = `${code} is your ${appName} code.\n\n@${appHost()} #${code}`;
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
