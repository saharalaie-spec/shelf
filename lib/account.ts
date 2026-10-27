import "server-only";
import { db } from "./db";

/**
 * Deletes an account and everything in it: lists, places, share links, friends, requests, ideas, notes, sign-ins.
 * What friends saved from you stays on their lists, still saying who recommended it, by the name it was saved with.
 * Spelled out table by table rather than left to ON DELETE CASCADE, which a remote libSQL connection doesn't promise
 * to enforce on every request.
 */
export async function deleteAccount(user: { id: string; phone: string | null; email: string | null }) {
  const client = await db();
  const id = user.id;
  const identifiers = [user.phone, user.email].filter((v): v is string => Boolean(v));
  const mine = (sql: string) => ({ sql, args: [id] });
  const forIdentifiers = (sql: string) =>
    identifiers.map((value) => ({ sql, args: [value] }));
  await client.batch(
    [
      mine("DELETE FROM thanks WHERE from_user = ?1 OR to_user = ?1"),
      // Feedback stays (it's about the app), but no longer says who sent it.
      mine("UPDATE feedback SET user_id = NULL, name = NULL, contact = NULL WHERE user_id = ?"),
      mine("DELETE FROM starter_picks WHERE user_id = ?"),
      mine("DELETE FROM activity WHERE user_id = ?"),
      // People this account brought in keep their accounts; they just no longer say who invited them.
      mine("UPDATE users SET invited_by = NULL WHERE invited_by = ?"),
      // Friends keep what they saved from you; it just stops linking to an account that's gone.
      mine("UPDATE books SET rec_user_id = NULL WHERE rec_user_id = ?"),
      mine("DELETE FROM item_events WHERE user_id = ?"),
      mine("DELETE FROM books WHERE user_id = ?"),
      mine("DELETE FROM destinations WHERE user_id = ?"),
      mine("DELETE FROM shares WHERE user_id = ?"),
      mine("DELETE FROM suggestions WHERE user_id = ?"),
      mine("DELETE FROM circle WHERE user_id = ?1 OR friend_id = ?1"),
      mine("DELETE FROM friendships WHERE user_id = ?1 OR friend_id = ?1"),
      mine("DELETE FROM friend_requests WHERE from_user = ?"),
      ...forIdentifiers("DELETE FROM friend_requests WHERE to_identifier = ?"),
      ...forIdentifiers("DELETE FROM login_codes WHERE identifier = ?"),
      mine("DELETE FROM sessions WHERE user_id = ?"),
      mine("DELETE FROM photos WHERE user_id = ?"),
      mine("DELETE FROM users WHERE id = ?"),
    ],
    "write",
  );
}
