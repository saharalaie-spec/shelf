import "server-only";
import { categorizeSpot, placeCategory, type PlaceCategory } from "./place-categories";
import type { Area, AreaHit, BBox, Candidate, Hit, MatchResult, PlaceInfo } from "./types";

// The map: Photon (photon.komoot.io, OpenStreetMap data, free, no key, built for search-as-you-type) for
// destinations and spots. With GOOGLE_PLACES_API_KEY set, spots come from Google Places (New) Text Search
// instead, falling back to Photon if Google fails. Areas always come from Photon.

const TIMEOUT_MS = 7000;
const USER_AGENT = "Trove/0.1 (favorites list prototype)";
const PHOTON = "https://photon.komoot.io/api/";
const GOOGLE_SEARCH = "https://places.googleapis.com/v1/places:searchText";
const GOOGLE_FIELDS =
  "places.id,places.displayName,places.formattedAddress,places.shortFormattedAddress,places.location,places.primaryType,places.primaryTypeDisplayName,places.types";
/** English names where the map has them ("Spain", "Lisbon"); local names otherwise. */
const LANG = "en";

const cache = new Map<string, { at: number; value: unknown }>();
const CACHE_TTL_MS = 60 * 60 * 1000;

/** Keeps a lookup for an hour. Failures, and results from a fallback (`complete: false`), aren't kept. */
async function cached<T>(key: string, run: () => Promise<{ value: T; complete: boolean }>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value as T;
  const { value, complete } = await run();
  if (complete) {
    cache.set(key, { at: Date.now(), value });
    if (cache.size > 2000) cache.delete(cache.keys().next().value!);
  }
  return value;
}

const googleKey = () => process.env.GOOGLE_PLACES_API_KEY?.trim() || null;

/** Google when there's a key, Photon if there isn't or Google fails. */
async function spotSource(google: (apiKey: string) => Promise<Hit[]>, photon: () => Promise<Hit[]>) {
  const apiKey = googleKey();
  if (apiKey) {
    try {
      return { value: await google(apiKey), complete: true };
    } catch (err) {
      console.warn("Google Places failed, trying Photon:", (err as Error).message);
      return { value: await photon(), complete: false };
    }
  }
  return { value: await photon(), complete: true };
}

// ---------- Destinations ----------

/** Cities, regions, islands and countries matching `text`, best first. Throws if Photon can't be reached. */
export async function searchAreas(text: string, limit = 8): Promise<AreaHit[]> {
  const term = text.trim();
  if (!term) return [];
  return cached(JSON.stringify(["areas", term.toLowerCase(), limit]), async () => ({
    value: await photonAreas(term, limit),
    complete: true,
  }));
}

export async function photonAreas(text: string, limit: number): Promise<AreaHit[]> {
  const params = new URLSearchParams({ q: text, limit: String(fetchLimit(limit, 2)), lang: LANG });
  // Photon ORs include filters: anything tagged place=* (city, town, island, state, country…), or an
  // administrative boundary that has no place tag of its own (many municipalities and regions).
  params.append("osm_tag", "place");
  params.append("osm_tag", "boundary:administrative");
  const features = await photon(params);
  return rankAreas(
    features.flatMap((f) => photonArea(f) ?? []),
    text,
    limit,
  );
}

