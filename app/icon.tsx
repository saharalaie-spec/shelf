import { ImageResponse } from "next/og";
import { LOGO_O, LOGO_SQUARE } from "@/lib/logo";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(<Mark scale={1} />, size);
}

/** Trove's navy "o" on stone, for the browser tab and the home screen. */
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
      <NavyO size={s(36)} />
    </div>
  );
}

/** The same "o" the app draws (lib/logo.ts), for images rendered on the server. */
export function NavyO({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox={LOGO_SQUARE}>
      <ellipse cx={LOGO_O.cx} cy={LOGO_O.cy} rx={LOGO_O.rx} ry={LOGO_O.ry} fill="#1e2b47" />
    </svg>
  );
}
