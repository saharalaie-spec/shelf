/** The categories we auto-assign. Users can also type their own. */
export const CATEGORIES = [
  "Fiction",
  "Classics",
  "Philosophy",
  "Psychology",
  "Science",
  "History",
  "Biography & Memoir",
  "Business",
  "Economics",
  "Self-Help",
  "Politics & Society",
  "Religion & Spirituality",
  "Poetry",
  "Science Fiction",
  "Fantasy",
  "Mystery & Thriller",
  "Romance",
  "Art & Design",
  "Technology",
  "Health",
  "Travel",
  "Children's",
] as const;

const RULES: [string, RegExp][] = [
  ["Philosophy", /philosoph|\bethics?\b|stoic|metaphysic|existential|epistemolog|\blogic\b|phenomenolog|nihilism|aesthetics|platonism|utilitarian/],
  ["Psychology", /psycholog|cognit|behavio|neuroscien|happiness|decision making|emotions|mind and body/],
  ["Science Fiction", /science fiction|sci-fi|dystopia|space opera|time travel|cyberpunk|robots/],
  ["Fantasy", /fantasy|magic|wizards|dragons|epic fantasy/],
  ["Mystery & Thriller", /mystery|detective|thriller|suspense|crime fiction|murder/],
  ["Romance", /romance|love stories/],
  ["Poetry", /poetry|poems|\bverse\b|sonnets/],
  ["Classics", /classic|early works to 1800|ancient literature/],
  ["Fiction", /fiction|novel|short stories|literature/],
  ["Science", /(?<!political |social |computer )\bscience\b(?! fiction)|physics|biology|chemistry|astronomy|cosmology|evolution|mathematic|genetics|ecology/],
  ["History", /history|historical|civilization|world war|ancient|medieval/],
  ["Biography & Memoir", /biograph|memoir|autobiograph|personal narratives/],
  ["Economics", /econom|finance|investment|money|capitalism/],
  ["Business", /business|management|leadership|entrepreneur|marketing|startups|success in business/],
  ["Self-Help", /self-help|self-actualization|personal development|habits|motivation|conduct of life|productivity/],
  ["Politics & Society", /politic|sociology|society|social|government|democracy|feminism|race relations/],
  ["Religion & Spirituality", /religio|spiritual|buddhis|christian|theology|bible|meditation|islam|judaism|tao/],
  ["Art & Design", /\bart\b|design|architecture|photography|painting|music/],
  ["Technology", /technolog|computer|software|programming|internet|artificial intelligence/],
  ["Health", /health|nutrition|medicine|fitness|diet|sleep/],
  ["Travel", /travel|voyages/],
  ["Children's", /juvenile|children|picture books/],
];

const FICTION_GENRES = new Set(["Science Fiction", "Fantasy", "Mystery & Thriller", "Romance"]);

/** Map messy catalog subjects ("Philosophy, Ancient", "Stoics") to at most two friendly categories. */
export function categorize(subjects: string[]): string[] {
  const scores = new Map<string, number>();
  for (const subject of subjects.slice(0, 40)) {
    const s = subject.toLowerCase();
    for (const [category, re] of RULES) {
      if (re.test(s)) scores.set(category, (scores.get(category) ?? 0) + 1);
    }
  }
  // "Fiction" matches almost everything a genre book is tagged with; let the genre win.
  if ([...scores.keys()].some((c) => FICTION_GENRES.has(c))) scores.delete("Fiction");
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || order(a[0]) - order(b[0]))
    .slice(0, 2)
    .map(([c]) => c);
}

const order = (c: string) => {
  const i = CATEGORIES.indexOf(c as (typeof CATEGORIES)[number]);
  return i === -1 ? 99 : i;
};
