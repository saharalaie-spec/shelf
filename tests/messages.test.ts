import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

let social: typeof import("@/lib/social");
let messages: typeof import("@/lib/messages");
let db: typeof import("@/lib/db").db;

let n = 0;
async function person(name: string) {
  const id = `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
  const phone = `+1415555${String(1200 + n)}`;
  await (await db()).execute({ sql: "INSERT INTO users (id, phone, name, created_at) VALUES (?, ?, ?, ?)", args: [id, phone, name, Date.now()] });
  return { id, phone, email: null, name, handle: null, isPublic: false, shareActivity: true, started: true, photo: null };
}

beforeAll(async () => {
  process.env.DATABASE_URL = `file:${join(mkdtempSync(join(tmpdir(), "trove-messages-")), "test.db")}`;
  db = (await import("@/lib/db")).db;
  social = await import("@/lib/social");
  messages = await import("@/lib/messages");
});

const severance = { kind: "screen" as const, key: "tmdb:tv:95396", title: "Severance", author: "Apple TV+", coverUrl: null };

describe("messages", () => {
  it("go between friends only, about something or not, and are read when the thread is opened", async () => {
    const ana = await person("Ana");
    const bo = await person("Bo");
    const stranger = await person("Cy");
    await social.acceptInvite(bo, await social.inviteToken(ana.id));

    await expect(messages.sendMessage(ana.id, stranger.id, "Hi")).rejects.toThrow(/friends/);
    await expect(messages.sendMessage(ana.id, bo.id, "   ")).rejects.toThrow(/Write something/);

    await messages.sendMessage(ana.id, bo.id, "Bo, what did you think of Severance?", severance);
    expect(await messages.unreadCount(bo.id)).toBe(1);
    expect(await messages.unreadCount(ana.id)).toBe(0);

    const [conv] = await messages.listConversations(bo.id);
    expect(conv.friend.name).toBe("Ana");
    expect(conv.unread).toBe(1);
    expect(conv.last).toMatchObject({ mine: false, body: "Bo, what did you think of Severance?", item: severance });

    // Opening it reads it.
    const thread = await messages.readThread(bo.id, ana.id);
    expect(thread.map((m) => [m.mine, m.body])).toEqual([[false, "Bo, what did you think of Severance?"]]);
    expect(await messages.unreadCount(bo.id)).toBe(0);

    await messages.sendMessage(bo.id, ana.id, "Loved it. Watch it with the lights off.");
    const back = await messages.readThread(ana.id, bo.id);
    expect(back.map((m) => [m.mine, m.item?.title ?? null])).toEqual([
      [true, "Severance"],
      [false, null],
    ]);
    // Nobody else sees any of it.
    expect(await messages.listConversations(stranger.id)).toEqual([]);
    expect(await messages.readThread(stranger.id, ana.id)).toEqual([]);
  });

  it("from the sample friend: she answers by herself", async () => {
    const { SAMPLE_FRIEND_ID } = await import("@/lib/sample");
    const { addSampleFriend } = await import("@/lib/sample-friend");
    const dee = await person("Dee");
    await addSampleFriend(dee.id);
    await messages.sendMessage(dee.id, SAMPLE_FRIEND_ID, "Juno, how was Lisbon?", { ...severance, kind: "place", title: "Time Out Market" });
    const thread = await messages.readThread(dee.id, SAMPLE_FRIEND_ID);
    expect(thread).toHaveLength(2);
    expect(thread[1]).toMatchObject({ mine: false });
    expect(thread[1].body).toMatch(/Time Out Market.*sample friend/);
    // A thank-you back gets no canned answer.
    await messages.sendMessage(dee.id, SAMPLE_FRIEND_ID, "Thanks!");
    expect(await messages.readThread(dee.id, SAMPLE_FRIEND_ID)).toHaveLength(3);
  });

  it("go when an account is deleted", async () => {
    const { deleteAccount } = await import("@/lib/account");
    const eve = await person("Eve");
    const fay = await person("Fay");
    await social.acceptInvite(fay, await social.inviteToken(eve.id));
    await messages.sendMessage(eve.id, fay.id, "Hi Fay");
    await deleteAccount(eve);
    expect(await messages.listConversations(fay.id)).toEqual([]);
    expect(await messages.unreadCount(fay.id)).toBe(0);
  });
});
