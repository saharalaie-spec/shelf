import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { User } from "@/lib/auth";

let social: typeof import("@/lib/social");
let table: typeof import("@/lib/table");
let trove: typeof import("@/lib/trove");
let db: typeof import("@/lib/db").db;

const book = (key: string, title: string, extra: Partial<import("@/lib/trove").NewItem> = {}) => ({
  key,
  title,
  author: null,
  year: null,
  coverUrl: null,
  categories: ["Philosophy"],
  status: "read" as const,
  ...extra,
});

let n = 0;
/** A signed-up user, as getCurrentUser would return them. */
async function signUp(contact: { phone?: string; email?: string }, name: string | null = null): Promise<User> {
  const id = `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
  const client = await db();
  await client.execute({
    sql: "INSERT INTO users (id, phone, email, name, created_at) VALUES (?, ?, ?, ?, ?)",
    args: [id, contact.phone ?? null, contact.email ?? null, name, Date.now()],
  });
  return { id, name, phone: contact.phone ?? null, email: contact.email ?? null, handle: null, isPublic: false, shareActivity: true, started: false };
}

beforeAll(async () => {
  process.env.DATABASE_URL = `file:${join(mkdtempSync(join(tmpdir(), "trove-social-")), "test.db")}`;
  social = await import("@/lib/social");
  table = await import("@/lib/table");
  trove = await import("@/lib/trove");
  db = (await import("@/lib/db")).db;
});

describe("private books", () => {
  it("are only listed for their owner", async () => {
    const me = await signUp({ phone: "+14155550101" }, "Ana");
    await trove.addItems(me.id, "book", [book("fx:p1", "Public one"), book("fx:p2", "Diary", { private: true })]);
    expect((await trove.listItems(me.id)).map((b) => b.title)).toEqual(["Public one"]);
    const all = await trove.listItems(me.id, { includePrivate: true });
    expect(all.map((b) => [b.title, b.private])).toEqual(
      expect.arrayContaining([
        ["Public one", false],
        ["Diary", true],
      ]),
    );
  });

  it("never appear in share links, even ones made before the book went private", async () => {
    const me = await signUp({ phone: "+14155550102" }, "Bo");
    const [a] = await trove.addItems(me.id, "book", [book("fx:s1", "Shared"), book("fx:s2", "Secret")]);
    const slug = await trove.getOrCreateShare(me.id, "book", "read", "");
    const secret = (await trove.listItems(me.id)).find((b) => b.title === "Secret")!;
    await trove.updateItem(me.id, secret.id, { private: true });
    expect((await trove.getSharedTrove(slug))!.items.map((b) => b.title)).toEqual([a.title]);
  });

  it("can't be changed by someone else", async () => {
    const owner = await signUp({ phone: "+14155550103" });
    const other = await signUp({ phone: "+14155550104" });
    const [b] = await trove.addItems(owner.id, "book", [book("fx:o1", "Mine")]);
    expect(await trove.updateItem(other.id, b.id, { private: true })).toBeNull();
  });
});

describe("who can see a profile", () => {
  it("is private until made public", async () => {
    const owner = await signUp({ phone: "+14155550110" }, "Cy");
    const stranger = await signUp({ phone: "+14155550111" });
    const person = (await social.findPerson(owner.id))!;
    expect(await social.accessTo(owner.id, person)).toBe("self");
    expect(await social.accessTo(stranger.id, person)).toBe("none");
    expect(await social.accessTo(null, person)).toBe("none");

    await social.updateProfile(owner.id, { isPublic: true });
    const now = (await social.findPerson(owner.id))!;
    expect(await social.accessTo(stranger.id, now)).toBe("public");
    expect(await social.accessTo(null, now)).toBe("public");
  });

  it("lets friends in, and only while they're friends", async () => {
    const owner = await signUp({ phone: "+14155550112" });
    const friend = await signUp({ email: "friend@example.com" });
    const person = (await social.findPerson(owner.id))!;
    await social.acceptInvite(friend, await social.inviteToken(owner.id));
    expect(await social.accessTo(friend.id, person)).toBe("friend");
    await social.unfriend(friend.id, owner.id);
    expect(await social.accessTo(friend.id, person)).toBe("none");
    expect(await social.areFriends(owner.id, friend.id)).toBe(false);
  });
});

describe("profile links", () => {
  it("picks a handle from your name when you go public", async () => {
    const me = await signUp({ phone: "+14155550120" }, "Zoë Ann");
    const saved = await social.updateProfile(me.id, { isPublic: true });
    expect(saved.handle).toBe("zoeann");
    expect((await social.findPerson("ZoeAnn"))!.id).toBe(me.id);

    const twin = await signUp({ phone: "+14155550121" }, "Zoe Ann");
    const theirs = await social.updateProfile(twin.id, { isPublic: true });
    expect(theirs.handle).toMatch(/^zoeann\d+$/);
  });

  it("checks handles", async () => {
    const me = await signUp({ phone: "+14155550122" });
    await expect(social.updateProfile(me.id, { handle: "a" })).rejects.toThrow(/3–20/);
    await expect(social.updateProfile(me.id, { handle: "admin" })).rejects.toThrow(/reserved/);
    await expect(social.updateProfile(me.id, { handle: "zoeann" })).rejects.toThrow(/taken/);
    expect((await social.updateProfile(me.id, { handle: "@Reader.One" })).handle).toBe("reader.one");
    expect((await social.updateProfile(me.id, { handle: null })).handle).toBeNull();
  });
});

describe("friend requests", () => {
  it("answer the same whether or not the number is on Trove", async () => {
    const me = await signUp({ phone: "+14155550130" });
    await signUp({ phone: "+14155550131" });
    expect(await social.requestByIdentifier(me, "+1 415 555 0131")).toEqual({ status: "sent" });
    expect(await social.requestByIdentifier(me, "(415) 555-0199", "US")).toEqual({ status: "sent" });
    expect((await social.outgoingRequests(me.id)).length).toBe(2);
  });

  it("wait for people who haven't joined yet", async () => {
    const me = await signUp({ phone: "+14155550140" }, "Dee");
    await social.requestByIdentifier(me, "Later@Example.com");
    const later = await signUp({ email: "later@example.com" });
    const [req] = await social.incomingRequests(later);
    expect(req.from.name).toBe("Dee");
    expect(req.hint).toBe("+1 ••• 0140");

    await social.respondToRequest(later, req.id, "accept");
    expect(await social.areFriends(me.id, later.id)).toBe(true);
    expect(await social.areFriends(later.id, me.id)).toBe(true);
    expect(await social.incomingRequests(later)).toEqual([]);
    expect(await social.outgoingRequests(me.id)).toEqual([]);
    expect((await social.listFriends(me.id)).map((f) => f.id)).toEqual([later.id]);
  });

  it("make you friends straight away when they'd already asked you", async () => {
    const a = await signUp({ phone: "+14155550150" });
    const b = await signUp({ phone: "+14155550151" });
    expect(await social.requestByIdentifier(a, "+14155550151")).toEqual({ status: "sent" });
    expect(await social.pendingBetween(b, a.id)).toMatchObject({ sentId: null, receivedId: expect.any(String) });
    expect(await social.requestByIdentifier(b, "+14155550150")).toEqual({ status: "friends" });
    expect(await social.areFriends(a.id, b.id)).toBe(true);
    expect(await social.outgoingRequests(a.id)).toEqual([]);
  });

  it("can only be answered by the person asked, and cancelled by the asker", async () => {
    const a = await signUp({ phone: "+14155550160" });
    const b = await signUp({ phone: "+14155550161" });
    const c = await signUp({ phone: "+14155550162" });
    await social.requestByIdentifier(a, "+14155550161");
    const [req] = await social.incomingRequests(b);
    await expect(social.respondToRequest(c, req.id, "accept")).rejects.toThrow(/gone/);
    await expect(social.respondToRequest(b, req.id, "cancel")).rejects.toThrow(/gone/);
    await social.respondToRequest(a, req.id, "cancel");
    expect(await social.incomingRequests(b)).toEqual([]);
    expect(await social.areFriends(a.id, b.id)).toBe(false);
  });

  it("refuse yourself and nonsense", async () => {
    const a = await signUp({ phone: "+14155550170", email: "me@example.com" });
    await expect(social.requestByIdentifier(a, "+14155550170")).rejects.toThrow(/you/);
    await expect(social.requestByIdentifier(a, "ME@example.com")).rejects.toThrow(/you/);
    await expect(social.requestByIdentifier(a, "hello")).rejects.toThrow(/phone number or email/);
    await expect(social.acceptInvite(a, await social.inviteToken(a.id))).rejects.toThrow(/you/);
  });

  it("are limited per day", async () => {
    const a = await signUp({ phone: "+14155550180" });
    for (let i = 0; i < 30; i++) await social.requestByIdentifier(a, `spam${i}@example.com`);
    await expect(social.requestByIdentifier(a, "one-more@example.com")).rejects.toThrow(/tomorrow/);
  });
});

describe("invite links", () => {
  it("are stable per person and dead when unknown", async () => {
    const a = await signUp({ phone: "+14155550190" }, "Eve");
    const token = await social.inviteToken(a.id);
    expect(await social.inviteToken(a.id)).toBe(token);
    expect((await social.findInviter(token))!.name).toBe("Eve");
    expect(await social.findInviter("nope")).toBeNull();
  });

  it("count friends' items per collection without their private ones", async () => {
    const a = await signUp({ phone: "+14155550191" });
    const b = await signUp({ phone: "+14155550192" });
    await trove.addItems(b.id, "book", [
      book("fx:f1", "Open"),
      book("fx:f2", "Hidden", { private: true }),
      book("fx:f3", "Now", { status: "reading", statusAt: Date.now() - 1000 }),
      book("fx:f4", "Secret now", { status: "reading", private: true, statusAt: Date.now() + 1000 }),
    ]);
    await trove.addItems(b.id, "screen", [book("fx:screen:bear", "The Bear", { status: "reading" })]);
    await trove.addItems(b.id, "podcast", [book("fx:pod:daily", "The Daily", { private: true })]);
    await social.acceptInvite(a, await social.inviteToken(b.id));
    const [friend] = await social.listFriends(a.id);
    expect(friend.counts).toEqual({ book: 2, podcast: 0, screen: 1, place: 0 });
    // The most recent thing in progress, whatever the collection.
    expect(friend.now).toEqual({ kind: "screen", title: "The Bear" });
  });
});

describe("recommended by", () => {
  it("remembers which friend a save came from, for the owner's eyes only", async () => {
    const me = await signUp({ phone: "+14155550301" }, "Sahar");
    const bo = await signUp({ phone: "+14155550302" }, "Bo");
    await social.acceptInvite(bo, await social.inviteToken(me.id));
    await trove.addItems(me.id, "book", [book("fx:r1", "Piranesi", { status: "want", recBy: { id: bo.id, name: "Bo" } })]);

    const [mine] = await trove.listItems(me.id, { includePrivate: true });
    expect(mine.recBy).toEqual({ id: bo.id, name: "Bo" });
    // Friends, profiles and share links never learn who recommended what.
    expect((await trove.listItems(me.id))[0].recBy).toBeNull();

    // A friend's new name shows up.
    await social.updateProfile(bo.id, { name: "Bobby" });
    expect((await trove.listItems(me.id, { includePrivate: true }))[0].recBy).toEqual({ id: bo.id, name: "Bobby" });
  });

  it("can be any name you type, which replaces a friend", async () => {
    const me = await signUp({ phone: "+14155550303" }, "Ana");
    const bo = await signUp({ phone: "+14155550304" }, "Bo");
    const [item] = await trove.addItems(me.id, "book", [book("fx:r2", "Stoner", { recBy: { id: bo.id, name: "Bo" } })]);
    expect(await trove.updateItem(me.id, item.id, { recName: "  Mom " })).toMatchObject({ recName: "Mom" });
    expect((await trove.listItems(me.id, { includePrivate: true }))[0].recBy).toEqual({ id: null, name: "Mom" });
    await trove.updateItem(me.id, item.id, { recName: "" });
    expect((await trove.listItems(me.id, { includePrivate: true }))[0].recBy).toBeNull();
  });

  it("counts the picks friends have swapped, leaving out private saves", async () => {
    const a = await signUp({ phone: "+14155550305" }, "Cy");
    const b = await signUp({ phone: "+14155550306" }, "Di");
    await social.acceptInvite(b, await social.inviteToken(a.id));
    await trove.addItems(a.id, "book", [
      book("fx:r3", "One", { recBy: { id: b.id, name: "Di" } }),
      book("fx:r4", "Two", { recBy: { id: b.id, name: "Di" }, private: true }),
    ]);
    await trove.addItems(b.id, "screen", [book("fx:screen:r5", "Three", { recBy: { id: a.id, name: "Cy" } })]);

    const [di] = await social.listFriends(a.id);
    expect(di).toMatchObject({ fromThem: 2, fromMe: 1 });
    const [cy] = await social.listFriends(b.id);
    // Cy's private save of Di's pick isn't Di's business.
    expect(cy).toMatchObject({ fromThem: 1, fromMe: 1 });
  });
});

describe("the Table", () => {
  const befriend = async (a: User, b: User) => social.acceptInvite(b, await social.inviteToken(a.id));
  const titles = (items: { title: string }[]) => items.map((i) => i.title);

  it("groups what friends are into by the thing, and leaves out what they keep to themselves", async () => {
    const me = await signUp({ phone: "+14155550401" }, "Sahar");
    const bo = await signUp({ phone: "+14155550402" }, "Bo");
    const mia = await signUp({ phone: "+14155550403" }, "Mia");
    const stranger = await signUp({ phone: "+14155550404" }, "Zed");
    await befriend(me, bo);
    await befriend(me, mia);
    const now = Date.now();
    await trove.addItems(bo.id, "screen", [
      book("fx:screen:sev", "Severance", { status: "reading", statusAt: now - 1000 }),
      book("fx:screen:secret", "Secret show", { status: "reading", private: true }),
      book("fx:screen:quiet", "Quiet show", { status: "reading" }),
      book("fx:screen:later", "Someday show", { status: "want" }),
    ]);
    const quiet = (await trove.listItems(bo.id, { includePrivate: true })).find((i) => i.title === "Quiet show")!;
    await trove.updateItem(bo.id, quiet.id, { quiet: true });
    // Same show, different catalog key: still one row.
    await trove.addItems(mia.id, "screen", [book("typed:screen:severance", "severance", { status: "reading", statusAt: now - 500 })]);
    await trove.addItems(mia.id, "book", [book("fx:dune", "Dune", { status: "read", statusAt: now - 2000 })]);
    await trove.addItems(stranger.id, "book", [book("fx:z", "Stranger's book", { status: "reading" })]);

    const t = await table.friendsTable(me.id, now);
    expect(t.friendCount).toBe(2);
    expect(titles(t.watching)).toEqual(["Severance"]);
    expect(t.watching[0].friends.map((f) => f.name).sort()).toEqual(["Bo", "Mia"]);
    expect(titles(t.finished)).toEqual(["Dune"]);
    expect(t.reading).toEqual([]);

    // Turning sharing off takes you off everyone's Table.
    // Nor does the "now watching" line in the friends list give a quiet show away.
    expect((await social.listFriends(me.id)).find((f) => f.id === bo.id)?.now).toEqual({ kind: "screen", title: "Severance" });
    await trove.updateItem(bo.id, (await trove.listItems(bo.id)).find((i) => i.title === "Severance")!.id, { quiet: true });
    expect((await social.listFriends(me.id)).find((f) => f.id === bo.id)?.now).toBeNull();

    await social.updateProfile(mia.id, { shareActivity: false });
    const later = await table.friendsTable(me.id, now);
    expect(later.watching).toEqual([]);
    expect(later.finished).toEqual([]);
    expect((await social.listFriends(me.id)).find((f) => f.id === mia.id)?.now).toBeNull();
  });

  it("puts what involves you first, then your circle, then what most friends are into", async () => {
    const me = await signUp({ phone: "+14155550411" }, "Ana");
    const [a, b, c] = await Promise.all(
      ["+14155550412", "+14155550413", "+14155550414"].map((p, i) => signUp({ phone: p }, ["Al", "Bea", "Cy"][i])),
    );
    for (const f of [a, b, c]) await befriend(me, f);
    const now = Date.now();
    // Popular: two friends. Circle: one friend in your circle. Yours: on your own list.
    await trove.addItems(a.id, "book", [book("fx:pop", "Popular", { status: "reading", statusAt: now - 10 })]);
    await trove.addItems(b.id, "book", [book("fx:pop", "Popular", { status: "reading", statusAt: now - 10 })]);
    await trove.addItems(c.id, "book", [
      book("fx:circle", "Circle pick", { status: "reading", statusAt: now - 20 }),
      book("fx:yours", "On your list", { status: "reading", statusAt: now - 30 }),
      book("fx:mypick", "Your pick", { status: "reading", statusAt: now - 40, recBy: { id: me.id, name: "Ana" } }),
    ]);
    await trove.addItems(me.id, "book", [book("fx:yours", "On your list", { status: "want" })]);
    await social.setCircle(me.id, c.id, true);

    const t = await table.friendsTable(me.id, now);
    expect(titles(t.reading)).toEqual(["On your list", "Your pick", "Circle pick", "Popular"]);
    expect(t.reading[0].mine).toBe("want");
    expect(t.reading[1].yourPick).toBe(true);
    expect(t.reading[2].friends[0]).toMatchObject({ name: "Cy", circle: true });
  });

  it("groups friends' spots under the place they're in", async () => {
    const me = await signUp({ phone: "+14155550421" }, "Dee");
    const ana = await signUp({ phone: "+14155550422" }, "Ana");
    await befriend(me, ana);
    const places = await import("@/lib/destinations");
    const lisbon = await places.findOrCreateDestination(ana.id, { name: "Lisbon", country: "Portugal", lat: null, lon: null, bbox: null });
    await trove.addItems(ana.id, "place", [book("fx:spot:a", "Café A", { status: "want" }), book("fx:spot:b", "Bar B", { status: "read" })], {
      destinationId: lisbon.id,
    });
    await places.findOrCreateDestination(me.id, { name: "lisbon", country: null, lat: null, lon: null, bbox: null });
    const t = await table.friendsTable(me.id);
    expect(t.places).toHaveLength(1);
    expect(t.places[0]).toMatchObject({ name: "Lisbon", yours: true, destination: { name: "Lisbon", country: "Portugal" } });
    expect(titles(t.places[0].spots).sort()).toEqual(["Bar B", "Café A"]);
  });
});

describe("your circle", () => {
  it("is for friends only, holds 15, and clears when you unfriend", async () => {
    const me = await signUp({ phone: "+14155550431" }, "Eve");
    const stranger = await signUp({ phone: "+14155550432" });
    await expect(social.setCircle(me.id, stranger.id, true)).rejects.toThrow(/friends/);

    const friends: User[] = [];
    for (let i = 0; i < 16; i++) {
      const f = await signUp({ phone: `+1415555050${String(i).padStart(2, "0")}` }, `F${i}`);
      await social.acceptInvite(f, await social.inviteToken(me.id));
      friends.push(f);
    }
    for (const f of friends.slice(0, 15)) await social.setCircle(me.id, f.id, true);
    await expect(social.setCircle(me.id, friends[15].id, true)).rejects.toThrow(/15/);
    // Re-adding someone already in it is fine.
    expect(await social.setCircle(me.id, friends[0].id, true)).toBe(true);

    const list = await social.listFriends(me.id);
    expect(list.filter((f) => f.inCircle)).toHaveLength(15);
    expect(list[0].inCircle).toBe(true);

    await social.unfriend(me.id, friends[0].id);
    await social.acceptInvite(friends[0], await social.inviteToken(me.id));
    expect((await social.listFriends(me.id)).find((f) => f.id === friends[0].id)?.inCircle).toBe(false);
  });
});

describe("item history", () => {
  it("records every add and section change, and forgets removed items", async () => {
    const me = await signUp({ phone: "+14155550601" }, "Hal");
    const [b] = await trove.addItems(me.id, "book", [book("fx:h1", "History", { status: "want" })]);
    await trove.updateItem(me.id, b.id, { status: "reading" });
    await trove.updateItem(me.id, b.id, { status: "reading", categories: ["X"] }); // no change: no event
    await trove.updateItem(me.id, b.id, { status: "read" });
    const client = await db();
    const events = async () =>
      (await client.execute({ sql: "SELECT status FROM item_events WHERE item_id = ? ORDER BY id", args: [b.id] })).rows.map((r) => r.status);
    expect(await events()).toEqual(["want", "reading", "read"]);
    await trove.removeItem(me.id, b.id);
    expect(await events()).toEqual([]);
  });
});

describe("today", () => {
  it("offers trusted picks, then what's waited longest, then friends', never what you're in the middle of", async () => {
    const today = await import("@/lib/today");
    const me = await signUp({ phone: "+14155550611" }, "Ivy");
    const jo = await signUp({ phone: "+14155550612" }, "Jo");
    await social.acceptInvite(jo, await social.inviteToken(me.id));
    const t0 = Date.now() - 100_000;
    await trove.addItems(me.id, "book", [
      book("fx:t-old", "Old save", { status: "want", addedAt: t0 }),
      book("fx:t-jo", "Jo's pick", { status: "want", addedAt: t0 + 10, recBy: { id: jo.id, name: "Jo" } }),
      book("fx:t-jo-done", "Jo's earlier pick", { status: "read", recBy: { id: jo.id, name: "Jo" } }),
    ]);
    await trove.addItems(me.id, "screen", [book("fx:screen:t-now", "In the middle", { status: "reading" })]);
    await trove.addItems(jo.id, "podcast", [book("fx:pod:t-jo", "Jo's podcast", { status: "reading" })]);

    const c = await today.todayCandidates(me.id);
    expect(c.screen).toEqual([]);
    expect(c.book.map((p) => p.title)).toEqual(["Jo's pick", "Old save"]);
    expect(c.book[0].reason).toEqual({ type: "trusted", from: "Jo", finished: 1 });
    expect(c.book[1].reason).toMatchObject({ type: "waiting" });
    // What a friend is on, that isn't on your lists.
    expect(c.podcast[0]).toMatchObject({ title: "Jo's podcast", tier: "friend", friendId: jo.id, itemId: null });
    expect(c.place).toEqual([]);
  });
});

describe("the sample friend", () => {
  it("is made once, fills your Table, and stays recent", async () => {
    const sample = await import("@/lib/sample-friend");
    const { SAMPLE_FRIEND_ID } = await import("@/lib/sample");
    const me = await signUp({ phone: "+14155550701" }, "Kim");
    const you = await signUp({ phone: "+14155550702" }, "Lee");
    await sample.addSampleFriend(me.id);
    await sample.addSampleFriend(you.id);
    await sample.addSampleFriend(me.id); // again: nothing doubles

    expect((await social.listFriends(me.id)).map((f) => f.name)).toContain("Juno");
    const items = await trove.listItems(SAMPLE_FRIEND_ID, { includePrivate: true });
    expect(new Set(items.map((i) => i.kind))).toEqual(new Set(["book", "podcast", "screen", "place"]));
    expect(items.length).toBe(new Set(items.map((i) => i.key)).size);

    const t = await table.friendsTable(me.id);
    expect(t.reading.map((i) => i.title)).toContain("Piranesi");
    expect(t.watching.map((i) => i.title)).toContain("Severance");
    expect(t.finished.map((i) => i.title)).toContain("Klara and the Sun");
    expect(t.places.map((p) => p.name)).toContain("Lisbon");

    // A month later she's still "on" things right now.
    const client = await db();
    await client.execute({ sql: "UPDATE books SET status_at = status_at - ?, added_at = added_at - ? WHERE user_id = ?", args: [30 * 864e5, 30 * 864e5, SAMPLE_FRIEND_ID] });
    expect((await table.friendsTable(me.id)).finished.map((i) => i.title)).not.toContain("Klara and the Sun");
    await sample.refreshSampleFriendFor(me.id);
    expect((await table.friendsTable(me.id)).finished.map((i) => i.title)).toContain("Klara and the Sun");

    // She can't be signed into, and leaving works like any friend.
    const row = (await client.execute({ sql: "SELECT phone, email FROM users WHERE id = ?", args: [SAMPLE_FRIEND_ID] })).rows[0];
    expect([row.phone, row.email]).toEqual([null, null]);
    await social.unfriend(me.id, SAMPLE_FRIEND_ID);
    expect(await social.areFriends(me.id, SAMPLE_FRIEND_ID)).toBe(false);
  });
});

describe("something else: taste map and suggestions", () => {
  it("reads the whole taste across collections, keeping private things out of what's sent", async () => {
    const { tasteMap } = await import("@/lib/taste");
    const me = await signUp({ phone: "+14155550801" }, "Mo");
    const nia = await signUp({ phone: "+14155550802" }, "Nia");
    await social.acceptInvite(nia, await social.inviteToken(me.id));
    await trove.addItems(me.id, "book", [
      book("fx:k1", "Klara and the Sun", { author: "Kazuo Ishiguro", categories: ["Fiction"], recBy: { id: null, name: "Mom" } }),
      book("fx:k2", "My Diary Book", { private: true }),
    ]);
    await trove.addItems(me.id, "podcast", [book("fx:pod:k3", "SmartLess", { status: "reading" })]);
    await trove.addItems(nia.id, "screen", [book("fx:screen:k4", "Severance", { status: "reading" })]);

    const t = await tasteMap(me.id);
    expect(t.text).toMatch(/Books: read: Klara and the Sun \(Kazuo Ishiguro\)/);
    expect(t.text).toMatch(/Podcasts: .*listening now: SmartLess/);
    expect(t.text).toMatch(/People whose recommendations they finish: Mom \(1\)/);
    expect(t.text).toMatch(/Nia is on Severance/);
    expect(t.text).not.toMatch(/Diary/);
    // Still never suggested back.
    expect(t.saved.book).toContain("My Diary Book");
  });

  it("suggests what isn't on your lists, keeps the day's picks, asks again only when asked, and has a daily limit", async () => {
    const { suggest, DAILY_LIMIT } = await import("@/lib/suggest");
    const me = await signUp({ phone: "+14155550811" }, "Pat");
    await trove.addItems(me.id, "podcast", [book("fx:pod:smartless", "SmartLess", { status: "reading" })]);
    let calls = 0;
    const seen: string[][] = [];
    const ask = async ({ exclude }: { exclude: string[] }) => {
      calls++;
      seen.push(exclude);
      return [
        { title: "SmartLess", creator: "", year: 0, why: "Already yours." },
        { title: `Idea ${calls}`, creator: "Host", year: 0, why: "Because you love SmartLess." },
      ];
    };

    const first = await suggest(me.id, "podcast", "lighter", {}, ask);
    expect(first.picks.map((p) => [p.hit.title, p.why])).toEqual([["Idea 1", "Because you love SmartLess."]]);
    expect(seen[0]).toContain("SmartLess");

    // Same mood, same day: kept, no new call.
    expect((await suggest(me.id, "podcast", "lighter", {}, ask)).picks.map((p) => p.hit.title)).toEqual(["Idea 1"]);
    expect(calls).toBe(1);

    // "Different ideas": asks again, without what you've already been shown.
    const again = await suggest(me.id, "podcast", "lighter", { fresh: true }, ask);
    expect(again.picks.map((p) => p.hit.title)).toEqual(["Idea 2"]);
    expect(seen[1]).toContain("Idea 1");

    // No place yet: nothing to suggest spots for.
    expect(await suggest(me.id, "place", "any", {}, ask)).toEqual({ picks: [], destinationId: null });
    // Movies only: asked for as such, and kept apart from either.
    const formats: unknown[] = [];
    await suggest(me.id, "screen", "short", { format: "movie" }, async (input) => (formats.push(input.format), [{ title: "A film", creator: "", year: 0, why: "x" }]));
    await suggest(me.id, "screen", "short", {}, async (input) => (formats.push(input.format), [{ title: "A show", creator: "", year: 0, why: "x" }]));
    expect(formats).toEqual(["movie", null]);
        // Any city from the map, not one of theirs.
    const anywhere = await suggest(me.id, "place", "date", { place: { name: "Kyoto", country: "Japan", lat: 35, lon: 135.7, bbox: null } }, ask);
    expect(anywhere.destinationId).toBeNull();
    expect(anywhere.picks.length).toBeGreaterThan(0);
    // A place with no spots yet: ideas are for it.
    const { findOrCreateDestination } = await import("@/lib/destinations");
    const lisbon = await findOrCreateDestination(me.id, { name: "Lisbon", country: "Portugal", lat: null, lon: null, bbox: null });
    expect((await suggest(me.id, "place", "any", {}, ask)).destinationId).toBe(lisbon.id);

    const client = await db();
    const day = new Date().toISOString().slice(0, 10);
    for (let i = 0; i < DAILY_LIMIT; i++) {
      await client.execute({
        sql: "INSERT INTO suggestions (user_id, kind, mood, scope, day, items, created_at) VALUES (?, 'book', 'x', '', ?, '[]', 0)",
        args: [me.id, day],
      });
    }
    await expect(suggest(me.id, "screen", "any", {}, ask)).rejects.toThrow(/plenty/);
  });

  it("answers what you describe with three picks, every time you ask", async () => {
    const { suggest } = await import("@/lib/suggest");
    const me = await signUp({ phone: "+14155550812" }, "Rae");
    const wishes: unknown[] = [];
    let calls = 0;
    const ask = async ({ wish }: { wish?: string | null }) => {
      wishes.push(wish);
      calls++;
      return [1, 2, 3, 4, 5].map((i) => ({ title: `Show ${calls}.${i}`, creator: "", year: 0, why: "Funny, and short." }));
    };
    const said = "  something   funny to watch with my parents,\nunder two hours ";
    const first = await suggest(me.id, "screen", "any", { wish: said }, ask);
    expect(first.picks).toHaveLength(3);
    // Tidied, and passed along as their own words.
    expect(wishes[0]).toBe("something funny to watch with my parents, under two hours");
    // The same words again still ask: it's a new request, not the day's picks.
    await suggest(me.id, "screen", "any", { wish: said }, ask);
    expect(calls).toBe(2);
    // And a plain ask afterwards isn't answered with them.
    await suggest(me.id, "screen", "any", {}, ask);
    expect(wishes[2]).toBeNull();
  });
});

describe("getting started", () => {
  it("is for new people only, and done once", async () => {
    const { markStarted } = await import("@/lib/start");
    const me = await signUp({ phone: "+14155550901" }, "Lu");
    const client = await db();
    const startedAt = async () =>
      (await client.execute({ sql: "SELECT started_at FROM users WHERE id = ?", args: [me.id] })).rows[0].started_at;
    expect(await startedAt()).toBeNull();
    await markStarted(me.id);
    const first = await startedAt();
    expect(first).not.toBeNull();
    await markStarted(me.id);
    expect(await startedAt()).toBe(first);
  });

  it("starts from the inviter's trove, with what they picked for new friends on top", async () => {
    const { setStarterPicks, startFrom, starterPicks } = await import("@/lib/start");
    const sam = await signUp({ phone: "+14155550911" }, "Sam");
    const newbie = await signUp({ phone: "+14155550912" }, "Ana");
    const added = await trove.addItems(sam.id, "book", [
      book("fx:s1", "Stoner", { statusAt: 1000 }),
      book("fx:s2", "Middlemarch", { statusAt: 3000 }),
      book("fx:s3", "Gilead", { statusAt: 2000, note: "Read it slowly." }),
      book("fx:s4", "Diary", { private: true }),
      book("fx:s5", "Next up", { status: "want" }),
    ]);
    const id = (title: string) => added.find((i) => i.title === title)!.id;

    // Not friends yet: nothing to start from.
    expect(await startFrom(newbie.id, sam.id)).toBeNull();
    await social.acceptInvite(newbie, await social.inviteToken(sam.id));

    // No picks yet: their favorites lately, the ones with a note first. Never private, never what they only want.
    let from = (await startFrom(newbie.id, sam.id))!;
    expect(from.friend.name).toBe("Sam");
    expect(from.chosen).toBe(false);
    expect(from.picks.map((i) => i.title)).toEqual(["Gilead", "Middlemarch", "Stoner"]);
    expect(from.items.map((i) => i.title)).not.toContain("Diary");

    await expect(setStarterPicks(sam.id, [id("Diary")])).rejects.toThrow(/friends can see/);
    expect(await setStarterPicks(sam.id, [id("Next up"), id("Stoner"), id("Stoner"), id("Gilead"), id("Middlemarch")])).toEqual([
      id("Next up"),
      id("Stoner"),
      id("Gilead"),
    ]);
    expect((await starterPicks(sam.id)).map((i) => i.title)).toEqual(["Next up", "Stoner", "Gilead"]);
    from = (await startFrom(newbie.id, "someone-else"))!;
    // Unknown ref: the friend you made most recently, who here is Sam.
    expect(from.chosen).toBe(true);
    expect(from.items.slice(0, 3).map((i) => i.title)).toEqual(["Next up", "Stoner", "Gilead"]);
    expect(from.items).toHaveLength(4);

    // A pick that's removed drops out.
    await trove.removeItem(sam.id, id("Stoner"));
    expect((await starterPicks(sam.id)).map((i) => i.title)).toEqual(["Next up", "Gilead"]);
  });

  it("deals a deck across collections, without what's on your lists, kept for the day", async () => {
    const { tasteDeck } = await import("@/lib/suggest");
    const me = await signUp({ phone: "+14155550921" }, "Ida");
    await trove.addItems(me.id, "book", [book("fx:d1", "Beloved")]);
    let calls = 0;
    const seen: string[][] = [];
    const ask = async ({ exclude }: { exclude: string[] }) => {
      calls++;
      seen.push(exclude);
      return [
        { kind: "book" as const, title: "Beloved", creator: "Toni Morrison", year: 1987 },
        { kind: "podcast" as const, title: `Pod ${calls}`, creator: "Host", year: 0, about: "  A comedy podcast about nothing much.  " },
        { kind: "screen" as const, title: `Film ${calls}`, creator: "Movie · Someone", year: 2020 },
      ];
    };
    const first = await tasteDeck(me.id, {}, ask);
    expect(first.map((c) => [c.kind, c.hit.title])).toEqual([
      ["podcast", "Pod 1"],
      ["screen", "Film 1"],
    ]);
    expect(seen[0]).toContain("Beloved");
    // What it's about travels with the card, tidied; a card without one just has none.
    expect(first.map((c) => c.about)).toEqual(["A comedy podcast about nothing much.", undefined]);
    // Same day: kept, minus anything added since.
    await trove.addItems(me.id, "podcast", [book("fx:pod:x", "Pod 1")]);
    expect((await tasteDeck(me.id, {}, ask)).map((c) => c.hit.title)).toEqual(["Film 1"]);
    expect(calls).toBe(1);
    // Another round: new ones, never what was dealt before.
    expect((await tasteDeck(me.id, { fresh: true }, ask)).map((c) => c.hit.title)).toEqual(["Pod 2", "Film 2"]);
    expect(seen[1]).toEqual(expect.arrayContaining(["Pod 1", "Film 1"]));
  });
});

describe("closing the loop", () => {
  it("tells the friend who recommended it, once, and they can put it away", async () => {
    const { sendThanks, unseenThanks, markThanksSeen } = await import("@/lib/thanks");
    const me = await signUp({ phone: "+14155550931" }, "Ro");
    const bo = await signUp({ phone: "+14155550932" }, "Bo");
    const stranger = await signUp({ phone: "+14155550933" }, "Zed");
    await social.acceptInvite(bo, await social.inviteToken(me.id));
    const [fromBo, fromMom] = await trove.addItems(me.id, "book", [
      book("fx:t1", "Gilead", { recBy: { id: bo.id, name: "Bo" } }),
      book("fx:t2", "Mom's pick", { recBy: { id: null, name: "Mom" } }),
    ]);
    const [fromZed] = await trove.addItems(me.id, "book", [book("fx:t3", "Zed's pick", { recBy: { id: stranger.id, name: "Zed" } })]);

    expect(await sendThanks(me.id, fromBo.id, "  You were right.  ")).toEqual({ to: "Bo" });
    await sendThanks(me.id, fromBo.id, "Again");
    await expect(sendThanks(me.id, fromMom.id)).rejects.toThrow(/no friend/);
    await expect(sendThanks(me.id, fromZed.id)).rejects.toThrow(/no friend/);
    // Not someone else's item.
    await expect(sendThanks(bo.id, fromBo.id)).rejects.toThrow(/no friend/);

    const notes = await unseenThanks(bo.id);
    expect(notes.map((t) => [t.from.name, t.title, t.message])).toEqual([["Ro", "Gilead", "You were right."]]);
    expect((await trove.listItems(me.id, { includePrivate: true })).find((i) => i.id === fromBo.id)!.thanked).toBe(true);
    // Only the owner learns whether they said thanks.
    expect((await trove.listItems(me.id)).find((i) => i.id === fromBo.id)!.thanked).toBeUndefined();

    await markThanksSeen(stranger.id, [notes[0].id]);
    expect(await unseenThanks(bo.id)).toHaveLength(1);
    await markThanksSeen(bo.id, [notes[0].id]);
    expect(await unseenThanks(bo.id)).toEqual([]);
  });

  it("offers recent recommenders first for who told you", async () => {
    const me = await signUp({ phone: "+14155550941" }, "Ari");
    const ann = await signUp({ phone: "+14155550942" }, "Ann");
    const cal = await signUp({ phone: "+14155550943" }, "Cal");
    await social.acceptInvite(ann, await social.inviteToken(me.id));
    await social.acceptInvite(cal, await social.inviteToken(me.id));
    await trove.addItems(me.id, "book", [
      book("fx:r1", "One", { recBy: { id: cal.id, name: "Cal" }, addedAt: 2000 }),
      book("fx:r2", "Two", { recBy: { id: null, name: "Mom" }, addedAt: 1000 }),
      book("fx:r3", "Three", { recBy: { id: null, name: "Barber" }, addedAt: 3000 }),
    ]);
    const r = await social.recommenders(me.id);
    expect(r.friends.map((f) => f.name)).toEqual(["Cal", "Ann"]);
    expect(r.names).toEqual(["Barber", "Mom"]);
  });
});

describe("deleting an account", () => {
  it("removes everything of theirs, leaves friends' lists intact, and a new sign-in starts fresh", async () => {
    const { deleteAccount } = await import("@/lib/account");
    const { setStarterPicks } = await import("@/lib/start");
    const { sendThanks } = await import("@/lib/thanks");
    const me = await signUp({ phone: "+14155550951" }, "Del");
    const pal = await signUp({ phone: "+14155550952" }, "Pal");
    await social.acceptInvite(pal, await social.inviteToken(me.id));
    await social.setCircle(pal.id, me.id, true);
    const [mine] = await trove.addItems(me.id, "book", [book("fx:del1", "Mine")]);
    await setStarterPicks(me.id, [mine.id]);
    const [fromPal] = await trove.addItems(me.id, "book", [book("fx:del2", "From Pal", { recBy: { id: pal.id, name: "Pal" } })]);
    await sendThanks(me.id, fromPal.id);
    // Pal saved one of mine.
    await trove.addItems(pal.id, "book", [book("fx:del1", "Mine", { recBy: { id: me.id, name: "Del" } })]);
    await social.requestByIdentifier(pal, "+14155550959");

    await deleteAccount(me);

    const client = await db();
    const count = async (sql: string, args: string[]) => Number((await client.execute({ sql, args })).rows[0].n);
    for (const [table, col] of [
      ["users", "id"],
      ["books", "user_id"],
      ["item_events", "user_id"],
      ["starter_picks", "user_id"],
      ["friendships", "friend_id"],
      ["circle", "friend_id"],
      ["thanks", "from_user"],
    ]) {
      expect(await count(`SELECT count(*) AS n FROM ${table} WHERE ${col} = ?`, [me.id]), table).toBe(0);
    }
    expect(await social.listFriends(pal.id)).toEqual([]);
    const palsCopy = (await trove.listItems(pal.id, { includePrivate: true })).find((i) => i.title === "Mine")!;
    expect(palsCopy.recBy).toEqual({ id: null, name: "Del" });
  });
});

describe("friends who know a place", () => {
  it("finds friends' places of the same name or inside yours, with what they share and you don't have", async () => {
    const { friendsIn } = await import("@/lib/friend-places");
    const { findOrCreateDestination } = await import("@/lib/destinations");
    const me = await signUp({ phone: "+14155550961" }, "Mia");
    const bo = await signUp({ phone: "+14155550962" }, "Bo");
    const cy = await signUp({ phone: "+14155550963" }, "Cy");
    const zed = await signUp({ phone: "+14155550964" }, "Zed");
    await social.acceptInvite(bo, await social.inviteToken(me.id));
    await social.acceptInvite(cy, await social.inviteToken(me.id));
    const spot = (key: string, title: string, extra: Partial<import("@/lib/trove").NewItem> = {}) =>
      book(key, title, { categories: ["Food & Drink"], ...extra });

    const myParis = await findOrCreateDestination(me.id, { name: "Paris", country: "France", lat: 48.85, lon: 2.35, bbox: [2.22, 48.81, 2.47, 48.9] });
    const mySpain = await findOrCreateDestination(me.id, { name: "Spain", country: null, lat: 40, lon: -4, bbox: [-18.2, 27.6, 4.3, 43.8] });
    await trove.addItems(me.id, "place", [spot("fx:spot:mine", "Already mine")], { destinationId: myParis.id });

    const boParis = await findOrCreateDestination(bo.id, { name: "París", country: "France", lat: null, lon: null, bbox: null });
    await trove.addItems(bo.id, "place", [
      spot("fx:spot:a", "Le Baratin", { status: "read", note: "Book ahead." }),
      spot("fx:spot:b", "Want-only spot", { status: "want" }),
      spot("fx:spot:mine", "Already mine", { status: "read" }),
      spot("fx:spot:secret", "Secret", { status: "read", private: true }),
    ], { destinationId: boParis.id });
    const cyValencia = await findOrCreateDestination(cy.id, { name: "Valencia", country: "Spain", lat: 39.47, lon: -0.38, bbox: null });
    await trove.addItems(cy.id, "place", [spot("fx:spot:c", "Casa Montaña", { status: "read" })], { destinationId: cyValencia.id });
    // Not a friend.
    const zedParis = await findOrCreateDestination(zed.id, { name: "Paris", country: "France", lat: null, lon: null, bbox: null });
    await trove.addItems(zed.id, "place", [spot("fx:spot:z", "Zed's", { status: "read" })], { destinationId: zedParis.id });

    const paris = await friendsIn(me.id, myParis);
    expect(paris.map((f) => [f.friend.name, f.place.name, f.been, f.spots.map((s) => s.title)])).toEqual([
      ["Bo", "París", 1, ["Le Baratin", "Want-only spot"]],
    ]);
    const spain = await friendsIn(me.id, mySpain);
    expect(spain.map((f) => [f.friend.name, f.place.name])).toEqual([["Cy", "Valencia"]]);
    expect(await friendsIn(zed.id, myParis)).toEqual([]);
  });
});

describe("feedback", () => {
  it("keeps what people say as text, newest first, and forgets who said it when they delete their account", async () => {
    const { saveFeedback, listFeedback } = await import("@/lib/feedback");
    const { deleteAccount } = await import("@/lib/account");
    const me = await signUp({ phone: "+14155550971" }, "Fay");
    await expect(saveFeedback(me, "   ", "/")).rejects.toThrow(/Say or type/);
    await saveFeedback(me, "  The Watch tab should remember Movie.  ", "/");
    await saveFeedback(me, "Love the city search", "/places");
    const [latest, first] = (await listFeedback()).filter((f) => f.contact === "+14155550971");
    expect([latest.text, latest.page, first.text]).toEqual(["Love the city search", "/places", "The Watch tab should remember Movie."]);
    expect(latest.name).toBe("Fay");
    await deleteAccount(me);
    const after = (await listFeedback()).filter((f) => f.text === "Love the city search")[0];
    expect([after.name, after.contact]).toEqual([null, null]);
  });
});
