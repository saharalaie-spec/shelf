import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { AuthError } from "./auth";
import type { Candidate, Kind } from "./types";

/** Photo and screenshot reading lights up when an Anthropic credential is configured. */
export const aiEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

/** The key as pasted into a dashboard can carry stray spaces, line breaks or quotes; those make it "invalid". */
export const cleanKey = (key: string | undefined) => key?.trim().replace(/^["']|["']$/g, "").trim() || undefined;

/** A Claude client, tolerant of how the key was pasted. */
export const anthropic = () => new Anthropic({ apiKey: cleanKey(process.env.ANTHROPIC_API_KEY) });

/** Why a Claude request failed, in words that say what to fix, instead of a bare "Something went wrong". */
export function aiProblem(err: unknown): unknown {
  if (!(err instanceof Anthropic.APIError)) return err;
  console.error("Claude request failed:", err.status, err.message);
  const said = (err.error as { error?: { message?: string } } | undefined)?.error?.message ?? "";
  if (err instanceof Anthropic.AuthenticationError) return new AuthError("AI is off: the Anthropic API key was rejected. Check ANTHROPIC_API_KEY.", 503);
  if (/credit balance/i.test(said)) return new AuthError("AI is off: the Anthropic account is out of credit.", 503);
  if (err instanceof Anthropic.PermissionDeniedError) return new AuthError("AI is off: this Anthropic key isn’t allowed to make this request.", 503);
  if (err instanceof Anthropic.RateLimitError) return new AuthError("Lots of requests right now. Try again in a minute.", 429);
  if (err instanceof Anthropic.APIConnectionError || err instanceof Anthropic.InternalServerError) {
    return new AuthError("Couldn’t reach Claude just now. Try again in a minute.", 503);
  }
  return new AuthError(`Claude couldn’t do that: ${said || err.message}`.slice(0, 240), 502);
}

const SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          creator: { type: "string", description: "Author, host or director. Empty string if not visible or not known." },
          year: { type: "integer", description: "Release year if shown or certain; 0 otherwise." },
        },
        required: ["title", "creator", "year"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

const PROMPTS: Record<Kind, string> = {
  book: `This is a photo of someone's books (a shelf, a stack, or covers), or a screenshot of a reading app.
List every book you can identify from spines, covers or the screen, in the order they appear.
Use the book's real, full title as it is commonly known, correcting obvious spine abbreviations.
Put the author in "creator" when it's printed or you're confident who wrote it; otherwise leave it empty.
Skip anything you can't read well enough to identify. Don't guess at blurry spines.`,
  podcast: `This is a screenshot of someone's podcast app (Spotify, Apple Podcasts, Overcast, Pocket Casts…),
or a photo of a screen showing podcasts. List every podcast show you can identify, in the order they appear.
Use the show's name, not an episode title. Put the host or publisher in "creator" if it's shown; otherwise leave it empty.
Skip anything you can't read or identify with confidence.`,
  screen: `This is a screenshot of a streaming app, a watchlist, a Letterboxd or IMDb page, or a photo of movies
(DVDs, Blu-rays, posters, a TV screen). List every movie or TV show you can identify, in the order they appear.
Use the commonly known title (the show's name, not an episode). Put the year in "year" when it's shown or you're
certain which release it is; otherwise 0. Leave "creator" empty unless a director is printed.
Skip anything you can't read or identify with confidence.`,
  place: `This is a screenshot of a saved list in Google Maps or Apple Maps, a travel note, a guidebook page, or a photo
of a sign or a menu. List every specific place you can identify (restaurants, cafés, bars, museums, beaches, parks,
shops, viewpoints…), in the order they appear. Use the place's own name, not its address or category.
Put the neighborhood or city in "creator" if it's shown; otherwise leave it empty. Always set "year" to 0.
Skip anything you can't read or identify with confidence.`,
};

export async function itemsFromPhoto(
  kind: Kind,
  data: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp",
): Promise<Candidate[]> {
  const client = anthropic();
  const response = await client.beta.messages
    .create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      // If the request is declined, retry on Anthropic's recommended fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: SCHEMA },
      },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data } },
            { type: "text", text: PROMPTS[kind] },
          ],
        },
      ],
    })
    .catch((err) => {
      throw aiProblem(err);
    });

  if (response.stop_reason === "refusal") return [];
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") return [];
  const parsed = JSON.parse(text.text) as { items: { title: string; creator: string; year: number }[] };
  return parsed.items
    .filter((b) => b.title.trim())
    .map((b) => ({
      title: b.title.trim(),
      author: b.creator.trim() || undefined,
      year: b.year > 1800 && b.year < 2100 ? b.year : undefined,
    }));
}
