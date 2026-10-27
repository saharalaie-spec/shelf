import "server-only";
import { db } from "./db";

/**
 * Profile photos. The app shrinks a photo to a square JPEG before uploading, so they're small enough to keep in the
 * database next to everything else. Each is served at a URL carrying when it was set, so browsers can keep it forever
 * and a new photo is a new URL.
 */

export const MAX_PHOTO_BYTES = 1_500_000;

export const photoUrl = (userId: string, at: unknown) => (at == null ? null : `/api/photos/${userId}?v=${Number(at)}`);

/** What the bytes really are, whatever the upload claims: only plain images. */
function imageType(b: Uint8Array) {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

/** Saves their photo, replacing any before it, and returns its URL. Null if it isn't a usable image. */
export async function savePhoto(userId: string, bytes: Uint8Array): Promise<string | null> {
  const type = imageType(bytes);
  if (!type || bytes.length > MAX_PHOTO_BYTES) return null;
  const at = Date.now();
  const client = await db();
  await client.batch(
    [
      {
        sql: `INSERT INTO photos (user_id, data, type, updated_at) VALUES (?1, ?2, ?3, ?4)
              ON CONFLICT (user_id) DO UPDATE SET data = ?2, type = ?3, updated_at = ?4`,
        args: [userId, bytes, type, at],
      },
      { sql: "UPDATE users SET photo_at = ? WHERE id = ?", args: [at, userId] },
    ],
    "write",
  );
  return photoUrl(userId, at);
}

export async function removePhoto(userId: string) {
  const client = await db();
  await client.batch(
    [
      { sql: "DELETE FROM photos WHERE user_id = ?", args: [userId] },
      { sql: "UPDATE users SET photo_at = NULL WHERE id = ?", args: [userId] },
    ],
    "write",
  );
}

export async function readPhoto(userId: string): Promise<{ data: Uint8Array; type: string } | null> {
  const client = await db();
  const row = (await client.execute({ sql: "SELECT data, type FROM photos WHERE user_id = ?", args: [userId] })).rows[0];
  if (!row) return null;
  return { data: new Uint8Array(row.data as ArrayBuffer), type: String(row.type) };
}
