import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(<Mark scale={1} />, size);
}

/** Trove's keyhole "o" on stone, for the browser tab and the home screen. */
export function Mark({ scale }: { scale: number }) {
  const s = (n: number) => n * scale;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f2f0eb",
        borderRadius: s(14),
      }}
    >
      <KeyholeO size={s(42)} ring={13} />
    </div>
  );
}

/** The same keyhole "o" the app draws, for images rendered on the server. */
export function KeyholeO({ size, ring = 15 }: { size: number; ring?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <circle cx="50" cy="50" r={50 - ring / 2} fill="none" stroke="#1c1f26" strokeWidth={ring} />
      <circle cx="50" cy="42" r="11.5" fill="#1e2b47" />
      <path d="M43.5 46 L56.5 46 L60.5 71 L39.5 71 Z" fill="#1e2b47" />
    </svg>
  );
}
