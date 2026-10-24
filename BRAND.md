# Trove brand

## Tagline

> Where curious minds open new worlds for one another.

Use it word for word. It leads the sign-in screen and the app's descriptions (`components/Login.tsx`, `app/layout.tsx`, `app/manifest.ts`).

## Mission

> Our mission is to help people discover through each other — making it easy to share what they love, exchange ideas, and expand their interests and perspective.

## Logo

"trove" in Fraunces, lowercase, with a keyhole for its "o": a trove is a chest you get to open. The keyhole is navy; the rest is ink. The keyhole "o" alone is the mark and the app icon. Drawn by `Wordmark` and `Logo` in `components/ui.tsx`, and by `KeyholeO` in `app/icon.tsx` for server-rendered images.

## Colors

Two brand colors: **Navy** and **Stone**.

| Role | Light | Dark |
|---|---|---|
| Navy, the signature (buttons, links, selected, the keyhole) | `#1E2B47` | `#2E4370` fills, `#9DB0D2` text |
| Stone (logo, accents) | `#A89C88` | `#8A7F6E` |
| Paper (background) | `#F2F0EB` | `#111316` |
| Ink (text) | `#1C1F26` | `#ECEBE5` |

Collections are pale stones, a breath off white, so no two greys sit side by side:

| Collection | Stone | Light | Dark |
|---|---|---|---|
| Books | Sand | `#EBE6DE` | `#2B2925` |
| Podcasts | Straw | `#EEE7D3` | `#2E2A21` |
| Movies & TV | Slate | `#E5E7E9` | `#25282C` |
| Places | Travertine | `#E8E1D5` | `#2D2A24` |

Tokens live in `app/globals.css` (`--accent`, `--link`, `--stone`, `--tint-*`). Navy is the only dark color in light mode; nothing else should be near-black.
