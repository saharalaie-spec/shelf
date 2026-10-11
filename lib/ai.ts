import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { Candidate } from "./types";

/** The shelf-photo feature lights up when an Anthropic credential is configured. */
export const aiEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

const BOOKS_SCHEMA = {
  type: "object",
  properties: {
    books: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          author: { type: "string", description: "Empty string if not visible or not known." },
        },
        required: ["title", "author"],
        additionalProperties: false,
      },
    },
  },
  required: ["books"],
  additionalProperties: false,
};

const PROMPT = `This is a photo of someone's books (a shelf, a stack, or covers).
List every book you can identify from spines or covers, in the order they appear.
Use the book's real, full title as it is commonly known, correcting obvious spine abbreviations.
Include the author when it's printed or you're confident who wrote it; otherwise leave it empty.
Skip anything you can't read well enough to identify. Don't guess at blurry spines.`;

export async function booksFromPhoto(
  data: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp",
): Promise<Candidate[]> {
  const client = new Anthropic();
  const response = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    // If the request is declined, retry on Anthropic's recommended fallback model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: BOOKS_SCHEMA },
    },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data } },
          { type: "text", text: PROMPT },
        ],
      },
    ],
  });

  if (response.stop_reason === "refusal") return [];
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") return [];
  const parsed = JSON.parse(text.text) as { books: { title: string; author: string }[] };
  return parsed.books
    .filter((b) => b.title.trim())
    .map((b) => ({ title: b.title.trim(), author: b.author.trim() || undefined }));
}
