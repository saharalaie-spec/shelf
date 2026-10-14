import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lookupIsbn, matchCandidates, searchCatalog } from "@/lib/catalog";
import { categorizePodcast, categorizeScreen, PODCAST_CATEGORIES, SCREEN_CATEGORIES } from "@/lib/genres";
import { searchScreen } from "@/lib/screen";

const titles = (hits: { title: string }[]) => hits.map((h) => h.title);

describe("searchCatalog (offline catalogs)", () => {
  it("finds podcasts with friendly categories", async () => {
    const [hit] = await searchCatalog("podcast", "huberman");
    expect(hit).toMatchObject({ key: "fx:pod:huberman-lab", title: "Huberman Lab", author: "Scicomm Media", year: null });
    expect(hit.categories).toContain("Health & Fitness");
    expect(hit.categories).not.toContain("Podcasts");
  });

  it("ranks an exact podcast title first, ignoring a leading 'The'", async () => {
    expect((await searchCatalog("podcast", "daily"))[0].title).toBe("The Daily");
  });

  it("finds both Dune movies, with the format first in their categories", async () => {
    const hits = await searchCatalog("screen", "dune");
    expect(titles(hits)).toEqual(expect.arrayContaining(["Dune", "Dune: Part Two"]));
    expect(hits[0]).toMatchObject({ title: "Dune", year: 2021, author: "Denis Villeneuve" });
    for (const h of hits) expect(h.categories[0]).toBe("Movies");
    expect(hits[0].categories).toContain("Sci-Fi & Fantasy");
  });

  it("boosts the year in the query", async () => {
    expect((await searchCatalog("screen", "Dune 2024"))[0].title).toBe("Dune: Part Two");
    expect((await searchCatalog("screen", "Dune (1984)"))[0]).toMatchObject({ title: "Dune", author: "David Lynch" });
    expect((await searchCatalog("screen", "dune 2021"))[0]).toMatchObject({ title: "Dune", year: 2021 });
  });

  it("knows shows are TV", async () => {
    const [hit] = await searchCatalog("screen", "severance");
    expect(hit).toMatchObject({ key: "fx:screen:severance-2022", title: "Severance", author: "Apple TV+" });
    expect(hit.categories[0]).toBe("TV");
    expect(hit.categories).toContain("Sci-Fi & Fantasy");
  });

  it("matches accents and director names", async () => {
    expect(titles(await searchCatalog("screen", "amelie"))).toEqual(["Amélie"]);
    expect(titles(await searchCatalog("screen", "nolan"))).toEqual(
      expect.arrayContaining(["Oppenheimer", "Inception", "Interstellar"]),
    );
  });

  it("still delegates books", async () => {
    expect((await searchCatalog("book", "sapiens"))[0].title).toBe("Sapiens");
    expect((await lookupIsbn("9780679733737"))[0].title).toBe("The Myth of Sisyphus");
  });
});

describe("matchCandidates (offline catalogs)", () => {
  it("matches movies and shows using year and format", async () => {
    const results = await matchCandidates("screen", [
      { title: "The Bear", format: "tv" },
      { title: "Inception", year: 2010 },
      { title: "zzz not a film" },
      { title: "Dune", year: 1984 },
      { title: "Arrival", author: "Denis Villeneuve" },
    ]);
    expect(results.map((r) => r.match?.title ?? null)).toEqual(["The Bear", "Inception", null, "Dune", "Arrival"]);
    expect(results[0].match?.categories[0]).toBe("TV");
    expect(results[1].match?.year).toBe(2010);
    expect(results[2]).toEqual({ input: { title: "zzz not a film" }, match: null, alternatives: [] });
    expect(results[3].match?.author).toBe("David Lynch");
    expect(results[3].alternatives.map((h) => h.year)).toContain(2021);
  });

  it("matches podcasts on title and host, falling back to the title alone", async () => {
    const results = await matchCandidates("podcast", [
      { title: "Hardcore History", author: "Dan Carlin" },
      { title: "The Daily", author: "Someone Else Entirely" },
      { title: "crime junkie" },
      { title: "zzz not a podcast" },
    ]);
    expect(results.map((r) => r.match?.title ?? null)).toEqual([
      "Dan Carlin's Hardcore History",
      "The Daily",
      "Crime Junkie",
      null,
    ]);
    expect(results[2].match?.categories).toContain("True Crime");
  });

  it("still delegates books", async () => {
    const [result] = await matchCandidates("book", [{ title: "beyond good", author: "nietzsche" }]);
    expect(result.match?.title).toBe("Beyond Good and Evil");
  });
});

