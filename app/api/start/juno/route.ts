import { requireUser } from "@/lib/auth";
import { route } from "@/lib/api";
import { junoOf, shapeJuno } from "@/lib/sample-friend";
import { startFrom } from "@/lib/start";

// Shaping Juno asks Claude and checks the catalogs.
export const maxDuration = 60;

/**
 * Getting started, after their favorites and the deck: Juno, shaped around them (once), with her trove to pick from.
 * `from` is null if they have no Juno (removed her).
 */
export const POST = route(async () => {
  const user = await requireUser();
  await shapeJuno(user.id).catch((err) => console.warn("Couldn't shape Juno:", (err as Error).message));
  const juno = await junoOf(user.id);
  return Response.json({ from: juno ? await startFrom(user.id, juno) : null });
});
