/**
 * Trove's "o": the outline of the app font's own semibold "o", filled solid navy. Measured from Inter, in thousandths
 * of an em with the glyph's ink box at 0,0, so it sits in the wordmark exactly where the letter would, and the app icon
 * is the same shape.
 */

const W = 522; // ink width
const H = 564; // ink height, overshoot included

/** The letter's outer shape, solid. */
export const LOGO_O = { cx: W / 2, cy: H / 2, rx: W / 2, ry: H / 2 };

/** Its box. */
export const LOGO_BOX = `0 0 ${W} ${H}`;

/** A square box around it, for icons. */
export const LOGO_SQUARE = `${((W - H) / 2).toFixed(1)} 0 ${H} ${H}`;

/** Where the letter sits in a line of text, in em: side bearings, size, and how far it dips under the baseline. */
export const LOGO_IN_TEXT = { left: 0.027, right: 0.016, width: W / 1000, height: H / 1000, dip: 0.01 };
