import { AuthError, verifyLogin } from "@/lib/auth";
import { readJson, route } from "@/lib/api";
import { parseIdentifier } from "@/lib/identifier";

export const POST = route(async (req: Request) => {
  const body = await readJson<{ identifier: string; code: string }>(req);
  const to = parseIdentifier(String(body.identifier ?? ""));
  const code = String(body.code ?? "").replace(/\D/g, "");
  if (!to || code.length !== 6) throw new AuthError("Enter the 6-digit code.");
  const { isNew } = await verifyLogin(to, code);
  return Response.json({ ok: true, isNew });
});
