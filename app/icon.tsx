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
        background: "#f3f1ec",
        borderRadius: s(14),
      }}
    >
      <div style={{ width: s(11), height: s(36), background: "#4c5342", borderRadius: s(2) }} />
      <div style={{ width: s(11), height: s(42), background: "#a5654a", borderRadius: s(2) }} />
      <div style={{ width: s(11), height: s(33), background: "#4a4d44", borderRadius: s(2), transform: `rotate(12deg) translateX(${s(3)}px)` }} />
    </div>
  );
}
