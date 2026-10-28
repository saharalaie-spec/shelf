/**
 * Trove's "o": the app font's own semibold "o", in navy. Measured from Inter, in thousandths of an em with the glyph's
 * ink box at 0,0, so the drawn mark (app icon, server-drawn images) is the same letter as the one in the wordmark.
 */

const W = 522; // ink width
const H = 564; // ink height, overshoot included
const C = { x: W / 2, y: H / 2 };
// Thicker at the sides than at the top and bottom, like the letter.
const OUTER = { rx: W / 2, ry: H / 2 };
const INNER = { rx: 132, ry: 179 };

const ellipse = (e: { rx: number; ry: number }) =>
  `M${C.x - e.rx} ${C.y} a${e.rx} ${e.ry} 0 1 0 ${2 * e.rx} 0 a${e.rx} ${e.ry} 0 1 0 ${-2 * e.rx} 0Z`;

/** The letter: the outer shape with its counter cut out (fill-rule evenodd). */
export const LOGO_O = ellipse(OUTER) + ellipse(INNER);

/** A square box around it, for icons. */
export const LOGO_SQUARE = `${((W - H) / 2).toFixed(1)} 0 ${H} ${H}`;
