import type { AreaHit } from "./types";

/**
 * Every country, built in, so one can always be found to group spots under, even when the map services are slow or
 * down. Names come from the runtime's own country names, in English.
 */
const CODES =
  "AD AE AF AG AL AM AO AR AT AU AZ BA BB BD BE BF BG BH BI BJ BN BO BR BS BT BW BY BZ CA CD CF CG CH CI CL CM CN CO CR CU CV CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FM FR GA GB GD GE GH GM GN GQ GR GT GW GY HK HN HR HT HU ID IE IL IN IQ IR IS IT JM JO JP KE KG KH KI KM KN KP KR KW KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MG MH MK ML MM MN MO MR MT MU MV MW MX MY MZ NA NE NG NI NL NO NP NR NZ OM PA PE PG PH PK PL PR PS PT PW PY QA RO RS RU RW SA SB SC SD SE SG SI SK SL SM SN SO SR SS ST SV SY SZ TD TG TH TJ TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VN VU WS XK YE ZA ZM ZW".split(
    " ",
  );

/** Other names people type for a few of them. */
const ALSO: Record<string, string[]> = {
  US: ["USA", "America", "United States of America"],
  GB: ["UK", "England", "Scotland", "Wales", "Britain", "Great Britain"],
  AE: ["UAE", "Emirates"],
  KR: ["Korea"],
  CZ: ["Czech Republic"],
  NL: ["Holland"],
  CI: ["Ivory Coast"],
  MM: ["Burma"],
  TR: ["Turkey"],
};

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

let names: { code: string; name: string; also: string[] }[] | null = null;
function all() {
  if (names) return names;
  const display = new Intl.DisplayNames(["en"], { type: "region" });
  names = CODES.map((code) => ({ code, name: display.of(code) ?? code, also: ALSO[code] ?? [] }));
  return names;
}

/** Countries whose name (or a common other name) starts with, or has a word starting with, what was typed. */
export function matchCountries(text: string, limit = 3): AreaHit[] {
  const q = fold(text);
  if (q.length < 2) return [];
  const starts = (s: string) => {
    const f = fold(s);
    return f.startsWith(q) ? 2 : f.split(" ").some((w) => w.startsWith(q)) ? 1 : 0;
  };
  return all()
    .map((c) => ({ c, s: Math.max(starts(c.name), ...c.also.map(starts)) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.c.name.localeCompare(b.c.name))
    .slice(0, limit)
    .map(({ c }) => ({ key: `country:${c.code}`, name: c.name, country: null, label: "Country", lat: null, lon: null, bbox: null }));
}