const PLACE_LABELS: Record<string, string> = {
  continent: "Continent",
  country: "Country",
  state: "Region",
  region: "Region",
  province: "Province",
  county: "County",
  municipality: "Municipality",
  district: "District",
  city: "City",
  town: "Town",
  village: "Village",
  hamlet: "Hamlet",
  borough: "Borough",
  suburb: "Neighborhood",
  quarter: "Neighborhood",
  neighbourhood: "Neighborhood",
  island: "Island",
  islet: "Island",
  archipelago: "Islands",
  locality: "Locality",
};
/** Boundaries without a place tag, by Photon's address level. */
const LEVEL_LABELS: Record<string, string> = {
  country: "Country",
  state: "Region",
  county: "County",
  city: "City",
  district: "District",
  locality: "Neighborhood",
};
/** place=* values that are spots or lots, not somewhere to group spots under. */
const NOT_AREAS = new Set(["house", "houses", "plot", "farm", "isolated_dwelling", "square", "allotments", "city_block", "block", "ocean", "sea"]);
const TIERS: Record<string, number> = {
  Country: 10,
  City: 9,
  Continent: 8,
  Region: 7,
  Province: 7,
  Island: 7,
  Islands: 7,
  Town: 6,
  County: 5,
  Municipality: 5,
  Borough: 5,
  District: 4,
  Neighborhood: 4,
  Village: 3,
  Area: 2,
  Locality: 1,
  Hamlet: 1,
};
/** Labels that can be the same place twice (a city's node and its boundary, tagged town and city). */
const KINDRED: Record<string, string> = {
  City: "settlement",
  Town: "settlement",
  Village: "settlement",
  Hamlet: "settlement",
  Municipality: "settlement",
  Region: "region",
  Province: "region",
  County: "region",
  Neighborhood: "hood",
  District: "hood",
  Borough: "hood",
  Island: "island",
  Islands: "island",
};

export type PhotonFeature = {
  geometry?: { coordinates?: number[] };
  properties?: {
    osm_type?: string;
    osm_id?: number;
    osm_key?: string;
    osm_value?: string;
    /** The address level: "house", "street", "locality", "district", "city", "county", "state", "country", "other". */
    type?: string;
    name?: string;
    housenumber?: string;
    street?: string;
    locality?: string;
    district?: string;
    city?: string;
    county?: string;
    state?: string;
    country?: string;
    countrycode?: string;
    postcode?: string;
    /** [minLon, maxLat, maxLon, minLat] */
    extent?: number[];
  };
};

/** Photon's extent is [minLon, maxLat, maxLon, minLat]; a BBox is [west, south, east, north]. */
export function extentToBBox(extent: unknown): BBox | null {
  if (!Array.isArray(extent) || extent.length !== 4 || !extent.every((n) => typeof n === "number" && Number.isFinite(n))) {
    return null;
  }
  const [minLon, maxLat, maxLon, minLat] = extent as number[];
  return [Math.min(minLon, maxLon), Math.min(minLat, maxLat), Math.max(minLon, maxLon), Math.max(minLat, maxLat)];
}

const own = <T>(rec: Record<string, T>, key: string | undefined) => (key && Object.hasOwn(rec, key) ? rec[key] : undefined);

function point(f: PhotonFeature) {
  const [lon, lat] = f.geometry?.coordinates ?? [];
  return typeof lat === "number" && typeof lon === "number" && Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}

export function photonArea(f: PhotonFeature): AreaHit | null {
  const p = f.properties ?? {};
  const at = point(f);
  if (!p.name || !p.osm_type || p.osm_id == null || !at) return null;
  let label: string | null = null;
  if (p.osm_key === "place" && !NOT_AREAS.has(p.osm_value ?? "")) label = own(PLACE_LABELS, p.osm_value) ?? "Area";
  if (p.osm_key === "boundary" && p.osm_value === "administrative") label = own(LEVEL_LABELS, p.type) ?? "Area";
  if (!label) return null;
  return {
    key: `osm:${p.osm_type}${p.osm_id}`,
    name: p.name,
    country: label === "Country" ? null : (p.country ?? null),
    label,
    lat: at.lat,
    lon: at.lon,
    bbox: extentToBBox(p.extent),
  };
}

/**
 * Exact names first, then names starting with the query; within those, countries and cities before regions,
 * towns, villages and hamlets; then the source's own order (Photon's is by prominence). The same place
 * twice (same name, country and kind of place) is kept once, preferring the one with bounds.
 */
