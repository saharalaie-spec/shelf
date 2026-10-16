import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { browseCatalog, matchCandidates, searchAreasCatalog, searchCatalog } from "@/lib/catalog";
import { categorizeSpot, PLACE_CATEGORIES, placeCategory, SPOT_BROWSE } from "@/lib/place-categories";
import { browseSpots, extentToBBox, matchSpots, PHOTON_BROWSE_TAGS, searchAreas, searchSpots } from "@/lib/places";
import type { Area, AreaHit } from "@/lib/types";

const titles = (hits: { title: string }[]) => hits.map((h) => h.title);

async function area(text: string, country?: string): Promise<AreaHit> {
  const hits = await searchAreasCatalog(text, 8);
  const hit = hits.find((h) => !country || h.country === country);
  if (!hit) throw new Error(`No fixture area for ${text}`);
  return hit;
}

// ---------- Offline map (BOOKS_PROVIDER=fixture) ----------

describe("searchAreasCatalog (offline map)", () => {
  it("finds the Spanish Valencia first, the Venezuelan one too, and the region after both", async () => {
    const hits = await searchAreasCatalog("valencia", 8);
    expect(hits.map((h) => [h.name, h.country, h.label])).toEqual([
      ["Valencia", "Spain", "City"],
      ["Valencia", "Venezuela", "City"],
      ["Valencian Community", "Spain", "Region"],
    ]);
    expect(hits[0]).toMatchObject({ key: "fx:area:valencia-spain", lat: 39.4697065, lon: -0.3763353 });
    expect(hits[0].bbox).toEqual([-0.4325512, 39.2784496, -0.272574, 39.5666828]);
    expect(hits[1].key).toBe("fx:area:valencia-venezuela");
  });

  it("knows countries, with bounds and no country of their own", async () => {
    const [spain] = await searchAreasCatalog("spain", 8);
    expect(spain).toMatchObject({ key: "fx:area:spain", name: "Spain", country: null, label: "Country" });
    const [west, south, east, north] = spain.bbox!;
    expect(west).toBeLessThan(east);
    expect(south).toBeLessThan(north);
    expect(spain.lat).toBeGreaterThan(south);
    expect(spain.lat).toBeLessThan(north);
  });

  it("narrows by country and understands local names", async () => {
    expect((await searchAreasCatalog("valencia spain", 8)).map((h) => [h.name, h.country])).toEqual([
      ["Valencia", "Spain"],
      ["Valencian Community", "Spain"],
    ]);
    expect((await searchAreasCatalog("lisboa", 8))[0]).toMatchObject({ name: "Lisbon", country: "Portugal" });
    expect((await searchAreasCatalog("españa", 8))[0].name).toBe("Spain");
    expect(await searchAreasCatalog("  ", 8)).toEqual([]);
  });
});

