import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(<Mark scale={1} />, size);
}

export function Mark({ scale }: { scale: number }) {
  const s = (n: number) => n * scale;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        gap: s(4),
        paddingBottom: s(12),
        background: "#f6f1e8",
        borderRadius: s(14),
      }}
    >
      <div style={{ width: s(11), height: s(36), background: "#1d1a16", borderRadius: s(2) }} />
      <div style={{ width: s(11), height: s(42), background: "#b5532c", borderRadius: s(2) }} />
      <div style={{ width: s(11), height: s(33), background: "#4a453e", borderRadius: s(2), transform: `rotate(12deg) translateX(${s(3)}px)` }} />
    </div>
  );
}
