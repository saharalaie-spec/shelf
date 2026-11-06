import "server-only";
import { isNamedSpot, matchCandidates } from "./catalog";
import { db } from "./db";
import { toDestination } from "./destinations";

/**
 * Details for spots saved by name only: a Google Maps list's places our map didn't know at import, or a spot typed in
 * by hand. Looked up again on the map of their place (Google, once its key is set, or OpenStreetMap), a few at a time
 * after a page is sent, each at most once a month; when the map knows one by that name, it gets its address,
 * neighborhood, type and position. Its key stays, so a Google Maps link keeps opening the very place it came from.
 */

const RECHECK_MS = 30 * 24 * 60 * 60 * 1000;
const PER_RUN = 10;
const running = new Set<string>();

/** Fills in a few of one person's spots that have no details. Never throws. */
export async function fillSpotDetails(userId: string, limit = PER_RUN) {
  if (running.has(userId)) return;
  running.add(userId);
  try {
    const client = await db();
    const now = Date.now();
    // Spots have no covers, so cover_checked_at is free to say when their details were last looked for.
    const { rows } = await client.execute({
      sql: `SELECT b.id, b.title, d.id AS d_id, d.name, d.country, d.label, d.lat, d.lon, d.bbox, d.created_at
            FROM books b JOIN destinations d ON d.id = b.destination_id
            WHERE b.user_id = ? AND b.kind = 'place' AND b.geo IS NULL
              AND (b.cover_checked_at IS NULL OR b.cover_checked_at < ?)
            ORDER BY b.added_at DESC LIMIT ?`,
      args: [userId, now - RECHECK_MS, limit],
    });
    for (const r of rows) {
      const title = String(r.title);
      const area = toDestination({ ...r, id: r.d_id });
      const [found] = await matchCandidates("place", [{ title }], area).catch(() => []);
      const hit = found?.match && isNamedSpot(found.match, title) ? found.match : null;
      await client.execute(
        hit?.place
          ? {
              sql: `UPDATE books SET geo = ?, author = coalesce(author, ?),
                      categories = CASE WHEN categories = '[]' THEN ? ELSE categories END, cover_checked_at = ? WHERE id = ?`,
              args: [JSON.stringify(hit.place), hit.author, JSON.stringify(hit.categories), now, String(r.id)],
            }
          : { sql: "UPDATE books SET cover_checked_at = ? WHERE id = ?", args: [now, String(r.id)] },
      );
    }
  } catch (err) {
    console.warn("Couldn't fill in spot details:", (err as Error).message);
  } finally {
    running.delete(userId);
  }
}
