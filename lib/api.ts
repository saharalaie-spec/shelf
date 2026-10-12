import "server-only";
import { AuthError } from "./auth";
import { SetupError } from "./db";

/** Wraps a route handler so thrown errors become `{ error }` JSON with a sensible status. */
export function route<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof AuthError) return Response.json({ error: err.message }, { status: err.status });
      if (err instanceof SetupError) return Response.json({ error: err.message }, { status: 503 });
      console.error(err);
      return Response.json({ error: "Something went wrong. Try again?" }, { status: 500 });
    }
  };
}

export async function readJson<T>(req: Request): Promise<Partial<T>> {
  try {
    return (await req.json()) as Partial<T>;
  } catch {
    return {};
  }
}

/** The public base URL for links we hand out: APP_URL if set, else whatever host the request came in on. */
export const origin = (req: Request) => process.env.APP_URL?.replace(/\/$/, "") ?? new URL(req.url).origin;