describe("genre mapping", () => {
  it("maps TMDB movie and TV genres", () => {
    expect(categorizeScreen(["Science Fiction", "Adventure"], "movie")).toEqual(["Movies", "Sci-Fi & Fantasy", "Action & Adventure"]);
    expect(categorizeScreen(["Sci-Fi & Fantasy", "Action & Adventure", "War & Politics", "Drama"], "tv")).toEqual([
      "TV",
      "Sci-Fi & Fantasy",
      "Action & Adventure",
      "History & War",
    ]);
    expect(categorizeScreen(["TV Movie", "Talk"], "movie")).toEqual(["Movies"]);
  });

  it("maps TVmaze genres and dedupes", () => {
    expect(categorizeScreen(["Science-Fiction", "Fantasy", "Supernatural", "Drama"], "tv")).toEqual(["TV", "Sci-Fi & Fantasy", "Drama"]);
    expect(categorizeScreen(["Children", "Legal", "Espionage"], "tv")).toEqual(["TV", "Family", "Drama", "Thriller"]);
    expect(categorizeScreen(["Award Show"], "tv")).toEqual(["TV"]);
  });

  it("maps Apple movie genres", () => {
    expect(categorizeScreen(["Kids & Family"], "movie")).toEqual(["Movies", "Family"]);
    expect(categorizeScreen(["Music Documentaries"], "movie")).toEqual(["Movies", "Documentary", "Music"]);
    expect(categorizeScreen(["Anime"], "movie")).toEqual(["Movies", "Animation"]);
  });

  it("maps Apple podcast genres and drops 'Podcasts'", () => {
    expect(categorizePodcast(["Health & Fitness", "Podcasts", "Science"])).toEqual(["Health & Fitness", "Science"]);
    expect(categorizePodcast(["Society & Culture", "Podcasts"])).toEqual(["Society & Culture"]);
    expect(categorizePodcast(["Kids & Family", "Stories for Kids"])).toEqual(["Kids & Family"]);
    expect(categorizePodcast(["Science Fiction"])).toEqual(["Fiction"]);
    expect(categorizePodcast(["Daily News", "Politics", "Tech News"])).toEqual(["News & Politics", "Technology"]);
    expect(categorizePodcast(["Podcasts"])).toEqual([]);
  });

  it("keeps at most four entries, all from the lists users pick from", () => {
    const pod = categorizePodcast(["Comedy", "History", "Science", "Business", "Sports", "Music"]);
    const screen = categorizeScreen(["Drama", "Comedy", "Crime", "Thriller", "Horror"], "tv");
    expect(pod).toHaveLength(4);
    expect(screen).toHaveLength(4);
    for (const c of pod) expect(PODCAST_CATEGORIES).toContain(c);
    for (const c of screen) expect(SCREEN_CATEGORIES).toContain(c);
  });
});

// ---------- Live sources, with fetch stubbed ----------

const ITUNES_PODCASTS = {
  resultCount: 3,
  results: [
    {
      collectionId: 1700000001,
      collectionName: "Huberman Lab Clips",
      artistName: "Huberman Lab Clips",
      artworkUrl100: "http://is1-ssl.mzstatic.com/image/thumb/Podcasts/clips/100x100bb.jpg",
      primaryGenreName: "Health & Fitness",
      genres: ["Health & Fitness", "Podcasts"],
      releaseDate: "2026-10-01T10:00:00Z",
    },
    {
      collectionId: 1545953110,
      collectionName: "Huberman Lab",
      artistName: "Scicomm Media",
      artworkUrl100: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts/hl/100x100bb.jpg",
      artworkUrl600: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts/hl/600x600bb.jpg",
      primaryGenreName: "Health & Fitness",
      genres: ["Health & Fitness", "Podcasts", "Science"],
      releaseDate: "2026-10-13T08:00:00Z",
    },
    { collectionId: 1700000003, collectionName: "Andrew Huberman Fan Talk", artistName: "Fans", genres: ["Podcasts"] },
  ],
};