describe("spots (offline map)", () => {
  it("searches inside the area's bounds", async () => {
    const valencia = await area("valencia", "Spain");
    const hits = await searchCatalog("place", "mercado", 8, valencia);
    expect(titles(hits)).toEqual(["Mercado Central"]);
    expect(hits[0]).toEqual({
      key: "fx:spot:mercado-central",
      title: "Mercado Central",
      author: "El Mercat",
      year: null,
      coverUrl: null,
      categories: ["Food & Drink", "Shopping"],
      place: { lat: 39.47372, lon: -0.37877, type: "Market", address: "Plaça de la Ciutat de Bruges, Valencia" },
    });
    const [west, south, east, north] = valencia.bbox!;
    for (const h of await searchCatalog("place", "a", 8, valencia)) {
      expect(h.place!.lon).toBeGreaterThanOrEqual(west);
      expect(h.place!.lon).toBeLessThanOrEqual(east);
      expect(h.place!.lat).toBeGreaterThanOrEqual(south);
      expect(h.place!.lat).toBeLessThanOrEqual(north);
    }
  });

  it("finds Madrid's market in Spain, naming the town too, but nothing from Portugal inside Spain's box", async () => {
    const spain = await area("spain");
    const hits = await searchCatalog("place", "mercado", 8, spain);
    expect(titles(hits)).toEqual(expect.arrayContaining(["Mercado Central", "Mercado de San Miguel"]));
    expect(hits.find((h) => h.title === "Mercado Central")?.author).toBe("El Mercat, Valencia");
    // Spain's bounds hold all of Portugal; the country itself doesn't.
    expect(titles(await searchCatalog("place", "torre", 8, spain))).toEqual(["Torres de Serranos"]);
    expect(titles(await searchCatalog("place", "torre", 8, await area("lisbon")))).toEqual(["Torre de Belém"]);
  });

  it("matches accents, neighborhoods and types", async () => {
    const valencia = await area("valencia", "Spain");
    expect(titles(await searchCatalog("place", "horchateria", 8, valencia))).toEqual(["Horchatería Santa Catalina"]);
    expect(titles(await searchCatalog("place", "ruzafa", 8, valencia))).toEqual(["Bar Ricardo"]);
    expect(titles(await searchCatalog("place", "beach", 8, valencia))).toEqual(["Playa de la Malvarrosa"]);
    expect(await searchCatalog("place", "golden gai", 8, valencia)).toEqual([]);
    const [gai] = await searchCatalog("place", "golden gai", 8, await area("tokyo"));
    expect(gai).toMatchObject({ key: "fx:spot:golden-gai", author: "Shinjuku", categories: ["Bars & Nightlife"] });
  });

  it("scopes a destination the map didn't know by its name or position", async () => {
    const typed: Area = { name: "Lisboa", country: null, lat: null, lon: null, bbox: null };
    expect(titles(await searchCatalog("place", "pasteis", 8, typed))).toEqual(["Pastéis de Belém"]);
    const near: Area = { name: "My Tokyo trip", country: null, lat: 35.68, lon: 139.76, bbox: null };
    expect(titles(await searchCatalog("place", "meiji", 8, near))).toEqual(["Meiji Jingu"]);
    const elsewhere: Area = { name: "Lisboa", country: "Spain", lat: null, lon: null, bbox: null };
    expect(await searchCatalog("place", "pasteis", 8, elsewhere)).toEqual([]);
  });

  it("needs an area", async () => {
    await expect(searchCatalog("place", "mercado")).rejects.toThrow(/destination/);
    await expect(matchCandidates("place", [{ title: "Mercado Central" }])).rejects.toThrow(/destination/);
  });

  it("browses one category", async () => {
    const valencia = await area("valencia", "Spain");
    const beaches = await browseCatalog("Beaches & Nature", valencia, 12);
    expect(titles(beaches)).toEqual(expect.arrayContaining(["Playa de la Malvarrosa", "Jardín del Turia"]));
    for (const h of beaches) expect(h.categories).toContain("Beaches & Nature");
    expect(titles(await browseCatalog("museums", await area("madrid"), 12))).toEqual(["Museo del Prado", "Museo Reina Sofía"]);
    // France's box takes in Barcelona; the Picasso museum isn't French.
    expect(titles(await browseCatalog("Museums & Culture", await area("france"), 12))).toEqual(["Musée du Louvre", "Musée d'Orsay"]);
    expect(await browseCatalog("Stays", valencia, 12)).toEqual([]);
    // A category of the user's own is searched as text.
    expect(titles(await browseCatalog("Horchatería", valencia, 12))).toEqual(["Horchatería Santa Catalina"]);
  });

  it("matches pasted lists inside the area, keeping notes", async () => {
    const valencia = await area("valencia", "Spain");
    const results = await matchCandidates(
      "place",
      [
        { title: "Mercado Central" },
        { title: "casa montana", author: "El Cabanyal" },
        { title: "zzz not a place" },
        { title: "Bar Ricardo", note: "order the esgarraet" },
        { title: "Mercado de San Miguel" },
        { title: "Torres de Serranos", author: "Some Street 1" },
      ],
      valencia,
    );
    expect(results.map((r) => r.match?.title ?? null)).toEqual([
      "Mercado Central",
      "Casa Montaña",
      null,
      "Bar Ricardo",
      null,
      "Torres de Serranos",
    ]);
    expect(results[1].match?.place?.type).toBe("Restaurant");
    expect(results[2]).toEqual({ input: { title: "zzz not a place" }, match: null, alternatives: [] });
    expect(results[3].input.note).toBe("order the esgarraet");
  });

  it("puts the named spot first and turns a failed lookup into match: null", async () => {
    const valencia = await area("valencia", "Spain");
    const hits = await searchCatalog("place", "mercado", 8, valencia);
    const other = { ...hits[0], key: "x:1", title: "Mercado Central Bar Two" };
    const [r] = await matchSpots([{ title: "Mercado Central" }], valencia, () => [other, ...hits].reverse());
    expect(r.match?.key).toBe("fx:spot:mercado-central");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const [failed] = await matchSpots([{ title: "Anything" }], valencia, () => {
      throw new Error("map down");
    });
    expect(failed).toEqual({ input: { title: "Anything" }, match: null, alternatives: [] });
    vi.restoreAllMocks();
  });
});

