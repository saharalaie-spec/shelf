import { categorizePodcast, categorizeScreen } from "./genres";
import { rankPodcasts } from "./podcasts";
import { parseScreenQuery, rankScreen, type ScreenHit, type ScreenOpts } from "./screen";
import type { Hit } from "./types";

// Small offline catalogs used when BOOKS_PROVIDER=fixture (tests, or working without network).
// Genres are raw, the way Apple, TMDB and TVmaze name them, so they go through the same mapping.

// [title, host or publisher, Apple genres]
const PODCASTS: [string, string, string[]][] = [
  ["Huberman Lab", "Scicomm Media", ["Health & Fitness", "Podcasts", "Science"]],
  ["The Daily", "The New York Times", ["Daily News", "Podcasts", "News"]],
  ["Serial", "Serial Productions & The New York Times", ["True Crime", "Podcasts", "News"]],
  ["Radiolab", "WNYC Studios", ["Science", "Podcasts", "Natural Sciences"]],
  ["99% Invisible", "Roman Mars", ["Design", "Podcasts", "Arts"]],
  ["Dan Carlin's Hardcore History", "Dan Carlin", ["History", "Podcasts"]],
  ["The Joe Rogan Experience", "Joe Rogan", ["Comedy", "Podcasts", "Society & Culture"]],
  ["Lex Fridman Podcast", "Lex Fridman", ["Technology", "Podcasts", "Science"]],
  ["This American Life", "This American Life", ["Society & Culture", "Podcasts"]],
  ["Freakonomics Radio", "Freakonomics Radio + Stitcher", ["Society & Culture", "Podcasts", "Business"]],
  ["How I Built This with Guy Raz", "Guy Raz | Wondery", ["Entrepreneurship", "Podcasts", "Business"]],
  ["Acquired", "Ben Gilbert and David Rosenthal", ["Business", "Podcasts", "Technology"]],
  ["Planet Money", "NPR", ["Business", "Podcasts", "Investing"]],
  ["Stuff You Should Know", "iHeartPodcasts", ["Education", "Podcasts", "Society & Culture"]],
  ["Conan O'Brien Needs A Friend", "Team Coco & Earwolf", ["Comedy", "Podcasts", "Comedy Interviews"]],
  ["The Tim Ferriss Show", "Tim Ferriss", ["Education", "Podcasts", "Self-Improvement", "Business"]],
  ["Hidden Brain", "Hidden Brain, Shankar Vedantam", ["Social Sciences", "Podcasts", "Science"]],
  ["Making Sense with Sam Harris", "Sam Harris", ["Philosophy", "Podcasts", "Society & Culture"]],
  ["SmartLess", "Jason Bateman, Sean Hayes, Will Arnett", ["Comedy", "Podcasts"]],
  ["Call Her Daddy", "Alex Cooper", ["Relationships", "Podcasts", "Comedy"]],
  ["Crime Junkie", "audiochuck", ["True Crime", "Podcasts"]],
  ["Philosophize This!", "Stephen West", ["Philosophy", "Podcasts", "Education"]],
  ["The Rest Is History", "Goalhanger", ["History", "Podcasts"]],
  ["Dateline NBC", "NBC News", ["True Crime", "Podcasts"]],
  ["Song Exploder", "Hrishikesh Hirway", ["Music", "Podcasts", "Music Interviews"]],
];