export function rankAreas(hits: AreaHit[], text: string, limit: number): AreaHit[] {
  const wanted = norm(text);
  const score = (h: AreaHit, i: number) => {
    const name = norm(h.name);
    const match = wanted && name === wanted ? 100 : wanted && name.startsWith(wanted) ? 40 : 0;
    return match + (own(TIERS, h.label ?? undefined) ?? 2) * 3 - i;
  };
  const ranked = hits
    .map((h, i) => ({ h, i, s: score(h, i) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map(({ h }) => h);
  const out: AreaHit[] = [];
  const seen = new Map<string, number>();
  for (const h of ranked) {
    const kind = own(KINDRED, h.label ?? undefined) ?? h.label;
    const k = JSON.stringify([norm(h.name), norm(h.country ?? ""), kind]);
    const at = seen.get(k);
    if (at === undefined) {
      seen.set(k, out.length);
      out.push(h);
    } else if (!out[at].bbox && h.bbox) {
      out[at] = h;
    }
  }
  return out.slice(0, limit);
}

// ---------- Spots ----------

/** Spots matching `text` inside `area`. Throws if every source failed. */
export async function searchSpots(text: string, area: Area, limit = 8): Promise<Hit[]> {
  const term = text.trim();
  if (!term) return [];
  const key = JSON.stringify(["spots", googleKey() ? "google" : "photon", term.toLowerCase(), areaKey(area), limit]);
  return cached(key, () =>
    spotSource(
      (apiKey) => googleSpots(located(area) ? term : `${term} ${area.name}`, area, limit, apiKey),
      () => photonSpots(term, area, limit),
    ),
  );
}

/**
 * The best-known spots of one category inside `area` ("Museums in Valencia"). `category` is one of
 * PLACE_CATEGORIES or a quick-browse label ("Museums"); anything else is searched for as text.
 */
export async function browseSpots(category: string, area: Area, limit = 12): Promise<Hit[]> {
  const known = placeCategory(category);
  if (!known) return searchSpots(category, area, limit);
  const key = JSON.stringify(["browse", googleKey() ? "google" : "photon", known, areaKey(area), limit]);
  return cached(key, () =>
    spotSource(
      async (apiKey) => {
        const hits = await googleSpots(`${GOOGLE_BROWSE[known]} in ${area.name}`, area, 20, apiKey);
        return hits.filter((h) => !h.categories.length || h.categories.includes(known)).slice(0, limit);
      },
      () => photonBrowse(known, area, limit),
    ),
  );
}

const located = (area: Area) => !!area.bbox || hasPoint(area);
const hasPoint = (area: Area): area is Area & { lat: number; lon: number } =>
  typeof area.lat === "number" && typeof area.lon === "number" && Number.isFinite(area.lat) && Number.isFinite(area.lon);
/** Only what scopes a search: a saved destination's id and dates don't change the results. */
const areaKey = (a: Area) => [norm(a.name), a.country, a.lat, a.lon, a.bbox];
const fetchLimit = (limit: number, factor: number) => Math.min(Math.max(limit * factor, 10), 50);

/** Inside the area's bbox when it has one, else biased toward its position when it has that. */
function photonParams(q: string, area: Area, limit: number) {
  const params = new URLSearchParams({ q, limit: String(limit), lang: LANG });
  if (area.bbox) params.set("bbox", area.bbox.join(","));
  else if (hasPoint(area)) {
    params.set("lat", String(area.lat));
    params.set("lon", String(area.lon));
    params.set("zoom", "12"); // City-sized bias; Photon's default (16) is a few streets.
  }
  return params;
}

export async function photonSpots(text: string, area: Area, limit: number): Promise<Hit[]> {
  // An area the map doesn't know ("Costa Brava", typed by hand) can only scope the search by its name.
  const params = photonParams(located(area) ? text : `${text} ${area.name}`, area, fetchLimit(limit, 3));
  // Destinations aren't spots. Streets are dropped below, after keeping pedestrian ones ("La Rambla").
  params.append("osm_tag", "!place");
  params.append("osm_tag", "!boundary:administrative");
  const features = keepCountry(await photon(params), (f) => f.properties?.country, area, true);
  return rankSpots(
    features.flatMap((f) => photonSpot(f, area) ?? []),
    text,
    limit,
  );
}

/**
 * Photon has no "everything in this box" endpoint: every search needs a `q`. So browsing searches for the
 * area's own name, filtered to the category's OSM tags (Photon ORs them) and limited to the area's bbox.
 * Photon indexes every POI with its address (city, county, state, country), so q=Valencia +
 * osm_tag=tourism:museum + Valencia's bbox matches the museums whose address is in Valencia, in Photon's
 * prominence order (OSM rank and Wikipedia importance), so the well-known ones come first. The bbox keeps
 * out spots elsewhere that merely share the name; with no bbox the name does the scoping, biased toward the
 * area's position when it has one.
 */
export async function photonBrowse(category: PlaceCategory, area: Area, limit: number): Promise<Hit[]> {
  const params = photonParams(area.name, area, fetchLimit(limit, 2));
  for (const tag of PHOTON_BROWSE_TAGS[category]) params.append("osm_tag", tag);
  const features = keepCountry(await photon(params), (f) => f.properties?.country, area, true);
  const hits = features.flatMap((f) => photonSpot(f, area) ?? []).filter((h) => h.categories.includes(category));
  return dedupeSpots(hits).slice(0, limit);
}

/** Photon tag filters per category. Each one maps back to its category through categorizeSpot (tested). */
export const PHOTON_BROWSE_TAGS: Record<PlaceCategory, string[]> = {
  "Food & Drink": ["amenity:restaurant", "amenity:food_court", "amenity:marketplace"],
  "Cafés": ["amenity:cafe", "amenity:ice_cream", "shop:pastry"],
  "Bars & Nightlife": ["amenity:bar", "amenity:pub", "amenity:nightclub", "amenity:biergarten"],
  "Museums & Culture": ["tourism:museum", "tourism:gallery", "amenity:theatre", "amenity:arts_centre"],
  "Sights": ["tourism:attraction", "tourism:viewpoint", "historic"],
  "Beaches & Nature": ["natural:beach", "leisure:park", "leisure:garden", "leisure:nature_reserve"],
  "Shopping": ["shop", "amenity:marketplace"],
  "Stays": ["tourism:hotel", "tourism:hostel", "tourism:guest_house"],
  "Activities": ["tourism:zoo", "tourism:aquarium", "tourism:theme_park", "leisure:water_park", "leisure:stadium"],
};

const GOOGLE_BROWSE: Record<PlaceCategory, string> = {
  "Food & Drink": "restaurants",
  "Cafés": "cafés",
  "Bars & Nightlife": "bars",
  "Museums & Culture": "museums",
  "Sights": "tourist attractions",
  "Beaches & Nature": "beaches and parks",
  "Shopping": "shops",
  "Stays": "hotels",
  "Activities": "things to do",
};

async function photon(params: URLSearchParams): Promise<PhotonFeature[]> {
  const res = await fetch(`${PHOTON}?${params}`, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Photon ${res.status}`);
  const data = (await res.json()) as { features?: PhotonFeature[] };
  return Array.isArray(data.features) ? data.features : [];
}

// Only these values of these keys are spots: national parks, pedestrian streets, waterfalls, grand stations.
const ONLY: Record<string, Set<string>> = {
  boundary: new Set(["national_park", "protected_area"]),
  highway: new Set(["pedestrian"]),
  waterway: new Set(["waterfall"]),
  railway: new Set(["station"]),
};
const NOT_SPOTS = new Set(["place", "landuse", "power", "public_transport", "office", "aeroway", "emergency"]);
const HOMES = new Set(["house", "houses", "residential", "apartments", "detached", "semidetached_house", "terrace", "garage", "garages", "industrial", "construction"]);

function isSpot(key: string, value: string) {
  if (NOT_SPOTS.has(key)) return false;
  const only = own(ONLY, key);
  if (only) return only.has(value);
  if (key === "building") return !HOMES.has(value);
  return true;
}

export function photonSpot(f: PhotonFeature, area?: Area): Hit | null {
  const p = f.properties ?? {};
  const at = point(f);
  const key = p.osm_key;
  const value = p.osm_value || "yes";
  if (!p.name || !p.osm_type || p.osm_id == null || !key || !at || !isSpot(key, value)) return null;
  const town = p.city ?? p.county ?? null;
  const street = [p.street, p.housenumber].filter(Boolean).join(" ");
  return {
    key: `osm:${p.osm_type}${p.osm_id}`,
    title: p.name,
    author: areaLine(p.name, p.locality ?? p.district ?? null, town ?? p.state ?? null, area),
    year: null,
    coverUrl: null,
    categories: categorizeSpot([`${key}:${value}`]),
    place: {
      lat: at.lat,
      lon: at.lon,
      type: spotType(key, value),
      address: street ? [street, town].filter(Boolean).join(", ") : null,
    },
  };
}

/**
 * The short area line under a spot: its neighborhood and town ("El Cabanyal, Valencia"), just the
 * neighborhood when the town is the destination itself ("Ruzafa"), or whichever one is known.
 */
export function areaLine(title: string, hood: string | null, town: string | null, area?: Area): string | null {
  let parts = [hood, town].filter((s): s is string => !!s && norm(s) !== norm(title));
  parts = parts.filter((s, i) => parts.findIndex((t) => norm(t) === norm(s)) === i);
  if (area && parts.length > 1) parts = parts.filter((s) => norm(s) !== norm(area.name));
  return parts.join(", ") || null;
}

const SPOT_TYPES: Record<string, string> = {
  "amenity:restaurant": "Restaurant",
  "amenity:fast_food": "Fast food",
  "amenity:food_court": "Food hall",
  "amenity:cafe": "Café",
  "amenity:ice_cream": "Ice cream",
  "amenity:bar": "Bar",
  "amenity:pub": "Pub",
  "amenity:biergarten": "Beer garden",
  "amenity:nightclub": "Nightclub",
  "amenity:marketplace": "Market",
  "amenity:theatre": "Theatre",
  "amenity:cinema": "Cinema",
  "amenity:arts_centre": "Arts centre",
  "amenity:concert_hall": "Concert hall",
  "amenity:library": "Library",
  "amenity:place_of_worship": "Place of worship",
  "amenity:fountain": "Fountain",
  "amenity:casino": "Casino",
  "amenity:public_bath": "Bathhouse",
  "tourism:museum": "Museum",
  "tourism:gallery": "Gallery",
  "tourism:attraction": "Attraction",
  "tourism:viewpoint": "Viewpoint",
  "tourism:artwork": "Artwork",
  "tourism:hotel": "Hotel",
  "tourism:hostel": "Hostel",
  "tourism:guest_house": "Guesthouse",
  "tourism:motel": "Motel",
  "tourism:apartment": "Apartment",
  "tourism:camp_site": "Campsite",
  "tourism:zoo": "Zoo",
  "tourism:aquarium": "Aquarium",
  "tourism:theme_park": "Theme park",
  "tourism:picnic_site": "Picnic spot",
  "natural:beach": "Beach",
  "natural:peak": "Peak",
  "natural:bay": "Bay",
  "natural:cave_entrance": "Cave",
  "natural:wood": "Woods",
  "natural:cliff": "Cliff",
  "natural:hot_spring": "Hot spring",
  "natural:water": "Lake",
  "leisure:park": "Park",
  "leisure:garden": "Garden",
  "leisure:nature_reserve": "Nature reserve",
  "leisure:beach_resort": "Beach",
  "leisure:water_park": "Water park",
  "leisure:stadium": "Stadium",
  "leisure:marina": "Marina",
  "leisure:sports_centre": "Sports centre",
  "boundary:national_park": "National park",
  "boundary:protected_area": "Nature reserve",
  "historic:castle": "Castle",
  "historic:monument": "Monument",
  "historic:memorial": "Memorial",
  "historic:ruins": "Ruins",
  "historic:archaeological_site": "Archaeological site",
  "historic:city_gate": "City gate",
  "historic:fort": "Fort",
  "historic:monastery": "Monastery",
  "shop:bakery": "Bakery",
  "shop:pastry": "Pastry shop",
  "shop:books": "Bookshop",
  "shop:gift": "Gift shop",
  "shop:wine": "Wine shop",
  "shop:deli": "Deli",
  "shop:clothes": "Clothing store",
  "shop:mall": "Shopping mall",
  "shop:department_store": "Department store",
  "shop:supermarket": "Supermarket",
  "man_made:lighthouse": "Lighthouse",
  "man_made:pier": "Pier",
  "man_made:tower": "Tower",
  "man_made:bridge": "Bridge",
  "highway:pedestrian": "Pedestrian street",
  "waterway:waterfall": "Waterfall",
  "railway:station": "Station",
};

const humanize = (s: string) => {
  const words = s.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** "amenity:cafe" → "Café", "historic:wayside_cross" → "Historic site", "shop:shoes" → "Shop". */
export function spotType(key: string, value: string): string {
  const known = own(SPOT_TYPES, `${key}:${value}`);
  if (known) return known;
  if (key === "historic") return "Historic site";
  if (key === "shop") return "Shop";
  return humanize(value === "yes" ? key : value);
}

// ---------- Google Places ----------

type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  shortFormattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  primaryType?: string;
  primaryTypeDisplayName?: { text?: string };
  types?: string[];
};

/**
 * Places API (New) Text Search. The key goes in a header only; nothing returned carries it. Restricted to
 * the area's bbox when it has one, biased toward its position when it only has that.
 */
export async function googleSpots(textQuery: string, area: Area, limit: number, apiKey: string): Promise<Hit[]> {
  const body: Record<string, unknown> = { textQuery, maxResultCount: Math.min(Math.max(limit, 1), 20), languageCode: LANG };
  if (area.bbox) {
    const [west, south, east, north] = area.bbox;
    body.locationRestriction = {
      rectangle: { low: { latitude: south, longitude: west }, high: { latitude: north, longitude: east } },
    };
  } else if (hasPoint(area)) {
    body.locationBias = { circle: { center: { latitude: area.lat, longitude: area.lon }, radius: 20000 } };
  }
  const res = await fetch(GOOGLE_SEARCH, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": GOOGLE_FIELDS },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Google Places ${res.status}`);
  const data = (await res.json()) as { places?: GooglePlace[] };
  const places = keepCountry(Array.isArray(data.places) ? data.places : [], (p) => lastPart(p.formattedAddress), area, false);
  return dedupeSpots(places.flatMap((p) => googleSpot(p, area) ?? [])).slice(0, limit);
}

function googleSpot(p: GooglePlace, area: Area): Hit | null {
  const title = p.displayName?.text?.trim();
  const lat = p.location?.latitude;
  const lon = p.location?.longitude;
  if (!p.id || !title || typeof lat !== "number" || typeof lon !== "number") return null;
  const types = [...new Set([p.primaryType, ...(p.types ?? [])].filter((t): t is string => !!t))];
  return {
    key: `gplace:${p.id}`,
    title,
    author: googleAreaLine(title, p.shortFormattedAddress, p.formattedAddress, area),
    year: null,
    coverUrl: null,
    categories: categorizeSpot(types),
    place: {
      lat,
      lon,
      type: p.primaryTypeDisplayName?.text || (p.primaryType ? humanize(p.primaryType) : null),
      address: p.shortFormattedAddress || p.formattedAddress || null,
    },
  };
}

const lastPart = (address?: string) => address?.split(",").at(-1)?.trim();

/**
 * Text Search has no address parts, so the area line comes from the address text. The short address is
 * "street, number?, neighborhood?, town" ("Plaça de la Ciutat de Bruges, s/n, Ciutat Vella, València");
 * the full one adds a postcode and the region and ends with the country.
 */
function googleAreaLine(title: string, short: string | undefined, formatted: string | undefined, area: Area) {
  const parts = (address: string, dropCountry: boolean) => {
    let segs = address.split(",");
    if (segs.length > 1) segs = segs.slice(1); // the street
    if (dropCountry && segs.length > 1) segs = segs.slice(0, -1);
    return segs
      .map((s) =>
        s
          .split(/\s+/)
          .filter((w) => !/\d/.test(w) && w.toLowerCase() !== "s/n")
          .join(" ")
          .trim(),
      )
      .filter(Boolean);
  };
  if (short) {
    const segs = parts(short, false);
    return areaLine(title, segs.length > 1 ? segs.at(-2)! : null, segs.at(-1) ?? null, area);
  }
  if (formatted) {
    const segs = parts(formatted, true);
    return areaLine(title, segs.length > 1 ? segs[0] : null, segs.length > 1 ? segs[1] : (segs[0] ?? null), area);
  }
  return null;
}

// ---------- Shared ----------

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ'’]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ") // Keeps other scripts ("明治神宮") searchable.
    .trim()
    .replace(/^(the|a|an) /, "");

/**
 * A country's bounds are coarse (Spain's box holds all of Portugal), so a country keeps only spots in it.
 * `strict` when the source names countries the way the area does (Photon, the fixture); otherwise only
 * when some results match, so a naming mismatch ("USA") never empties the list.
 */
export function keepCountry<T>(items: T[], countryOf: (item: T) => string | null | undefined, area: Area, strict: boolean): T[] {
  if (area.country || !area.bbox) return items;
  const label = (area as Partial<AreaHit>).label;
  if (label && label !== "Country") return items; // A continent: no single country to keep.
  const wanted = norm(area.name);
  const inside = items.filter((item) => norm(countryOf(item) ?? "") === wanted);
  return (strict && label === "Country") || inside.length ? inside : items;
}

const near = (a?: PlaceInfo, b?: PlaceInfo) =>
  !!a && !!b && Math.abs(a.lat - b.lat) < 0.002 && Math.abs(a.lon - b.lon) < 0.002;

/** Drops repeated keys (Photon lists a place once per main tag) and the same name at the same spot (node and building). */
export function dedupeSpots(hits: Hit[]): Hit[] {
  const out: Hit[] = [];
  for (const h of hits) {
    const title = norm(h.title);
    if (out.some((o) => o.key === h.key || (norm(o.title) === title && near(o.place, h.place)))) continue;
    out.push(h);
  }
  return out;
}

/** Exact names first, then names starting with the query, then the source's order. Drops duplicates. */
export function rankSpots(hits: Hit[], text: string, limit: number): Hit[] {
  const wanted = norm(text);
  const tier = (h: Hit) => {
    const title = norm(h.title);
    if (wanted && title === wanted) return 2;
    if (wanted && title.startsWith(wanted)) return 1;
    return 0;
  };
  const ranked = hits
    .map((h, i) => ({ h, i, t: tier(h) }))
    .sort((a, b) => b.t - a.t || a.i - b.i)
    .map(({ h }) => h);
  return dedupeSpots(ranked).slice(0, limit);
}

// ---------- Matching lists ----------

export type SpotSearch = (text: string) => Hit[] | Promise<Hit[]>;

/**
 * Best match plus a few alternatives for each pasted, photographed or imported spot, searched inside `area`,
 * five at a time. A failed lookup gives `match: null`, never an error. `search` defaults to searchSpots;
 * the offline catalog passes its own.
 */
export async function matchSpots(
  items: Candidate[],
  area: Area,
  search: SpotSearch = (text) => searchSpots(text, area, 4),
): Promise<MatchResult[]> {
  return mapLimit(items, 5, async (input) => {
    let hits: Hit[] = [];
    try {
      if (input.author) hits = await search(`${input.title} ${input.author}`);
      // Extra words (a street, a town) can lead the map astray; if so, retry with the name alone.
      if (!hits.some((h) => mentions(h, input.title))) {
        const plain = await search(input.title);
        if (plain.length || !hits.length) hits = plain;
      }
    } catch (err) {
      console.warn("Match failed for", input.title, (err as Error).message);
    }
    // The map's top hit isn't always the named one ("Casa Montaña" vs "Casa Montaña Bar 2").
    const named = hits.filter((h) => mentions(h, input.title));
    hits = [...named, ...hits.filter((h) => !named.includes(h))];
    return { input, match: hits[0] ?? null, alternatives: hits.slice(1) };
  });
}

const squash = (s: string) => norm(s).replace(/ /g, "");
/** Whether a map result is the place named ("Casa Montaña" in "Casa Montaña Bar"), not just something nearby. */
export function mentions(hit: Hit, title: string) {
  const a = squash(hit.title);
  const b = squash(title);
  return b.length > 0 && (a.includes(b) || (a.length >= 4 && b.includes(a)));
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}
