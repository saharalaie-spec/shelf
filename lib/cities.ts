import "server-only";
import data from "./data/cities.json";
import type { AreaHit } from "./types";

/**
 * The world's cities and towns of 15,000 people or more, built in, so a city can be found the moment it's typed even
 * when the map services are slow or down (they still add smaller places when they answer in time).
 *
 * Data: GeoNames (geonames.org), licensed CC BY 4.0, by way of the all-the-cities package (3.1.0); kept as
 * [name, country code, lat, lon, population, ascii name?], largest first.
 */
type Row = [string, string, number, number, number, string?];
const ROWS = data as Row[];

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

let index: { row: Row; names: string[] }[] | null = null;
const all = () => (index ??= ROWS.map((row) => ({ row, names: [fold(row[0]), ...(row[5] ? [fold(row[5])] : [])] })));

let countries: Intl.DisplayNames | null = null;
const countryName = (code: string) => {
  countries ??= new Intl.DisplayNames(["en"], { type: "region" });
  try {
    return countries.of(code) ?? code;
  } catch {
    return code;
  }
};

/** Cities whose name starts with what was typed (or has a word that does), the exact name and bigger places first. */
export function matchCities(text: string, limit = 4): AreaHit[] {
  const q = fold(text);
  if (q.length < 2) return [];
  const found: { row: Row; s: number }[] = [];
  for (const { row, names } of all()) {
    const s = Math.max(...names.map((n) => (n === q ? 3 : n.startsWith(q) ? 2 : n.split(" ").some((w) => w.startsWith(q)) ? 1 : 0)));
    if (s) found.push({ row, s });
  }
  // Rows are largest first, and the sort is stable: within a match level, bigger places lead.
  return found
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map(({ row: [name, code, lat, lon] }) => ({
      key: `gn:${code}:${fold(name).replace(/ /g, "-")}`,
      name,
      country: countryName(code),
      label: "City",
      lat,
      lon,
      bbox: null,
    }));
}