const ITUNES_MOVIES = {
  resultCount: 2,
  results: [
    {
      trackId: 1581297285,
      trackName: "Dune (2021)",
      artistName: "Denis Villeneuve",
      releaseDate: "2021-10-22T07:00:00Z",
      primaryGenreName: "Sci-Fi & Fantasy",
      artworkUrl100: "https://is1-ssl.mzstatic.com/image/thumb/Video/dune/100x100bb.jpg",
    },
    {
      trackId: 1729547263,
      trackName: "Dune: Part Two",
      artistName: "Denis Villeneuve",
      releaseDate: "2024-03-01T08:00:00Z",
      primaryGenreName: "Sci-Fi & Fantasy",
      artworkUrl100: "https://is1-ssl.mzstatic.com/image/thumb/Video/dune2/100x100bb.jpg",
    },
  ],
};

const TVMAZE = [
  {
    score: 0.71,
    show: {
      id: 61186,
      name: "Dune: Prophecy",
      type: "Scripted",
      genres: ["Drama", "Science-Fiction"],
      premiered: "2024-11-17",
      network: { name: "HBO" },
      webChannel: null,
      image: {
        medium: "https://static.tvmaze.com/uploads/images/medium_portrait/530/1.jpg",
        original: "https://static.tvmaze.com/uploads/images/original_untouched/530/1.jpg",
      },
    },
  },
  {
    score: 0.6,
    show: {
      id: 4217,
      name: "Frank Herbert's Dune",
      type: "Scripted",
      genres: ["Drama", "Science-Fiction"],
      premiered: "2000-12-03",
      network: { name: "Syfy" },
      webChannel: null,
      image: null,
    },
  },
  {
    score: 0.4,
    show: {
      id: 90001,
      name: "Dune Docs",
      type: "Documentary",
      genres: [],
      premiered: null,
      network: null,
      webChannel: { name: "YouTube" },
      image: { medium: "http://static.tvmaze.com/uploads/images/medium_portrait/9/9.jpg" },
    },
  },
];

const TMDB = {
  page: 1,
  results: [
    { id: 438631, media_type: "movie", title: "Dune", release_date: "2021-09-15", poster_path: "/d5NXSklXo0qyIYkgV94XAgMIckC.jpg", genre_ids: [878, 12], popularity: 153.2 },
    { id: 137427, media_type: "person", name: "Denis Villeneuve", popularity: 9.1, known_for: [] },
    { id: 90228, media_type: "tv", name: "Dune: Prophecy", first_air_date: "2024-11-17", poster_path: "/prophecy.jpg", genre_ids: [10765, 18], popularity: 80 },
    { id: 693134, media_type: "movie", title: "Dune: Part Two", release_date: "2024-02-27", poster_path: "/parttwo.jpg", genre_ids: [878, 12], popularity: 300 },
    { id: 1001, media_type: "movie", title: "Dune Drifter", release_date: "", poster_path: null, genre_ids: [] },
  ],
};

/** A canned body per source; a number is an HTTP error status, an Error a network failure. */
type Routes = { tmdb?: unknown; itunesPodcast?: unknown; itunesMovie?: unknown; tvmaze?: unknown };

function stubFetch(routes: Routes) {
  const calls: { url: URL; headers: Headers }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      calls.push({ url, headers: new Headers(init?.headers) });
      const body =
        url.hostname === "api.themoviedb.org"
          ? routes.tmdb
          : url.hostname === "api.tvmaze.com"
            ? routes.tvmaze
            : url.searchParams.get("media") === "podcast"
              ? routes.itunesPodcast
              : routes.itunesMovie;
      if (body === undefined) throw new Error(`Unexpected fetch: ${url}`);
      if (body instanceof Error) throw body;
      if (typeof body === "number") return new Response("Unavailable", { status: body });
      return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
    }),
  );
  return calls;
}

