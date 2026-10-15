import { describe, expect, it } from "vitest";
import {
  isBookBarcode,
  parseCsv,
  parseImport,
  parseLibraryExport,
  parseList,
  parseOpml,
  parsePodcastExport,
  parseScreenExport,
  SOURCE_LABEL,
} from "@/lib/parse";

describe("parseList", () => {
  it("takes one title per line and strips bullets, numbers and quotes", () => {
    expect(parseList("- Meditations\n2. “Sapiens”\n• 1984.\n\n[x] Dune")).toEqual([
      { title: "Meditations" },
      { title: "Sapiens" },
      { title: "1984" },
      { title: "Dune" },
    ]);
  });

  it("splits a single line on commas", () => {
    expect(parseList("Dune, The Stranger; 1984").map((c) => c.title)).toEqual(["Dune", "The Stranger", "1984"]);
  });

  it("keeps commas inside titles when there are several lines", () => {
    expect(parseList("Thinking, Fast and Slow\nGuns, Germs, and Steel").map((c) => c.title)).toEqual([
      "Thinking, Fast and Slow",
      "Guns, Germs, and Steel",
    ]);
  });

  it("reads 'by' and spaced dashes as the author", () => {
    expect(parseList("Sapiens by Yuval Noah Harari\nThe Stranger - Camus\nCatch-22")).toEqual([
      { title: "Sapiens", author: "Yuval Noah Harari" },
      { title: "The Stranger", author: "Camus" },
      { title: "Catch-22" },
    ]);
  });

  it("drops duplicates regardless of case", () => {
    expect(parseList("Dune\ndune\nDUNE")).toHaveLength(1);
  });
});

describe("parseCsv", () => {
  it("handles quotes, escaped quotes and newlines in fields", () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n1,"two\nlines",3\n')).toEqual([
      ["a", "b, c", 'say "hi"'],
      ["1", "two\nlines", "3"],
    ]);
  });
});

describe("parseLibraryExport", () => {
  it("reads a Goodreads export into the three sections, cleaning ISBNs and series", () => {
    const csv = [
      "Book Id,Title,Author,ISBN,ISBN13,Exclusive Shelf",
      '1,"The Hobbit (Middle-earth, #0)",J.R.R. Tolkien,"=""0547928220""","=""9780547928227""",read',
      '2,Dune Messiah,Frank Herbert,"=""""","=""""",to-read',
      '3,Siddhartha,Hermann Hesse,"=""""","=""""",currently-reading',
      '4,Ulysses,James Joyce,"=""""","=""""",did-not-finish',
    ].join("\n");
    expect(parseLibraryExport(csv)).toEqual({
      source: "goodreads",
      skipped: 1,
      counts: { read: 1, reading: 1, want: 1 },
      items: [
        { title: "The Hobbit", author: "J.R.R. Tolkien", isbn: "9780547928227", status: "read" },
        { title: "Dune Messiah", author: "Frank Herbert", isbn: undefined, status: "want" },
        { title: "Siddhartha", author: "Hermann Hesse", isbn: undefined, status: "reading" },
      ],
    });
  });

  it("reads a StoryGraph export", () => {
    const csv = "Title,Authors,ISBN/UID,Read Status\nDune,\"Frank Herbert, Someone\",9780441172719,read\nX,Y,,to-read";
    const result = parseLibraryExport(csv)!;
    expect(result.source).toBe("storygraph");
    expect(result.items).toEqual([
      { title: "Dune", author: "Frank Herbert", isbn: "9780441172719", status: "read" },
      { title: "X", author: "Y", isbn: undefined, status: "want" },
    ]);
  });

  it("leaves the status open when the file has no shelf column", () => {
    expect(parseLibraryExport("Title,Author\nDune,Frank Herbert")!.items).toEqual([
      { title: "Dune", author: "Frank Herbert", isbn: undefined },
    ]);
  });

  it("rejects files without a title column", () => {
    expect(parseLibraryExport("foo,bar\n1,2")).toBeNull();
  });
});

