import { ImageResponse } from "next/og";
import { troveCount, troveTitle } from "@/lib/kinds";
import { getSharedTrove } from "@/lib/trove";

export const alt = "A shared list on Trove";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const PALETTE = ["#4c5342", "#9e6148", "#2f3329", "#6e5646", "#5e6a51", "#8a7255"];

/** Inline covers as data URLs; a cover that's slow or missing just becomes a typeset one. */
async function inline(url: string | null) {
  if (!url) return null;
  try {
    const res = await fetch(url.replace("-M.jpg", "-L.jpg"), { signal: AbortSignal.timeout(2500) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1000) return null;
    return `data:${res.headers.get("content-type") ?? "image/jpeg"};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const shared = await getSharedTrove(slug);
  const books = shared?.items.slice(0, 5) ?? [];
  const covers = await Promise.all(books.map((b) => inline(b.coverUrl)));
  const title = shared ? troveTitle(shared.ownerName, shared.category, shared.status, shared.kind) : "Trove";
  const mid = (books.length - 1) / 2;
  // Podcast art and spots are square; books and posters are 2:3.
  const square = shared?.kind === "podcast" || shared?.kind === "place";
  const w = square ? 170 : 136;
  const h = square ? 170 : 204;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#f3f1ec", padding: 72, color: "#23261f" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 500, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 30, fontWeight: 600 }}>
            <div style={{ display: "flex", gap: 4, alignItems: "flex-end" }}>
              <div style={{ width: 10, height: 34, background: "#4c5342", borderRadius: 2 }} />
              <div style={{ width: 10, height: 40, background: "#a5654a", borderRadius: 2 }} />
              <div style={{ width: 10, height: 32, background: "#4a4d44", borderRadius: 2 }} />
            </div>
            Trove
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 64, lineHeight: 1.05, fontWeight: 600, letterSpacing: -1.5 }}>{title}</div>
            <div style={{ fontSize: 32, color: "#7c7d74", marginTop: 20 }}>
              {troveCount(shared?.items.length ?? 0, shared?.status ?? "read", shared?.kind ?? "book")}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", paddingLeft: 24 }}>
          {books.map((b, i) => (
            <div
              key={b.id}
              style={{
                display: "flex",
                width: w,
                height: h,
                flexShrink: 0,
                marginLeft: i === 0 ? 0 : -34,
                transform: `rotate(${(i - mid) * 6}deg) translateY(${Math.abs(i - mid) * 14}px)`,
                borderRadius: 8,
                overflow: "hidden",
                boxShadow: "0 18px 40px -12px rgba(28,22,14,0.45)",
                background: PALETTE[i % PALETTE.length],
              }}
            >
              {covers[i] ? (
                <img src={covers[i]!} width={w} height={h} style={{ objectFit: "cover" }} alt="" />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: 14, color: "#f5f2ec" }}>
                  <div style={{ fontSize: 19, lineHeight: 1.1, fontWeight: 600 }}>{b.title.slice(0, 48)}</div>
                  <div style={{ fontSize: 11, marginTop: 8, opacity: 0.75, textTransform: "uppercase" }}>{(b.author ?? "").slice(0, 30)}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
