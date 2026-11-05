import { after } from "next/server";
import { requireUser } from "@/lib/auth";
import { route } from "@/lib/api";
import { noteJunoShaped } from "@/lib/notices";
import { shapeJuno } from "@/lib/sample-friend";
import { markStarted } from "@/lib/start";

// Shaping Juno asks Claude and checks the catalogs, after the answer is sent.
export const maxDuration = 60;

/** Getting started is done (or skipped): home from now on, and Juno's taste reshaped around what they picked. */
export const POST = route(async () => {
  const user = await requireUser();
  await markStarted(user.id);
  after(async () => {
    try {
      const juno = await shapeJuno(user.id);
      if (juno) await noteJunoShaped(user.id, juno);
    } catch (err) {
      console.warn("Couldn't shape Juno:", (err as Error).message);
    }
  });
  return Response.json({ ok: true });
});
