import "server-only";
import { randomUUID } from "node:crypto";
import { AuthError, type User } from "./auth";
import { emailConfigured } from "./config";
import { db } from "./db";

/**
 * Feedback: a few words (usually dictated) from someone using Trove, kept as text for whoever runs it to read on
 * /feedback, and emailed to FEEDBACK_EMAIL when email is set up. Also written to the server log, so nothing is lost
 * before either exists.
 */

export type Feedback = { id: string; name: string | null; contact: string | null; text: string; page: string | null; at: number };

const MAX = 4000;

export async function saveFeedback(user: User, rawText: string, page: string | null) {
  const text = rawText.trim().slice(0, MAX);
  if (!text) throw new AuthError("Say or type something first.");
  const contact = user.email ?? user.phone;
  const client = await db();
  await client.execute({
    sql: "INSERT INTO feedback (id, user_id, name, contact, text, page, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    args: [randomUUID(), user.id, user.name, contact, text, page?.slice(0, 200) ?? null, Date.now()],
  });
  console.log(`💬 Feedback from ${user.name ?? "someone"} (${contact ?? "no contact"})${page ? ` on ${page}` : ""}: ${text}`);
  await emailIt(user.name, contact, text, page).catch((err) => console.error("Couldn’t email feedback:", err));
}

async function emailIt(name: string | null, contact: string | null, text: string, page: string | null) {
  const to = process.env.FEEDBACK_EMAIL?.trim();
  if (!to || !emailConfigured()) return;
  const who = [name, contact].filter(Boolean).join(" · ") || "Someone";
  const escape = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to,
      subject: `Trove feedback from ${name ?? "someone"}`,
      text: `${who}${page ? ` (on ${page})` : ""}:\n\n${text}`,
      html: `<div style="font-family:system-ui,sans-serif;padding:16px"><p style="color:#6f6a62;margin:0 0 8px">${escape(who)}${
        page ? ` · on ${escape(page)}` : ""
      }</p><p style="font-size:16px;white-space:pre-wrap;margin:0">${escape(text)}</p></div>`,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

export async function listFeedback(limit = 200): Promise<Feedback[]> {
  const client = await db();
  const { rows } = await client.execute({ sql: "SELECT * FROM feedback ORDER BY created_at DESC LIMIT ?", args: [limit] });
  return rows.map((r) => ({
    id: String(r.id),
    name: r.name ? String(r.name) : null,
    contact: r.contact ? String(r.contact) : null,
    text: String(r.text),
    page: r.page ? String(r.page) : null,
    at: Number(r.created_at),
  }));
}