const NO_COUNTS = { read: 0, reading: 0, want: 0 };

const OPML = `<?xml version="1.0" encoding="utf-8"?>
<!-- Exported by Overcast. <outline text="Commented Out" xmlUrl="https://example.com/old.xml"/> -->
<opml version="1.0">
  <head><title>Overcast Podcast Subscriptions</title></head>
  <body>
    <outline text="feeds">
      <outline type="rss" text="Hardcore History" title="Dan Carlin&apos;s Hardcore History" xmlUrl="https://feeds.feedburner.com/dancarlin/history?format=xml&amp;x=1" htmlUrl="https://www.dancarlin.com"/>
      <outline xmlUrl="https://feeds.npr.org/510289/podcast.xml" type="rss" text="Planet Money" />
      <outline text='Reply All' xmlUrl='https://feeds.megaphone.fm/replyall' type='rss'/>
      <outline type="rss" text="Science Vs" title="Science Vs" xmlUrl="https://feeds.megaphone.fm/sciencevs" overcastId="123" subscribed="1">
        <outline type="podcast-episode" title="Is Coffee Good for You?" url="https://overcast.fm/+abc" enclosureUrl="https://example.com/ep.mp3"/>
      </outline>
      <outline type="rss" title="Hidden Brain &amp; Friends" text="" xmlUrl="https://feeds.example.com/hb"/>
      <outline type="rss" text="Radiolab &#8211; WNYC" xmlUrl="https://feeds.example.com/radiolab"/>
      <outline type="rss" text="Today, Explained &lt;Vox&gt;" xmlUrl="https://feeds.example.com/today"/>
      <outline type="rss" text="Conan O&#39;Brien Needs a Friend" xmlUrl="https://feeds.example.com/conan"/>
      <outline type="rss" text="The Rest Is History &#x2014; It&#x27;s Back" xmlUrl="https://feeds.example.com/trih"/>
      <outline type="rss" title="This > That" xmlUrl="https://feeds.example.com/gt"/>
      <outline type="rss" text="PLANET MONEY" xmlUrl="https://feeds.npr.org/dupe.xml"/>
      <outline type="rss" xmlUrl="https://feeds.example.com/nameless"/>
    </outline>
    <outline text="playlists">
      <outline type="podcast-playlist" title="All Episodes" smart="1"/>
    </outline>
  </body>
</opml>`;