// ---------- Categories ----------

describe("categorizeSpot", () => {
  it("maps OSM tags", () => {
    expect(categorizeSpot(["amenity:restaurant"])).toEqual(["Food & Drink"]);
    expect(categorizeSpot(["amenity:marketplace"])).toEqual(["Food & Drink", "Shopping"]);
    expect(categorizeSpot(["amenity:cafe"])).toEqual(["Cafés"]);
    expect(categorizeSpot(["shop:bakery"])).toEqual(["Cafés"]);
    expect(categorizeSpot(["shop:books"])).toEqual(["Shopping"]);
    expect(categorizeSpot(["amenity:pub"])).toEqual(["Bars & Nightlife"]);
    expect(categorizeSpot(["tourism:museum"])).toEqual(["Museums & Culture"]);
    expect(categorizeSpot(["tourism:viewpoint"])).toEqual(["Sights"]);
    expect(categorizeSpot(["historic:castle"])).toEqual(["Sights"]);
    expect(categorizeSpot(["natural:beach"])).toEqual(["Beaches & Nature"]);
    expect(categorizeSpot(["leisure:park"])).toEqual(["Beaches & Nature"]);
    expect(categorizeSpot(["boundary:national_park"])).toEqual(["Beaches & Nature"]);
    expect(categorizeSpot(["tourism:hotel"])).toEqual(["Stays"]);
    expect(categorizeSpot(["tourism:zoo"])).toEqual(["Activities"]);
    expect(categorizeSpot(["Natural=Beach"])).toEqual(["Beaches & Nature"]);
    expect(categorizeSpot(["amenity:bank"])).toEqual([]);
  });

  it("maps Google types, most important first, skipping generic ones", () => {
    expect(categorizeSpot(["restaurant", "food", "point_of_interest", "establishment"])).toEqual(["Food & Drink"]);
    expect(categorizeSpot(["spanish_restaurant", "restaurant", "food"])).toEqual(["Food & Drink"]);
    expect(categorizeSpot(["cafe", "food", "store"])).toEqual(["Cafés"]);
    expect(categorizeSpot(["bar", "restaurant", "food"])).toEqual(["Bars & Nightlife", "Food & Drink"]);
    expect(categorizeSpot(["wine_bar", "bar"])).toEqual(["Bars & Nightlife"]);
    expect(categorizeSpot(["museum", "tourist_attraction"])).toEqual(["Museums & Culture", "Sights"]);
    expect(categorizeSpot(["beach", "natural_feature"])).toEqual(["Beaches & Nature"]);
    expect(categorizeSpot(["lodging", "hotel"])).toEqual(["Stays"]);
    expect(categorizeSpot(["book_store", "store"])).toEqual(["Shopping"]);
    expect(categorizeSpot(["amusement_park"])).toEqual(["Activities"]);
    expect(categorizeSpot(["food", "point_of_interest"])).toEqual(["Food & Drink"]);
    expect(categorizeSpot(["point_of_interest", "establishment"])).toEqual([]);
  });

  it("keeps at most two, all from the list users pick from", () => {
    const many = categorizeSpot(["bar", "restaurant", "museum", "beach", "hotel"]);
    expect(many).toHaveLength(2);
    for (const c of many) expect(PLACE_CATEGORIES).toContain(c);
  });

  it("browses with tags and labels that map back to their own category", () => {
    for (const [category, tags] of Object.entries(PHOTON_BROWSE_TAGS)) {
      for (const tag of tags) expect(categorizeSpot([tag.includes(":") ? tag : `${tag}:yes`])).toContain(category);
    }
    for (const b of SPOT_BROWSE) {
      expect(PLACE_CATEGORIES).toContain(b.category);
      expect(placeCategory(b.label)).toBe(b.category);
    }
    expect(placeCategory("beaches & nature")).toBe("Beaches & Nature");
    expect(placeCategory("Tapas")).toBeNull();
  });
});

