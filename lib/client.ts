/** Small fetch wrapper for our JSON API. Throws with the server's friendly message. */
export async function api<T>(path: string, init?: { method?: string; body?: unknown; signal?: AbortSignal }): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? (init?.body ? "POST" : "GET"),
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
    signal: init?.signal,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && typeof window !== "undefined") window.location.reload();
  if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
  return data as T;
}

export const possessive = (name: string) => (/s$/i.test(name) ? `${name}’` : `${name}’s`);

export function shelfTitle(name: string | null, category: string | null) {
  const owner = name ? possessive(name) : "A";
  return `${owner} ${category ? `${category} ` : ""}shelf`;
}

export const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;
