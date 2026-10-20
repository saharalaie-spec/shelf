import "server-only";
import { randomUUID } from "node:crypto";
import type { Row } from "@libsql/client";
import { AuthError } from "./auth";
import { db } from "./db";
import type { Area, BBox, Destination } from "./types";

/** A destination plus how many spots it holds (in the view asked for). */
export type DestinationWithCount = Destination & { count: number };

function parseBBox(raw: unknown): BBox | null {
  if (!raw) return null;
  try {
    const b = JSON.parse(String(raw));
    return Array.isArray(b) && b.length === 4 && b.every((n) => typeof n === "number") ? (b as BBox) : null;
  } catch {
    return null;
  }
}

const toDestination = (r: Row): Destination => ({
  id: String(r.id),
  name: String(r.name),
  country: r.country ? String(r.country) : null,
  label: r.label ? String(r.label) : null,
  lat: r.lat == null ? null : Number(r.lat),
  lon: r.lon == null ? null : Number(r.lon),
  bbox: parseBBox(r.bbox),
  createdAt: Number(r.created_at),
});

/**
 * A user's destinations, most recently used first. Other people's views only see destinations that
 * have something they may see in them, so a trip made entirely of private spots stays invisible.
 */
export async function listDestinations(
  userId: string,
  { includePrivate = false, includeEmpty = false } = {},
): Promise<DestinationWithCount[]> {
  const client = await db();
  const visible = includePrivate ? "" : "AND b.private = 0";
  const { rows } = await client.execute({
    sql: `SELECT d.*, COUNT(b.id) AS n, MAX(b.status_at) AS last
          FROM destinations d LEFT JOIN books b ON b.destination_id = d.id ${visible}
          WHERE d.user_id = ?
          GROUP BY d.id
          ${includeEmpty ? "" : "HAVING COUNT(b.id) > 0"}
          ORDER BY coalesce(MAX(b.status_at), d.created_at) DESC`,
    args: [userId],
  });
  return rows.map((r) => ({ ...toDestination(r), count: Number(r.n) }));
}

export async function getDestination(userId: string, id: string): Promise<Destination | null> {
  const client = await db();
  const row = (
    await client.execute({ sql: "SELECT * FROM destinations WHERE id = ? AND user_id = ?", args: [id, userId] })
  ).rows[0];
  return row ? toDestination(row) : null;
}

/** The input for a new destination, from the map or typed by hand. */
export type NewDestination = Area & { label?: string | null };

/**
 * Finds the user's destination with this name (case-insensitively) or creates it. Saving a friend's spot
 * reuses your own "Valencia" if you have one, so the same city never splits in two.
 */
export async function findOrCreateDestination(userId: string, input: NewDestination): Promise<Destination> {
  const name = input.name.trim().replace(/\s+/g, " ").slice(0, 80);
  if (!name) throw new AuthError("Give the place a name.");
  const client = await db();
  const res = await client.execute({
    sql: `INSERT INTO destinations (id, user_id, name, country, label, lat, lon, bbox, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT DO NOTHING
          RETURNING *`,
    args: [
      randomUUID(),
      userId,
      name,
      input.country?.trim().slice(0, 80) || null,
      input.label?.trim().slice(0, 40) || null,
      validCoord(input.lat, 90),
      validCoord(input.lon, 180),
      validBBox(input.bbox) ? JSON.stringify(input.bbox) : null,
      Date.now(),
    ],
  });
  if (res.rows[0]) return toDestination(res.rows[0]);
  const existing = (
    await client.execute({
      sql: "SELECT * FROM destinations WHERE user_id = ? AND lower(name) = lower(?)",
      args: [userId, name],
    })
  ).rows[0];
  return toDestination(existing);
}

export async function renameDestination(userId: string, id: string, name: string): Promise<Destination> {
  const clean = name.trim().replace(/\s+/g, " ").slice(0, 80);
  if (!clean) throw new AuthError("Give the place a name.");
  const client = await db();
  try {
    const row = (
      await client.execute({
        sql: "UPDATE destinations SET name = ? WHERE id = ? AND user_id = ? RETURNING *",
        args: [clean, id, userId],
      })
    ).rows[0];
    if (!row) throw new AuthError("That place is gone.", 404);
    return toDestination(row);
  } catch (err) {
    if (/UNIQUE/i.test(String(err))) throw new AuthError(`You already have a place called ${clean}.`);
    throw err;
  }
}

/** Deletes a destination and every spot in it. */
export async function deleteDestination(userId: string, id: string) {
  const client = await db();
  await client.batch(
    [
      // Explicit as well as ON DELETE CASCADE, so it holds even on a connection without foreign keys on.
      { sql: "DELETE FROM books WHERE destination_id = ? AND user_id = ?", args: [id, userId] },
      { sql: "DELETE FROM destinations WHERE id = ? AND user_id = ?", args: [id, userId] },
    ],
    "write",
  );
}

function validCoord(n: unknown, max: number) {
  return typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= max ? n : null;
}

function validBBox(b: unknown): b is BBox {
  return (
    Array.isArray(b) &&
    b.length === 4 &&
    b.every((n) => typeof n === "number" && Number.isFinite(n)) &&
    b[0] <= b[2] &&
    b[1] <= b[3]
  );
}

/** An area as sent by a browser (a city picked from the map, not necessarily one of yours), checked. */
export function cleanArea(raw: unknown): Area | null {
  const a = raw as Partial<Area> | null;
  if (!a || typeof a.name !== "string" || !a.name.trim()) return null;
  const num = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? n : null);
  const bbox = Array.isArray(a.bbox) && a.bbox.length === 4 && a.bbox.every((n) => typeof n === "number") ? (a.bbox as BBox) : null;
  return {
    name: a.name.trim().slice(0, 120),
    country: typeof a.country === "string" ? a.country.slice(0, 80) : null,
    lat: num(a.lat),
    lon: num(a.lon),
    bbox,
  };
}