// ---------- Live sources, with fetch stubbed ----------

const VALENCIA: Area = {
  name: "Valencia",
  country: "Spain",
  lat: 39.4697065,
  lon: -0.3763353,
  bbox: [-0.4325512, 39.2784496, -0.272574, 39.5666828],
};

const feature = (coordinates: [number, number], properties: Record<string, unknown>) => ({
  type: "Feature",
  geometry: { type: "Point", coordinates },
  properties,
});

const PHOTON_VALENCIA_AREAS = {
  type: "FeatureCollection",
  features: [
    // Photon often has a city twice: its place node and its boundary.
    feature([-0.3763353, 39.4697065], {
      osm_type: "N", osm_id: 26025216, osm_key: "place", osm_value: "city", type: "city",
      name: "Valencia", country: "Spain", countrycode: "ES", state: "Valencian Community", county: "Valencia",
    }),
    feature([-0.3547, 39.4228], {
      osm_type: "R", osm_id: 344953, osm_key: "boundary", osm_value: "administrative", type: "city",
      name: "Valencia", country: "Spain", countrycode: "ES", state: "Valencian Community", county: "Valencia",
      extent: [-0.4325512, 39.5666828, -0.272574, 39.2784496],
    }),
    feature([-68.0076532, 10.1620865], {
      osm_type: "R", osm_id: 11219662, osm_key: "place", osm_value: "city", type: "city",
      name: "Valencia", country: "Venezuela", countrycode: "VE", state: "Carabobo",
      extent: [-68.0975, 10.2981, -67.9289, 10.0886],
    }),
    feature([-0.7528, 39.3698], {
      osm_type: "R", osm_id: 349026, osm_key: "place", osm_value: "province", type: "county",
      name: "Valencia", country: "Spain", countrycode: "ES", state: "Valencian Community",
      extent: [-1.5291, 40.2119, -0.0458, 38.6876],
    }),
    feature([-5.5162, 42.2948], {
      osm_type: "N", osm_id: 21362118, osm_key: "place", osm_value: "village", type: "city",
      name: "Valencia de Don Juan", country: "Spain", countrycode: "ES", state: "Castile and León",
    }),
    feature([-0.3801, 39.4702], {
      osm_type: "N", osm_id: 999001, osm_key: "place", osm_value: "house", type: "house", name: "Valencia",
      country: "Spain", countrycode: "ES",
    }),
  ],
};

const PHOTON_SPAIN = {
  type: "FeatureCollection",
  features: [
    feature([-4.8379791, 39.3260685], {
      osm_type: "R", osm_id: 1311341, osm_key: "place", osm_value: "country", type: "country",
      name: "Spain", country: "Spain", countrycode: "ES", extent: [-18.1606948, 43.7930856, 4.3282001, 27.6377504],
    }),
  ],
};

