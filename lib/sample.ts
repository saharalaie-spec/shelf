/**
 * Juno, an imaginary friend. Everyone gets their own, whose taste grows from theirs (lib/sample-friend.ts), so Trove
 * has a friend in it before real friends join. Shared by server and client.
 */
export const SAMPLE_FRIEND_NAME = "Juno";
/** The first Juno, shared by everyone who added her before each person had their own. */
export const SAMPLE_FRIEND_ID = "00000000-0000-4000-8000-00000000a11c";
/** Each person's own Juno has an id starting with this, so anything can tell she isn't a real person. */
export const SAMPLE_PREFIX = "a11c0000-0000-4000-8000-";

export const isSampleId = (id: string | null | undefined) => Boolean(id && (id === SAMPLE_FRIEND_ID || id.startsWith(SAMPLE_PREFIX)));
