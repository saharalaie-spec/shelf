import type { CountryCode } from "libphonenumber-js/min";
import { AuthError, startLogin } from "@/lib/auth";
import { readJson, route } from "@/lib/api";
import { parseIdentifier } from "@/lib/identifier";

export const POST = route(async (req: Request) => {
  const body = await readJson<{ identifier: string; country: CountryCode }>(req);
  const to = parseIdentifier(String(body.identifier ?? ""), body.country);
  if (!to) throw new AuthError("That doesn’t look like a phone number or email.");
  const { devCode } = await startLogin(to);
  return Response.json({ to, devCode });
});