const PHOTON_MERCADO = {
  type: "FeatureCollection",
  features: [
    feature([-0.3801, 39.4729], { osm_type: "N", osm_id: 101, osm_key: "place", osm_value: "neighbourhood", type: "district", name: "Mercado", city: "València", country: "Spain" }),
    feature([-0.3766, 39.4741], { osm_type: "W", osm_id: 102, osm_key: "highway", osm_value: "residential", type: "street", name: "Carrer del Mercat", city: "València", country: "Spain" }),
    feature([-0.37877, 39.47372], {
      osm_type: "W", osm_id: 26663512, osm_key: "amenity", osm_value: "marketplace", type: "house", name: "Mercado Central",
      street: "Plaça de la Ciutat de Bruges", district: "Ciutat Vella", locality: "El Mercat", city: "València",
      county: "Valencia", state: "Valencian Community", country: "Spain", countrycode: "ES", postcode: "46001",
    }),
    // The same building again under another main tag.
    feature([-0.37877, 39.47372], {
      osm_type: "W", osm_id: 26663512, osm_key: "tourism", osm_value: "attraction", type: "house", name: "Mercado Central",
      city: "València", country: "Spain",
    }),
    feature([-0.36605, 39.46845], {
      osm_type: "N", osm_id: 2459872, osm_key: "amenity", osm_value: "marketplace", type: "house", name: "Mercado de Colón",
      street: "Carrer de Jorge Juan", housenumber: "19", district: "L'Eixample", city: "València", country: "Spain",
    }),
    feature([-0.36, 39.47], { osm_type: "R", osm_id: 103, osm_key: "boundary", osm_value: "administrative", type: "locality", name: "Mercado", country: "Spain" }),
    feature([-0.3779, 39.4745], {
      osm_type: "W", osm_id: 104, osm_key: "highway", osm_value: "pedestrian", type: "street", name: "Plaça del Mercat",
      district: "Ciutat Vella", city: "València", country: "Spain",
    }),
    feature([-0.37425, 39.46102], {
      osm_type: "N", osm_id: 105, osm_key: "amenity", osm_value: "restaurant", type: "house", name: "Mercado de Ruzafa Bar",
      locality: "Ruzafa", district: "L'Eixample", city: "València", country: "Spain",
    }),
    feature([-0.3741, 39.4614], { osm_type: "N", osm_id: 106, osm_key: "amenity", osm_value: "bank", type: "house", city: "València", country: "Spain" }),
  ],
};

const PHOTON_BEACHES = {
  type: "FeatureCollection",
  features: [
    feature([-0.32386, 39.47906], {
      osm_type: "W", osm_id: 201, osm_key: "natural", osm_value: "beach", type: "house", name: "Platja de la Malva-rosa",
      locality: "La Malva-rosa", district: "Poblats Marítims", city: "València", country: "Spain",
    }),
    feature([-0.3696, 39.47552], {
      osm_type: "R", osm_id: 202, osm_key: "leisure", osm_value: "park", type: "house", name: "Jardí del Túria",
      city: "València", country: "Spain",
    }),
    feature([-0.3701, 39.4733], { osm_type: "N", osm_id: 203, osm_key: "amenity", osm_value: "cafe", type: "house", name: "Café Turia", city: "València", country: "Spain" }),
  ],
};

const PHOTON_PORTUGAL_TOO = {
  type: "FeatureCollection",
  features: [
    feature([-9.20322, 38.69754], { osm_type: "N", osm_id: 301, osm_key: "amenity", osm_value: "cafe", type: "house", name: "Pastéis de Belém", street: "Rua de Belém", housenumber: "84", district: "Belém", city: "Lisbon", country: "Portugal" }),
    feature([-6.9707, 38.8794], { osm_type: "N", osm_id: 302, osm_key: "amenity", osm_value: "cafe", type: "house", name: "Pastelería Belém", city: "Badajoz", county: "Badajoz", country: "Spain" }),
  ],
};

const GOOGLE_HORCHATA = {
  places: [
    {
      id: "ChIJ0wzQ8U9PYA0RhZsantaCat",
      types: ["cafe", "food", "point_of_interest", "store", "establishment"],
      formattedAddress: "Plaça de Santa Caterina, 6, Ciutat Vella, 46001 València, Valencia, Spain",
      location: { latitude: 39.4750596, longitude: -0.3760897 },
      displayName: { text: "Horchatería Santa Catalina", languageCode: "es" },
      primaryTypeDisplayName: { text: "Café", languageCode: "en-US" },
      shortFormattedAddress: "Plaça de Santa Caterina, 6, Ciutat Vella, València",
      primaryType: "cafe",
    },
    {
      id: "ChIJ8a5nY1ZPYA0RdanielAlb",
      types: ["dessert_shop", "cafe", "food", "point_of_interest", "establishment"],
      formattedAddress: "Av. de l'Orxata, 41, 46120 Alboraia, Valencia, Spain",
      location: { latitude: 39.5007, longitude: -0.3529 },
      displayName: { text: "Horchatería Daniel", languageCode: "es" },
      primaryType: "dessert_shop",
    },
    { displayName: { text: "No id" }, location: { latitude: 39.47, longitude: -0.37 } },
  ],
};

