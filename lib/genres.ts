/** Podcast categories we auto-assign, like CATEGORIES in lib/categories.ts for books. Users can also type their own. */
export const PODCAST_CATEGORIES = [
  "True Crime",
  "Comedy",
  "News & Politics",
  "Society & Culture",
  "History",
  "Science",
  "Business",
  "Technology",
  "Health & Fitness",
  "Education",
  "Arts",
  "Music",
  "TV & Film",
  "Sports",
  "Fiction",
  "Religion & Spirituality",
  "Kids & Family",
  "Leisure",
] as const;

/** Movie & TV categories. The first two are the formats; every hit leads with one of them. */
export const SCREEN_CATEGORIES = [
  "Movies",
  "TV",
  "Drama",
  "Comedy",
  "Action & Adventure",
  "Thriller",
  "Crime",
  "Mystery",
  "Sci-Fi & Fantasy",
  "Horror",
  "Romance",
  "Animation",
  "Documentary",
  "Family",
  "History & War",
  "Music",
  "Reality",
  "Western",
] as const;

type PodcastCategory = (typeof PODCAST_CATEGORIES)[number];
type ScreenCategory = (typeof SCREEN_CATEGORIES)[number];

// Apple's podcast genres and subgenres. One raw genre can land in two categories ("Comedy Fiction").
const PODCAST_RULES: [PodcastCategory, RegExp][] = [
  ["Kids & Family", /\bkids\b|family|parenting|children|pets & animals/],
  ["True Crime", /crime/],
  ["Fiction", /fiction|drama/],
  ["Comedy", /comedy|improv|stand-?up/],
  ["Sports", /sport|baseball|basketball|football|soccer|hockey|tennis|golf|cricket|rugby|wrestling|running|swimming|volleyball|wilderness/],
  ["Business", /business|entrepreneur|investing|careers|management|marketing|non-profit|econom|finance/],
  ["Technology", /tech/],
  ["Health & Fitness", /health|fitness|medicine|nutrition|sexuality/],
  ["Religion & Spirituality", /religio|spiritual|buddhism|christian|hinduism|islam|judaism|bible/],
  ["Science", /(?<!political )science(?! fiction)|astronomy|chemistry|physics|mathematics|nature/],
  ["History", /histor/],
  ["Music", /music/],
  ["TV & Film", /\btv\b|film|after shows/],
  ["News & Politics", /news|politic|government/],
  ["Education", /education|courses|how to|language learning|self-improvement/],
  ["Arts", /\barts?\b|books|design|fashion|beauty|food/],
  ["Society & Culture", /society|culture|documentary|personal journals|philosophy|places & travel|relationships/],
  ["Leisure", /leisure|hobbies|games|crafts|home & garden|automotive|aviation|animation/],
];

// Apple's movie genres, TMDB's movie and TV genres, and TVmaze's genres and show types.
const SCREEN_RULES: [ScreenCategory, RegExp][] = [
  ["Sci-Fi & Fantasy", /sci-?fi|science[ -]fiction|fantasy|supernatural/],
  ["Action & Adventure", /action|adventure|martial arts|disaster/],
  ["Animation", /animation|animated|anime/],
  ["Documentary", /documentar|docuseries|^nature$/],
  ["Comedy", /comedy|sitcom|stand-?up/],
  ["Drama", /drama|soap|medical|legal/],
  ["Thriller", /thriller|suspense|espionage/],
  ["Crime", /crime|police|heist|gangster|detective/],
  ["Mystery", /mystery|whodunit/],
  ["Horror", /horror|slasher|zombie/],
  ["Romance", /romance|romantic/],
  ["Family", /family|\bkids\b|children|holiday/],
  ["History & War", /histor|\bwar\b|military/],
  ["Music", /music|concert/],
  ["Reality", /reality|game show|competition/],
  ["Western", /western/],
];

function mapGenres<C extends string>(genres: string[], rules: [C, RegExp][]): C[] {
  const out = new Set<C>();
  for (const genre of genres.slice(0, 20)) {
    const g = genre.toLowerCase().trim();
    for (const [category, re] of rules) if (re.test(g)) out.add(category);
  }
  return [...out];
}

/** Map Apple podcast genres ("Daily News", "Stories for Kids") to at most four friendly categories. */
export function categorizePodcast(genres: string[]): string[] {
  return mapGenres(
    genres.filter((g) => g !== "Podcasts"),
    PODCAST_RULES,
  ).slice(0, 4);
}

/** The format ("Movies" or "TV") first, then up to three genres mapped from Apple, TMDB or TVmaze names. */
export function categorizeScreen(genres: string[], format: "movie" | "tv"): string[] {
  return [format === "tv" ? "TV" : "Movies", ...mapGenres(genres, SCREEN_RULES).slice(0, 3)];
}