// [title, format, year, director or network, genres]
const SCREEN: [string, "movie" | "tv", number, string, string[]][] = [
  ["Dune", "movie", 2021, "Denis Villeneuve", ["Science Fiction", "Adventure"]],
  ["Dune: Part Two", "movie", 2024, "Denis Villeneuve", ["Science Fiction", "Adventure"]],
  ["Dune", "movie", 1984, "David Lynch", ["Sci-Fi & Fantasy"]],
  ["Oppenheimer", "movie", 2023, "Christopher Nolan", ["Drama", "History"]],
  ["Inception", "movie", 2010, "Christopher Nolan", ["Action", "Science Fiction", "Adventure"]],
  ["Interstellar", "movie", 2014, "Christopher Nolan", ["Adventure", "Drama", "Science Fiction"]],
  ["Parasite", "movie", 2019, "Bong Joon Ho", ["Comedy", "Thriller", "Drama"]],
  ["Spirited Away", "movie", 2001, "Hayao Miyazaki", ["Anime"]],
  ["The Godfather", "movie", 1972, "Francis Ford Coppola", ["Drama", "Crime"]],
  ["Pulp Fiction", "movie", 1994, "Quentin Tarantino", ["Thriller", "Crime"]],
  ["Everything Everywhere All at Once", "movie", 2022, "Daniel Kwan & Daniel Scheinert", ["Action", "Adventure", "Science Fiction"]],
  ["Past Lives", "movie", 2023, "Celine Song", ["Drama", "Romance"]],
  ["Barbie", "movie", 2023, "Greta Gerwig", ["Comedy", "Adventure"]],
  ["The Social Network", "movie", 2010, "David Fincher", ["Drama"]],
  ["Arrival", "movie", 2016, "Denis Villeneuve", ["Drama", "Science Fiction", "Mystery"]],
  ["Before Sunrise", "movie", 1995, "Richard Linklater", ["Romance"]],
  ["Amélie", "movie", 2001, "Jean-Pierre Jeunet", ["Comedy", "Romance"]],
  ["Whiplash", "movie", 2014, "Damien Chazelle", ["Drama", "Music"]],
  ["Get Out", "movie", 2017, "Jordan Peele", ["Horror"]],
  ["La La Land", "movie", 2016, "Damien Chazelle", ["Comedy", "Drama", "Romance"]],
  ["Severance", "tv", 2022, "Apple TV+", ["Drama", "Mystery", "Science-Fiction"]],
  ["The Bear", "tv", 2022, "FX", ["Drama", "Comedy", "Food"]],
  ["Succession", "tv", 2018, "HBO", ["Drama"]],
  ["Breaking Bad", "tv", 2008, "AMC", ["Drama", "Crime", "Thriller"]],
  ["The Office", "tv", 2005, "NBC", ["Comedy"]],
  ["Fleabag", "tv", 2016, "BBC Three", ["Comedy", "Drama"]],
  ["Ted Lasso", "tv", 2020, "Apple TV+", ["Comedy", "Sports"]],
  ["The Wire", "tv", 2002, "HBO", ["Drama", "Crime"]],
  ["Game of Thrones", "tv", 2011, "HBO", ["Sci-Fi & Fantasy", "Drama", "Action & Adventure"]],
  ["Planet Earth", "tv", 2006, "BBC One", ["Documentary", "Nature"]],
  ["Chernobyl", "tv", 2019, "HBO", ["Drama", "History"]],
  ["The Crown", "tv", 2016, "Netflix", ["Drama", "History"]],
  ["Stranger Things", "tv", 2016, "Netflix", ["Drama", "Fantasy", "Science-Fiction", "Horror"]],
  ["Shōgun", "tv", 2024, "FX", ["Drama", "War & Politics"]],
  ["Mad Men", "tv", 2007, "AMC", ["Drama"]],
  ["The Last of Us", "tv", 2023, "HBO", ["Drama", "Action & Adventure", "Sci-Fi & Fantasy"]],
  ["Normal People", "tv", 2020, "BBC Three", ["Drama", "Romance"]],
  ["Atlanta", "tv", 2016, "FX", ["Comedy", "Drama"]],
  ["True Detective", "tv", 2014, "HBO", ["Drama", "Crime", "Mystery"]],
  ["Abbott Elementary", "tv", 2021, "ABC", ["Comedy"]],
  ["Black Mirror", "tv", 2011, "Channel 4", ["Drama", "Science-Fiction", "Thriller"]],
];

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ'’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const slug = (s: string) => norm(s).replace(/ /g, "-");

const PODCAST_HITS: Hit[] = PODCASTS.map(([title, author, genres]) => ({
  key: `fx:pod:${slug(title)}`,
  title,
  author,
  year: null,
  coverUrl: null,
  categories: categorizePodcast(genres),
}));

const SCREEN_HITS: ScreenHit[] = SCREEN.map(([title, format, year, author, genres]) => ({
  key: `fx:screen:${slug(title)}-${year}`,
  title,
  author,
  year,
  coverUrl: null,
  categories: categorizeScreen(genres, format),
  format,
}));

/** Every query word starts a word of the title or the author. */
function matches(h: Hit, text: string) {
  const words = norm(text).split(" ").filter(Boolean);
  const hay = norm(`${h.title} ${h.author ?? ""}`).split(" ");
  return words.length > 0 && words.every((w) => hay.some((t) => t.startsWith(w)));
}

export function fixturePodcasts(text: string, limit: number): Hit[] {
  return rankPodcasts(
    PODCAST_HITS.filter((h) => matches(h, text)),
    text,
  ).slice(0, limit);
}

export function fixtureScreen(text: string, limit: number, opts: ScreenOpts = {}): Hit[] {
  const query = parseScreenQuery(text, opts);
  return rankScreen([SCREEN_HITS.filter((h) => matches(h, query.title))], query, limit);
}