const GOOGLE_MUSEUMS = {
  places: [
    {
      id: "ChIJmuseoBellasArtes",
      types: ["art_gallery", "museum", "tourist_attraction", "point_of_interest", "establishment"],
      formattedAddress: "Carrer de Sant Pius V, 9, La Saïdia, 46010 València, Valencia, Spain",
      shortFormattedAddress: "Carrer de Sant Pius V, 9, La Saïdia, València",
      location: { latitude: 39.4792, longitude: -0.3711 },
      displayName: { text: "Museu de Belles Arts de València" },
      primaryType: "art_museum",
      primaryTypeDisplayName: { text: "Art museum" },
    },
    {
      id: "ChIJhotelMuseo",
      types: ["hotel", "lodging", "point_of_interest", "establishment"],
      formattedAddress: "Carrer del Museu, 7, Ciutat Vella, 46003 València, Valencia, Spain",
      location: { latitude: 39.479, longitude: -0.379 },
      displayName: { text: "Hotel Museo" },
      primaryType: "hotel",
    },
  ],
};

type Body = unknown | ((url: URL) => unknown);
type Call = { url: URL; method: string; headers: Headers; body: unknown };

/** A canned body per source; a number is an HTTP error status, an Error a network failure. */
function stubFetch(routes: { photon?: Body; google?: Body }) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      calls.push({ url, method: init?.method ?? "GET", headers: new Headers(init?.headers), body });
      const route = url.hostname === "photon.komoot.io" ? routes.photon : url.hostname === "places.googleapis.com" ? routes.google : undefined;
      const res = typeof route === "function" ? route(url) : route;
      if (res === undefined) throw new Error(`Unexpected fetch: ${url}`);
      if (res instanceof Error) throw res;
      if (typeof res === "number") return new Response("Unavailable", { status: res });
      return new Response(JSON.stringify(res), { headers: { "Content-Type": "application/json" } });
    }),
  );
  return calls;
}