const FREE = { itunesMovie: ITUNES_MOVIES, tvmaze: TVMAZE };

// Each test uses its own query text: successful searches are cached for an hour.
describe("live sources", () => {
  beforeEach(() => {
    vi.stubEnv("BOOKS_PROVIDER", undefined);
    vi.stubEnv("TMDB_API_KEY", undefined);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("maps and ranks iTunes podcasts", async () => {
    const calls = stubFetch({ itunesPodcast: ITUNES_PODCASTS });
    const hits = await searchCatalog("podcast", "Huberman Lab");
    expect(calls.map((c) => c.url.href)).toEqual([
      "https://itunes.apple.com/search?media=podcast&entity=podcast&limit=16&term=Huberman+Lab",
    ]);
    expect(titles(hits)).toEqual(["Huberman Lab", "Huberman Lab Clips", "Andrew Huberman Fan Talk"]);
    expect(hits[0]).toEqual({
      key: "itunes:pod:1545953110",
      title: "Huberman Lab",
      author: "Scicomm Media",
      year: null,
      coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts/hl/600x600bb.jpg",
      categories: ["Health & Fitness", "Science"],
    });
    expect(hits[1].coverUrl).toBe("https://is1-ssl.mzstatic.com/image/thumb/Podcasts/clips/600x600bb.jpg");
    expect(hits[2]).toMatchObject({ coverUrl: null, categories: [] });
  });

  it("without a TMDB key, interleaves iTunes movies and TVmaze shows", async () => {
    const calls = stubFetch(FREE);
    const hits = await searchCatalog("screen", "dune");
    expect(calls.map((c) => c.url.href).sort()).toEqual([
      "https://api.tvmaze.com/search/shows?q=dune",
      "https://itunes.apple.com/search?media=movie&entity=movie&limit=16&term=dune",
    ]);
    expect(hits.map((h) => h.key)).toEqual([
      "itunes:movie:1581297285",
      "tvmaze:61186",
      "itunes:movie:1729547263",
      "tvmaze:90001",
      "tvmaze:4217",
    ]);
    expect(hits[0]).toEqual({
      key: "itunes:movie:1581297285",
      title: "Dune",
      author: "Denis Villeneuve",
      year: 2021,
      coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Video/dune/600x600bb.jpg",
      categories: ["Movies", "Sci-Fi & Fantasy"],
    });
    expect(hits[1]).toEqual({
      key: "tvmaze:61186",
      title: "Dune: Prophecy",
      author: "HBO",
      year: 2024,
      coverUrl: "https://static.tvmaze.com/uploads/images/original_untouched/530/1.jpg",
      categories: ["TV", "Drama", "Sci-Fi & Fantasy"],
    });
    expect(hits[3]).toMatchObject({
      author: "YouTube",
      year: null,
      coverUrl: "https://static.tvmaze.com/uploads/images/medium_portrait/9/9.jpg",
      categories: ["TV", "Documentary"],
    });
    expect(hits[4].coverUrl).toBeNull();
  });

  it("ranks by the year in the query, and by an explicit format", async () => {
    stubFetch(FREE);
    const byYear = await searchScreen("Dune (2024)", 8);
    expect(byYear.slice(0, 2).map((h) => h.year)).toEqual([2024, 2024]);
    expect((await searchScreen("Dune 2024", 8, { format: "movie" }))[0].key).toBe("itunes:movie:1729547263");
    expect((await searchScreen("dune", 8, { format: "tv" }))[0].key).toBe("tvmaze:61186");
  });

  it("keeps iTunes results when TVmaze fails, and the reverse", async () => {
    stubFetch({ itunesMovie: ITUNES_MOVIES, tvmaze: 503 });
    const movies = await searchScreen("dune part two", 8);
    expect(movies.map((h) => h.key)).toEqual(["itunes:movie:1729547263", "itunes:movie:1581297285"]);

    stubFetch({ itunesMovie: new TypeError("fetch failed"), tvmaze: TVMAZE });
    const shows = await searchScreen("dune prophecy", 8);
    expect(shows[0].key).toBe("tvmaze:61186");
    expect(shows.every((h) => h.key.startsWith("tvmaze:"))).toBe(true);
  });

  it("doesn't cache a search a source failed", async () => {
    stubFetch({ itunesMovie: ITUNES_MOVIES, tvmaze: 500 });
    expect(await searchScreen("frank herbert", 8)).toHaveLength(2);
    stubFetch(FREE);
    expect(await searchScreen("frank herbert", 8)).toHaveLength(5);
  });

  it("throws only when every source failed, and matching turns that into match: null", async () => {
    stubFetch({ itunesMovie: 500, tvmaze: new TypeError("fetch failed") });
    await expect(searchScreen("nothing works", 8)).rejects.toThrow(/iTunes 500/);
    const [result] = await matchCandidates("screen", [{ title: "Still nothing" }]);
    expect(result).toEqual({ input: { title: "Still nothing" }, match: null, alternatives: [] });
  });

  it("uses TMDB with a v3 key, dropping people", async () => {
    vi.stubEnv("TMDB_API_KEY", "v3key123");
    const calls = stubFetch({ tmdb: TMDB });
    const hits = await searchScreen("dune", 8);
    expect(calls).toHaveLength(1);
    const { url, headers } = calls[0];
    expect(url.origin + url.pathname).toBe("https://api.themoviedb.org/3/search/multi");
    expect(Object.fromEntries(url.searchParams)).toEqual({ query: "dune", include_adult: "false", api_key: "v3key123" });
    expect(headers.get("Authorization")).toBeNull();

    expect(hits.map((h) => h.key)).toEqual(["tmdb:movie:438631", "tmdb:movie:693134", "tmdb:tv:90228", "tmdb:movie:1001"]);
    expect(hits[0]).toEqual({
      key: "tmdb:movie:438631",
      title: "Dune",
      author: null,
      year: 2021,
      coverUrl: "https://image.tmdb.org/t/p/w500/d5NXSklXo0qyIYkgV94XAgMIckC.jpg",
      categories: ["Movies", "Sci-Fi & Fantasy", "Action & Adventure"],
    });
    expect(hits[2]).toMatchObject({ title: "Dune: Prophecy", year: 2024, categories: ["TV", "Sci-Fi & Fantasy", "Drama"] });
    expect(hits[3]).toMatchObject({ title: "Dune Drifter", year: null, coverUrl: null, categories: ["Movies"] });
  });

  it("sends a v4 token as a Bearer header", async () => {
    vi.stubEnv("TMDB_API_KEY", "eyJhbGciOiJIUzI1NiJ9.token");
    const calls = stubFetch({ tmdb: TMDB });
    const hits = await searchScreen("Dune 2024", 8, { format: "movie" });
    expect(calls[0].headers.get("Authorization")).toBe("Bearer eyJhbGciOiJIUzI1NiJ9.token");
    expect(calls[0].url.searchParams.has("api_key")).toBe(false);
    expect(calls[0].url.searchParams.get("query")).toBe("Dune");
    expect(hits[0].key).toBe("tmdb:movie:693134");
  });

  it("falls back to the free sources when TMDB fails", async () => {
    vi.stubEnv("TMDB_API_KEY", "v3key123");
    const calls = stubFetch({ tmdb: 401, ...FREE });
    const hits = await searchScreen("dune messiah", 8);
    expect(calls.map((c) => c.url.hostname).sort()).toEqual(["api.themoviedb.org", "api.tvmaze.com", "itunes.apple.com"]);
    expect(hits.length).toBe(5);
    expect(hits.every((h) => /^(itunes:movie|tvmaze):/.test(h.key))).toBe(true);
  });
});
