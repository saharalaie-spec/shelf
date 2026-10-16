import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Trove",
    short_name: "Trove",
    description: "Every book you've read, in one place.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f1e8",
    theme_color: "#f6f1e8",
    icons: [{ src: "/apple-icon", sizes: "180x180", type: "image/png" }],
  };
}