// Each test uses its own query text: successful searches are cached for an hour.
describe("live sources", () => {
  beforeEach(() => {
    vi.stubEnv("BOOKS_PROVIDER", undefined);
    vi.stubEnv("GOOGLE_PLACES_API_KEY", undefined);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("asks Photon for places and administrative areas, ranks and dedupes them", async () => {
    const calls = stubFetch({ photon: PHOTON_VALENCIA_AREAS });
    const hits = await searchAreasCatalog("Valencia", 8);
    expect(calls).toHaveLength(1);
    const { url, headers } = calls[0];
    expect(url.origin + url.pathname).toBe("https://photon.komoot.io/api/");
    expect(url.searchParams.get("q")).toBe("Valencia");
    expect(url.searchParams.get("limit")).toBe("16");
    expect(url.searchParams.get("lang")).toBe("en");
    expect(url.searchParams.getAll("osm_tag")).toEqual(["place", "boundary:administrative"]);
    expect(headers.get("User-Agent")).toBe("Trove/0.1 (favorites list prototype)");

    expect(hits.map((h) => [h.key, h.name, h.country, h.label])).toEqual([
      ["osm:R344953", "Valencia", "Spain", "City"],
      ["osm:R11219662", "Valencia", "Venezuela", "City"],
      ["osm:R349026", "Valencia", "Spain", "Province"],
      ["osm:N21362118", "Valencia de Don Juan", "Spain", "Village"],
    ]);
    // [minLon, maxLat, maxLon, minLat] → [west, south, east, north]
    expect(hits[0]).toMatchObject({ lat: 39.4228, lon: -0.3547, bbox: [-0.4325512, 39.2784496, -0.272574, 39.5666828] });
    expect(hits[3].bbox).toBeNull();
  });

  it("maps a country, with no country of its own", async () => {
    stubFetch({ photon: PHOTON_SPAIN });
    const [spain] = await searchAreas("spain");
    expect(spain).toEqual({
      key: "osm:R1311341",
      name: "Spain",
      country: null,
      label: "Country",
      lat: 39.3260685,
      lon: -4.8379791,
      bbox: [-18.1606948, 27.6377504, 4.3282001, 43.7930856],
    });
    expect(extentToBBox([1, 2, 3])).toBeNull();
    expect(extentToBBox("nope")).toBeNull();
  });

  it("searches spots inside the bbox, dropping places, boundaries and streets", async () => {
    const calls = stubFetch({ photon: PHOTON_MERCADO });
    const hits = await searchSpots("mercado", VALENCIA);
    const { url } = calls[0];
    expect(url.searchParams.get("q")).toBe("mercado");
    expect(url.searchParams.get("bbox")).toBe("-0.4325512,39.2784496,-0.272574,39.5666828");
    expect(url.searchParams.has("lat")).toBe(false);
    expect(url.searchParams.getAll("osm_tag")).toEqual(["!place", "!boundary:administrative"]);
    expect(url.searchParams.get("limit")).toBe("24");

    expect(titles(hits)).toEqual(["Mercado Central", "Mercado de Colón", "Mercado de Ruzafa Bar", "Plaça del Mercat"]);
    expect(hits[0]).toEqual({
      key: "osm:W26663512",
      title: "Mercado Central",
      author: "El Mercat",
      year: null,
      coverUrl: null,
      categories: ["Food & Drink", "Shopping"],
      place: { lat: 39.47372, lon: -0.37877, type: "Market", address: "Plaça de la Ciutat de Bruges, València" },
    });
    expect(hits[1]).toMatchObject({ author: "L'Eixample", place: { address: "Carrer de Jorge Juan 19, València" } });
    expect(hits[2]).toMatchObject({ author: "Ruzafa", categories: ["Food & Drink"], place: { type: "Restaurant", address: null } });
    expect(hits[3]).toMatchObject({ categories: ["Sights"], place: { type: "Pedestrian street" } });
  });

  it("names the town when it isn't the destination, and keeps a country's spots in it", async () => {
    const spain: AreaHit = { key: "osm:R1311341", name: "Spain", country: null, label: "Country", lat: 39.3, lon: -4.8, bbox: [-18.1606948, 27.6377504, 4.3282001, 43.7930856] };
    stubFetch({ photon: PHOTON_MERCADO });
    const hits = await searchSpots("mercado central", spain);
    expect(hits[0].author).toBe("El Mercat, València");
    stubFetch({ photon: PHOTON_PORTUGAL_TOO });
    expect(titles(await searchSpots("pasteis", spain))).toEqual(["Pastelería Belém"]);
  });

  it("biases toward a position, or names an unknown area in the query", async () => {
    let calls = stubFetch({ photon: { features: [] } });
    await searchSpots("pasteis", { name: "Lisbon", country: "Portugal", lat: 38.7077507, lon: -9.1365919, bbox: null });
    expect(Object.fromEntries(calls[0].url.searchParams)).toMatchObject({ q: "pasteis", lat: "38.7077507", lon: "-9.1365919", zoom: "12" });
    expect(calls[0].url.searchParams.has("bbox")).toBe(false);

    calls = stubFetch({ photon: { features: [] } });
    await searchSpots("pasteis", { name: "Costa de Lisboa", country: null, lat: null, lon: null, bbox: null });
    expect(calls[0].url.searchParams.get("q")).toBe("pasteis Costa de Lisboa");
    expect(calls[0].url.searchParams.has("lat")).toBe(false);
  });

  it("browses with the area's name, the category's tags and the bbox", async () => {
    const calls = stubFetch({ photon: PHOTON_BEACHES });
    const hits = await browseSpots("Beaches & Nature", VALENCIA);
    const { url } = calls[0];
    expect(url.searchParams.get("q")).toBe("Valencia");
    expect(url.searchParams.get("bbox")).toBe("-0.4325512,39.2784496,-0.272574,39.5666828");
    expect(url.searchParams.getAll("osm_tag")).toEqual(PHOTON_BROWSE_TAGS["Beaches & Nature"]);
    expect(titles(hits)).toEqual(["Platja de la Malva-rosa", "Jardí del Túria"]);
    expect(hits[0]).toMatchObject({ author: "La Malva-rosa", categories: ["Beaches & Nature"], place: { type: "Beach" } });
  });

  it("throws when Photon is down, and matching turns that into match: null", async () => {
    stubFetch({ photon: 503 });
    await expect(searchAreas("nowhere at all")).rejects.toThrow(/Photon 503/);
    await expect(searchSpots("nothing works", VALENCIA)).rejects.toThrow(/Photon 503/);
    const [result] = await matchCandidates("place", [{ title: "Still nothing" }], VALENCIA);
    expect(result).toEqual({ input: { title: "Still nothing" }, match: null, alternatives: [] });
  });

  it("uses Google Places with a key, restricted to the bbox, keeping the key out of the URL and results", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "test-google-key-123");
    const calls = stubFetch({ google: GOOGLE_HORCHATA });
    const hits = await searchCatalog("place", "horchata", 8, VALENCIA);
    expect(calls).toHaveLength(1);
    const { url, method, headers, body } = calls[0];
    expect(url.href).toBe("https://places.googleapis.com/v1/places:searchText");
    expect(method).toBe("POST");
    expect(headers.get("X-Goog-Api-Key")).toBe("test-google-key-123");
    expect(headers.get("X-Goog-FieldMask")).toBe(
      "places.id,places.displayName,places.formattedAddress,places.shortFormattedAddress,places.location,places.primaryType,places.primaryTypeDisplayName,places.types",
    );
    expect(body).toEqual({
      textQuery: "horchata",
      maxResultCount: 8,
      languageCode: "en",
      locationRestriction: {
        rectangle: { low: { latitude: 39.2784496, longitude: -0.4325512 }, high: { latitude: 39.5666828, longitude: -0.272574 } },
      },
    });

    expect(hits).toEqual([
      {
        key: "gplace:ChIJ0wzQ8U9PYA0RhZsantaCat",
        title: "Horchatería Santa Catalina",
        author: "Ciutat Vella",
        year: null,
        coverUrl: null,
        categories: ["Cafés"],
        place: { lat: 39.4750596, lon: -0.3760897, type: "Café", address: "Plaça de Santa Caterina, 6, Ciutat Vella, València" },
      },
      {
        key: "gplace:ChIJ8a5nY1ZPYA0RdanielAlb",
        title: "Horchatería Daniel",
        author: "Alboraia",
        year: null,
        coverUrl: null,
        categories: ["Cafés"],
        place: { lat: 39.5007, lon: -0.3529, type: "Dessert shop", address: "Av. de l'Orxata, 41, 46120 Alboraia, Valencia, Spain" },
      },
    ]);
    expect(JSON.stringify(hits)).not.toContain("test-google-key-123");
  });

  it("browses Google with 'museums in Valencia', dropping what isn't one", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "test-google-key-123");
    const calls = stubFetch({ google: GOOGLE_MUSEUMS });
    const hits = await browseCatalog("Museums", VALENCIA, 12);
    expect(calls[0].body).toMatchObject({ textQuery: "museums in Valencia", maxResultCount: 20 });
    expect(hits.map((h) => [h.title, h.author, h.place?.type])).toEqual([["Museu de Belles Arts de València", "La Saïdia", "Art museum"]]);
    expect(hits[0].categories).toEqual(["Museums & Culture", "Sights"]);
  });

  it("biases Google toward a position when there's no bbox, or puts the area in the query", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "test-google-key-123");
    let calls = stubFetch({ google: {} });
    expect(await searchSpots("ramen", { name: "Tokyo", country: "Japan", lat: 35.68, lon: 139.76, bbox: null })).toEqual([]);
    expect(calls[0].body).toEqual({
      textQuery: "ramen",
      maxResultCount: 8,
      languageCode: "en",
      locationBias: { circle: { center: { latitude: 35.68, longitude: 139.76 }, radius: 20000 } },
    });
    calls = stubFetch({ google: {} });
    await searchSpots("ramen", { name: "Shinjuku", country: null, lat: null, lon: null, bbox: null });
    expect(calls[0].body).toEqual({ textQuery: "ramen Shinjuku", maxResultCount: 8, languageCode: "en" });
  });

  it("falls back to Photon when Google fails, without caching the fallback", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "test-google-key-123");
    let calls = stubFetch({ google: 403, photon: PHOTON_MERCADO });
    const hits = await searchSpots("mercado colon", VALENCIA);
    expect(calls.map((c) => c.url.hostname)).toEqual(["places.googleapis.com", "photon.komoot.io"]);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.key.startsWith("osm:"))).toBe(true);
    expect(calls[1].url.href).not.toContain("test-google-key-123");

    calls = stubFetch({ google: GOOGLE_HORCHATA, photon: PHOTON_MERCADO });
    expect((await searchSpots("mercado colon", VALENCIA))[0].key).toMatch(/^gplace:/);
    expect(calls.map((c) => c.url.hostname)).toEqual(["places.googleapis.com"]);
  });
});