describe("parseOpml", () => {
  it("takes every outline with an xmlUrl, nested or not, in any attribute order and quote style", () => {
    expect(parseOpml(OPML)).toEqual({
      source: "opml",
      skipped: 1,
      counts: NO_COUNTS,
      items: [
        { title: "Dan Carlin's Hardcore History" },
        { title: "Planet Money" },
        { title: "Reply All" },
        { title: "Science Vs" },
        { title: "Hidden Brain & Friends" },
        { title: "Radiolab – WNYC" },
        { title: "Today, Explained <Vox>" },
        { title: "Conan O'Brien Needs a Friend" },
        { title: "The Rest Is History — It's Back" },
        { title: "This > That" },
      ],
    });
  });

  it("reads Apple Podcasts' flat export and lowercase xmlurl", () => {
    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0"><head><title>Podcasts</title></head><body>
<outline text="The Daily" type="rss" xmlUrl="https://feeds.simplecast.com/54nAGcIl" />
<outline type="rss" text="Search Engine" xmlurl="https://feeds.example.com/se" /></body></opml>`;
    expect(parseOpml(opml)!.items).toEqual([{ title: "The Daily" }, { title: "Search Engine" }]);
  });

  it("returns null when it isn't OPML or has no feeds", () => {
    expect(parseOpml("Title,Author\nDune,Frank Herbert")).toBeNull();
    expect(parseOpml('<outline text="Loose" xmlUrl="https://example.com/a.xml"/>')).toBeNull();
    expect(parseOpml('<opml version="1.0"><body><outline text="feeds"/></body></opml>')).toBeNull();
    expect(parseOpml("")).toBeNull();
  });
});

describe("parsePodcastExport", () => {
  it("reads OPML", () => {
    expect(parsePodcastExport(OPML, "overcast.opml")!.source).toBe("opml");
  });

  it("reads a CSV, preferring the show column over episode titles", () => {
    const csv = [
      "Podcast,Title,Publisher,Played",
      "Hard Fork,Is A.I. Coming for Our Jobs?,The New York Times,2026-10-01",
      "Hard Fork,The Ballad of Big Tech,The New York Times,2026-09-24",
      "Acquired,Costco,Ben Gilbert and David Rosenthal,2026-09-20",
    ].join("\n");
    expect(parsePodcastExport(csv)).toEqual({
      source: "csv",
      skipped: 0,
      counts: NO_COUNTS,
      items: [
        { title: "Hard Fork", author: "The New York Times" },
        { title: "Acquired", author: "Ben Gilbert and David Rosenthal" },
      ],
    });
  });

  it("reads Title/Author columns and status words", () => {
    const result = parsePodcastExport("Title,Author,Status\nSerial,This American Life,Listened\nRadiolab,WNYC,want to listen\nSwitched on Pop,Vulture,unsubscribed")!;
    expect(result.items).toEqual([
      { title: "Serial", author: "This American Life", status: "read" },
      { title: "Radiolab", author: "WNYC", status: "want" },
    ]);
    expect(result.skipped).toBe(1);
    expect(result.counts).toEqual({ read: 1, reading: 0, want: 1 });
  });

  it("returns null for anything else", () => {
    expect(parsePodcastExport("foo,bar\n1,2")).toBeNull();
    expect(parsePodcastExport("<html><body><p>Hi</p></body></html>")).toBeNull();
    expect(parsePodcastExport("")).toBeNull();
  });
});

describe("parseScreenExport: Letterboxd", () => {
  const watched = [
    "Date,Name,Year,Letterboxd URI",
    "2024-01-03,Past Lives,2023,https://boxd.it/wHYK",
    '2024-02-11,"Crouching Tiger, Hidden Dragon",2000,https://boxd.it/1Ue0',
  ].join("\n");

  it("puts watched.csv in Watched", () => {
    expect(parseScreenExport(watched, "watched.csv")).toEqual({
      source: "letterboxd",
      skipped: 0,
      counts: { read: 2, reading: 0, want: 0 },
      items: [
        { title: "Past Lives", year: 2023, format: "movie", status: "read" },
        { title: "Crouching Tiger, Hidden Dragon", year: 2000, format: "movie", status: "read" },
      ],
    });
  });

  it("puts watchlist.csv in Want to watch, judging by the file name", () => {
    const result = parseScreenExport(watched, "letterboxd-me-2026-10-14-09-12-utc/Watchlist.csv")!;
    expect(result.items.map((i) => i.status)).toEqual(["want", "want"]);
    expect(result.counts).toEqual({ read: 0, reading: 0, want: 2 });
  });

  it("reads ratings.csv as watched", () => {
    const csv = "Date,Name,Year,Letterboxd URI,Rating\n2024-05-01,Aftersun,2022,https://boxd.it/s3Fe,4.5";
    expect(parseScreenExport(csv, "ratings.csv")!.items).toEqual([{ title: "Aftersun", year: 2022, format: "movie", status: "read" }]);
  });

  it("dedupes rewatches in diary.csv but keeps same-named films from different years", () => {
    const diary = [
      "Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date",
      "2024-03-01,Dune: Part Two,2024,https://boxd.it/x1,4.5,,,2024-03-01",
      '2024-03-20,Dune: Part Two,2024,https://boxd.it/x2,5,Yes,"imax, 70mm",2024-03-19',
      "2024-04-02,Dune,1984,https://boxd.it/x3,2,,,2024-04-02",
      "2024-04-05,Dune,2021,https://boxd.it/x4,4,,,2024-04-05",
      "2024-04-09,Dune,2021,https://boxd.it/x5,4,Yes,,2024-04-09",
    ].join("\n");
    const result = parseScreenExport(diary, "diary.csv")!;
    expect(result.items).toEqual([
      { title: "Dune: Part Two", year: 2024, format: "movie", status: "read" },
      { title: "Dune", year: 1984, format: "movie", status: "read" },
      { title: "Dune", year: 2021, format: "movie", status: "read" },
    ]);
    expect(result.counts.read).toBe(3);
  });
});

describe("parseScreenExport: IMDb", () => {
  const ratings = [
    "Const,Your Rating,Date Rated,Title,Original Title,URL,Title Type,IMDb Rating,Runtime (mins),Year,Genres,Num Votes,Release Date,Directors",
    "tt0111161,10,2024-01-02,The Shawshank Redemption,The Shawshank Redemption,https://www.imdb.com/title/tt0111161/,Movie,9.3,142,1994,Drama,3000000,1994-09-23,Frank Darabont",
    'tt0903747,9,2024-01-05,Breaking Bad,Breaking Bad,https://www.imdb.com/title/tt0903747/,TV Series,9.5,49,2008,"Crime, Drama, Thriller",2200000,2008-01-20,',
    'tt7366338,10,2024-02-01,Chernobyl,Chernobyl,https://www.imdb.com/title/tt7366338/,TV Mini Series,9.3,330,2019,"Drama, History, Thriller",900000,2019-05-06,',
    'tt2301451,10,2024-02-03,Ozymandias,Ozymandias,https://www.imdb.com/title/tt2301451/,TV Episode,10,47,2013,"Crime, Drama, Thriller",250000,2013-09-15,Rian Johnson',
    'tt0133093,8,2024-02-10,The Matrix,The Matrix,https://www.imdb.com/title/tt0133093/,Movie,8.7,136,1999,"Action, Sci-Fi",2100000,1999-03-31,"Lana Wachowski, Lilly Wachowski"',
    'tt9495224,7,2024-02-12,Black Mirror: Bandersnatch,Black Mirror: Bandersnatch,https://www.imdb.com/title/tt9495224/,TV Movie,7.1,90,2018,"Drama, Mystery, Sci-Fi",150000,2018-12-28,David Slade',
    'tt2388725,8,2024-02-15,Paperman,Paperman,https://www.imdb.com/title/tt2388725/,Short,8.2,7,2012,"Animation, Short",60000,2012-11-02,John Kahrs',
    'tt0328832,7,2024-02-18,The Animatrix,The Animatrix,https://www.imdb.com/title/tt0328832/,Video,7.3,102,2003,"Animation, Sci-Fi",120000,2003-06-03,"Peter Chung, Andrew R. Jones"',
    'tt8946378,6,2024-02-20,The Rewatchables,The Rewatchables,https://www.imdb.com/title/tt8946378/,Podcast Series,7.8,,2017,Comedy,500,2017-06-15,',
  ].join("\n");

  it("reads ratings as watched, maps Title Type and skips episodes and podcasts", () => {
    expect(parseScreenExport(ratings, "ratings.csv")).toEqual({
      source: "imdb",
      skipped: 2,
      counts: { read: 7, reading: 0, want: 0 },
      items: [
        { title: "The Shawshank Redemption", author: "Frank Darabont", year: 1994, format: "movie", status: "read" },
        { title: "Breaking Bad", year: 2008, format: "tv", status: "read" },
        { title: "Chernobyl", year: 2019, format: "tv", status: "read" },
        { title: "The Matrix", author: "Lana Wachowski", year: 1999, format: "movie", status: "read" },
        { title: "Black Mirror: Bandersnatch", author: "David Slade", year: 2018, format: "movie", status: "read" },
        { title: "Paperman", author: "John Kahrs", year: 2012, format: "movie", status: "read" },
        { title: "The Animatrix", author: "Peter Chung", year: 2003, format: "movie", status: "read" },
      ],
    });
  });

  it("reads the watchlist export as Want to watch, except titles already rated", () => {
    const csv = [
      "Position,Const,Created,Modified,Description,Title,Original Title,URL,Title Type,IMDb Rating,Runtime (mins),Year,Genres,Num Votes,Release Date,Directors,Your Rating,Date Rated",
      '1,tt15239678,2024-03-01,2024-03-01,,Dune: Part Two,Dune: Part Two,https://www.imdb.com/title/tt15239678/,Movie,8.5,166,2024,"Action, Adventure, Drama",600000,2024-03-01,Denis Villeneuve,,',
      '2,tt11280740,2024-03-02,2024-03-02,,Severance,Severance,https://www.imdb.com/title/tt11280740/,TV Series,8.7,55,2022,"Drama, Mystery, Sci-Fi",300000,2022-02-18,,,',
      '3,tt1375666,2024-03-03,2024-03-03,,Inception,Inception,https://www.imdb.com/title/tt1375666/,Movie,8.8,148,2010,"Action, Sci-Fi",2600000,2010-07-16,Christopher Nolan,9,2024-05-01',
    ].join("\n");
    const result = parseScreenExport(csv, "watchlist.csv")!;
    expect(result.items).toEqual([
      { title: "Dune: Part Two", author: "Denis Villeneuve", year: 2024, format: "movie", status: "want" },
      { title: "Severance", year: 2022, format: "tv", status: "want" },
      { title: "Inception", author: "Christopher Nolan", year: 2010, format: "movie", status: "read" },
    ]);
    expect(result.counts).toEqual({ read: 1, reading: 0, want: 2 });
  });

  it("uses the file name when there's no Position column", () => {
    const csv = "Const,Title,Title Type,Year\ntt0068646,The Godfather,Movie,1972";
    expect(parseScreenExport(csv, "WATCHLIST.csv")!.items[0].status).toBe("want");
    expect(parseScreenExport(csv, "export.csv")!.items[0].status).toBeUndefined();
  });

  it("reads older exports by column name, whatever the case, with camelCase types", () => {
    const csv = [
      "position,const,created,modified,description,Title,Title type,Directors,You rated,IMDb Rating,Runtime (mins),Year,Genres,Num. Votes,Release Date (month/day/year),URL",
      "1,tt0944947,2016-01-01,2016-01-01,,Game of Thrones,tvSeries,,9,9.2,57,2011,drama,2000000,2011-04-17,https://www.imdb.com/title/tt0944947/",
      "2,tt0068646,2016-01-02,2016-01-02,,The Godfather,movie,Francis Ford Coppola,,9.2,175,1972,crime,2000000,1972-03-24,https://www.imdb.com/title/tt0068646/",
      "3,tt1480055,2016-01-03,2016-01-03,,Winter Is Coming,tvEpisode,Tim Van Patten,9,8.9,62,2011,drama,50000,2011-04-17,https://www.imdb.com/title/tt1480055/",
    ].join("\n");
    const result = parseScreenExport(csv)!;
    expect(result.source).toBe("imdb");
    expect(result.skipped).toBe(1);
    expect(result.items).toEqual([
      { title: "Game of Thrones", year: 2011, format: "tv", status: "read" },
      { title: "The Godfather", author: "Francis Ford Coppola", year: 1972, format: "movie", status: "want" },
    ]);
  });
});

describe("parseScreenExport: Netflix", () => {
  const csv = [
    "Title,Date",
    '"Severance: Season 2: Cold Harbor","3/21/25"',
    '"Glass Onion: A Knives Out Mystery","3/15/25"',
    '"Severance: Season 1: Good News About Hell","2/1/25"',
    '"Chernobyl: Limited Series: 1:23:45","1/20/25"',
    '"The Crown: Season 2: Misadventure","1/10/25"',
    '"Stranger Things: Stranger Things 4: Chapter One","1/5/25"',
    '"Black Mirror: Bandersnatch","1/1/25"',
    '"Black Mirror: Season 3: Nosedive","12/30/24"',
    '"The Crown: Season 1: Wolferton Splash","12/20/24"',
    '"Our Planet: Episode 1","12/15/24"',
    '"John Wick: Chapter 4","12/10/24"',
    '"Roma","12/1/24"',
    '"Severance: Season 1: Good News About Hell","11/30/24"',
  ].join("\n");

  it("groups episodes into shows, newest first, and keeps movie titles whole", () => {
    expect(parseScreenExport(csv, "NetflixViewingHistory.csv")).toEqual({
      source: "netflix",
      skipped: 0,
      counts: { read: 10, reading: 0, want: 0 },
      items: [
        { title: "Severance", format: "tv", status: "read" },
        { title: "Glass Onion: A Knives Out Mystery", status: "read" },
        { title: "Chernobyl", format: "tv", status: "read" },
        { title: "The Crown", format: "tv", status: "read" },
        { title: "Stranger Things", format: "tv", status: "read" },
        { title: "Black Mirror: Bandersnatch", status: "read" },
        { title: "Black Mirror", format: "tv", status: "read" },
        { title: "Our Planet", format: "tv", status: "read" },
        { title: "John Wick: Chapter 4", status: "read" },
        { title: "Roma", status: "read" },
      ],
    });
  });

  it("caps very long histories", () => {
    const rows = Array.from({ length: 2500 }, (_, i) => `"Movie ${i}","1/1/25"`);
    const result = parseScreenExport(["Title,Date", ...rows].join("\n"))!;
    expect(result.items).toHaveLength(2000);
    expect(result.counts.read).toBe(2000);
  });
});

describe("parseScreenExport: any CSV", () => {
  it("reads Title, Year, Type and Status, skipping episodes and statuses it doesn't know", () => {
    const csv = [
      "Title,Year,Type,Status,Director",
      "Arrival,2016,Movie,Watched,Denis Villeneuve",
      "The Bear,2022,TV Show,watching,",
      "Shōgun,2024,series,Want to watch,",
      "Past Lives,2023,film,to-watch,Celine Song",
      "Andor,2022,TV,Watchlist,",
      "Twin Peaks,1990,TV,dropped,",
      "Pilot,2020,Episode,watched,",
      "Arrival,2016,Movie,Watched,Denis Villeneuve",
      "Heat,,,,",
    ].join("\n");
    expect(parseScreenExport(csv, "my-movies.csv")).toEqual({
      source: "csv",
      skipped: 2,
      counts: { read: 1, reading: 1, want: 3 },
      items: [
        { title: "Arrival", author: "Denis Villeneuve", year: 2016, format: "movie", status: "read" },
        { title: "The Bear", year: 2022, format: "tv", status: "reading" },
        { title: "Shōgun", year: 2024, format: "tv", status: "want" },
        { title: "Past Lives", author: "Celine Song", year: 2023, format: "movie", status: "want" },
        { title: "Andor", year: 2022, format: "tv", status: "want" },
        { title: "Heat" },
      ],
    });
  });

  it("accepts a Name column alone", () => {
    expect(parseScreenExport("Name\nAlien\nAliens")!.items).toEqual([{ title: "Alien" }, { title: "Aliens" }]);
  });

  it("returns null for garbage", () => {
    expect(parseScreenExport("")).toBeNull();
    expect(parseScreenExport("just some words")).toBeNull();
    expect(parseScreenExport("foo,bar\n1,2")).toBeNull();
    expect(parseScreenExport(OPML, "overcast.opml")).toBeNull();
    expect(parseScreenExport("PK\u0003\u0004\u0014\u0000\u0008\u0000watched.csv\u0000\u0000")).toBeNull();
  });
});

describe("parseImport", () => {
  const BOM = "﻿";

  it("sends books to the library reader", () => {
    const result = parseImport("book", `${BOM}Title,Author,Exclusive Shelf\nDune,Frank Herbert,read`)!;
    expect(result.source).toBe("goodreads");
    expect(result.items).toEqual([{ title: "Dune", author: "Frank Herbert", isbn: undefined, status: "read" }]);
  });

  it("sends podcasts to OPML or CSV", () => {
    expect(parseImport("podcast", `${BOM}${OPML}`, "podcasts.opml")!.source).toBe("opml");
    expect(parseImport("podcast", `${BOM}Podcast\nHard Fork`)!.items).toEqual([{ title: "Hard Fork" }]);
  });

  it("sends movies & TV to the screen reader, BOM and all", () => {
    expect(parseImport("screen", `${BOM}Title,Date\n"The Crown: Season 1: Hyde Park Corner","1/2/25"`)).toEqual({
      source: "netflix",
      skipped: 0,
      counts: { read: 1, reading: 0, want: 0 },
      items: [{ title: "The Crown", format: "tv", status: "read" }],
    });
    expect(parseImport("screen", `${BOM}Date,Name,Year,Letterboxd URI\n2024-01-01,Heat,1995,https://boxd.it/2bfs`, "watchlist.csv")!.items).toEqual([
      { title: "Heat", year: 1995, format: "movie", status: "want" },
    ]);
  });

  it("returns null for garbage in every collection", () => {
    for (const kind of ["book", "podcast", "screen"] as const) expect(parseImport(kind, "lorem ipsum\ndolor sit amet")).toBeNull();
  });

  it("labels every source", () => {
    expect(SOURCE_LABEL).toEqual({
      goodreads: "Goodreads",
      storygraph: "StoryGraph",
      csv: "your file",
      opml: "your podcast app",
      letterboxd: "Letterboxd",
      imdb: "IMDb",
      netflix: "Netflix",
      "google-maps": "Google Maps",
    });
  });
});

