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
  return { id, name, phone: contact.phone ?? null, email: contact.email ?? null, handle: null, isPublic: false, shareActivity: true };
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
  it("offers what you're in the middle of, then trusted picks, then what's waited longest, then a friend's", async () => {
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
    expect(c.screen[0]).toMatchObject({ title: "In the middle", tier: "keep" });
    expect(c.book.map((p) => p.title)).toEqual(["Jo's pick", "Old save"]);
    expect(c.book[0].reason).toEqual({ type: "trusted", from: "Jo", finished: 1 });
    expect(c.book[1].reason).toMatchObject({ type: "waiting" });
    // Nothing of your own to listen to: what a friend is on.
    expect(c.podcast[0]).toMatchObject({ title: "Jo's podcast", tier: "friend", friendId: jo.id, itemId: null });
    expect(c.place).toEqual([]);
  });
});