describe("isBookBarcode", () => {
  it("accepts Bookland EAN-13 only", () => {
    expect(isBookBarcode("9780812968255")).toBe(true);
    expect(isBookBarcode("4006381333931")).toBe(false);
  });
});

describe("parsePlacesExport", () => {
  it("reads a Google Maps saved list, keeping notes", () => {
    const csv = `Title,Note,URL,Tags,Comment
,,,,
Casa Montaña,Get the anchovies,https://www.google.com/maps/place/Casa+Monta%C3%B1a/data=x,,
Mercado Central,,https://www.google.com/maps/place/Mercado+Central/data=y,,Go early
Casa Montaña,,https://www.google.com/maps/place/dup,,
`;
    const r = parseImport("place", csv)!;
    expect(r.source).toBe("google-maps");
    expect(r.items).toEqual([
      { title: "Casa Montaña", note: "Get the anchovies" },
      { title: "Mercado Central", note: "Go early" },
    ]);
  });

  it("reads Saved Places.json in both Takeout shapes", () => {
    const json = JSON.stringify({
      type: "FeatureCollection",
      features: [
        { properties: { location: { name: "Time Out Market", address: "Lisbon" }, comment: "Lunch" } },
        { properties: { Title: "Pastéis de Belém", Location: { "Business Name": "Pastéis de Belém" } } },
        { properties: {} },
      ],
    });
    const r = parseImport("place", json)!;
    expect(r.items.map((i) => [i.title, i.note])).toEqual([
      ["Time Out Market", "Lunch"],
      ["Pastéis de Belém", undefined],
    ]);
    expect(r.skipped).toBe(1);
  });

  it("rejects files without names", () => {
    expect(parseImport("place", "Address,City\nfoo,bar")).toBeNull();
    expect(parseImport("place", "{not json")).toBeNull();
  });
});
