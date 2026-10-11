import { categorize } from "./categories";
import type { BookHit } from "./types";

// A small offline catalog used when BOOKS_PROVIDER=fixture (tests, or working without network).
// [title, author, year, isbn13, subjects]
const RAW: [string, string, number, string, string[]][] = [
  ["Meditations", "Marcus Aurelius", 180, "9780812968255", ["Stoics", "Ethics", "Philosophy, Ancient", "Early works to 1800"]],
  ["Beyond Good and Evil", "Friedrich Nietzsche", 1886, "9780679724650", ["Philosophy, German", "Ethics", "Nihilism"]],
  ["Thus Spoke Zarathustra", "Friedrich Nietzsche", 1883, "9780140441185", ["Philosophy", "Superman (Philosophical concept)"]],
  ["The Myth of Sisyphus", "Albert Camus", 1942, "9780679733737", ["Absurd (Philosophy)", "Existentialism", "Philosophy"]],
  ["The Stranger", "Albert Camus", 1942, "9780679720201", ["Fiction", "Existentialism", "French literature", "Classic Literature"]],
  ["The Republic", "Plato", -375, "9780465069347", ["Political science", "Philosophy, Ancient", "Utopias", "Early works to 1800"]],
  ["Nicomachean Ethics", "Aristotle", -340, "9780226026756", ["Ethics", "Philosophy, Ancient"]],
  ["Letters from a Stoic", "Seneca", 65, "9780140442106", ["Stoics", "Ethics", "Philosophy, Ancient"]],
  ["Being and Time", "Martin Heidegger", 1927, "9780061575594", ["Ontology", "Phenomenology", "Philosophy"]],
  ["Critique of Pure Reason", "Immanuel Kant", 1781, "9780521657297", ["Epistemology", "Metaphysics", "Philosophy, German"]],
  ["Man's Search for Meaning", "Viktor E. Frankl", 1946, "9780807014295", ["Psychology", "Holocaust survivors", "Biography", "Existential psychotherapy"]],
  ["Thinking, Fast and Slow", "Daniel Kahneman", 2011, "9780374533557", ["Thought and thinking", "Decision making", "Psychology", "Cognitive psychology"]],
  ["Sapiens", "Yuval Noah Harari", 2011, "9780062316097", ["Human evolution", "Civilization", "History", "Social evolution"]],
  ["Homo Deus", "Yuval Noah Harari", 2015, "9780062464316", ["Civilization", "Forecasting", "History", "Technology and civilization"]],
  ["Guns, Germs, and Steel", "Jared Diamond", 1997, "9780393317558", ["Civilization", "History", "Social evolution"]],
  ["A Brief History of Time", "Stephen Hawking", 1988, "9780553380163", ["Cosmology", "Science", "Astronomy"]],
  ["The Selfish Gene", "Richard Dawkins", 1976, "9780198788607", ["Genetics", "Evolution (Biology)", "Science"]],
  ["Cosmos", "Carl Sagan", 1980, "9780345539434", ["Astronomy", "Cosmology", "Science"]],
  ["The Black Swan", "Nassim Nicholas Taleb", 2007, "9780812973815", ["Uncertainty", "Forecasting", "Economics", "Probability"]],
  ["Antifragile", "Nassim Nicholas Taleb", 2012, "9780812979688", ["Uncertainty", "Economics", "Philosophy"]],
  ["Atomic Habits", "James Clear", 2018, "9780735211292", ["Habits", "Self-help", "Behavior modification"]],
  ["The Power of Now", "Eckhart Tolle", 1997, "9781577314806", ["Spiritual life", "Self-actualization", "Religion"]],
  ["Zero to One", "Peter Thiel", 2014, "9780804139298", ["Business", "Entrepreneurship", "New business enterprises"]],
  ["The Lean Startup", "Eric Ries", 2011, "9780307887894", ["Business", "Startups", "Management"]],
  ["Steve Jobs", "Walter Isaacson", 2011, "9781451648539", ["Biography", "Computer engineers", "Business"]],
  ["Educated", "Tara Westover", 2018, "9780399590504", ["Memoir", "Autobiography", "Education"]],
  ["1984", "George Orwell", 1949, "9780451524935", ["Fiction", "Dystopias", "Totalitarianism", "Classic Literature"]],
  ["Animal Farm", "George Orwell", 1945, "9780451526342", ["Fiction", "Political fiction", "Satire", "Classic Literature"]],
  ["Brave New World", "Aldous Huxley", 1932, "9780060850524", ["Science fiction", "Dystopias", "Fiction"]],
  ["Dune", "Frank Herbert", 1965, "9780441172719", ["Science fiction", "Fiction", "Space opera"]],
  ["The Left Hand of Darkness", "Ursula K. Le Guin", 1969, "9780441478125", ["Science fiction", "Fiction", "Gender identity"]],
  ["The Hobbit", "J.R.R. Tolkien", 1937, "9780547928227", ["Fantasy fiction", "Fiction", "Dragons", "Wizards"]],
  ["The Name of the Wind", "Patrick Rothfuss", 2007, "9780756404741", ["Fantasy fiction", "Fiction", "Magic"]],
  ["Pride and Prejudice", "Jane Austen", 1813, "9780141439518", ["Fiction", "Romance", "Classic Literature", "Courtship"]],
  ["Crime and Punishment", "Fyodor Dostoevsky", 1866, "9780143058144", ["Fiction", "Classic Literature", "Murder", "Psychological fiction"]],
  ["The Brothers Karamazov", "Fyodor Dostoevsky", 1880, "9780374528379", ["Fiction", "Classic Literature", "Philosophical fiction"]],
  ["Anna Karenina", "Leo Tolstoy", 1877, "9780143035008", ["Fiction", "Classic Literature", "Russian literature"]],
  ["One Hundred Years of Solitude", "Gabriel García Márquez", 1967, "9780060883287", ["Fiction", "Magic realism", "Literature"]],
  ["Norwegian Wood", "Haruki Murakami", 1987, "9780375704024", ["Fiction", "Japanese literature", "Love stories"]],
  ["Kafka on the Shore", "Haruki Murakami", 2002, "9781400079278", ["Fiction", "Japanese literature", "Magic realism"]],
  ["The Great Gatsby", "F. Scott Fitzgerald", 1925, "9780743273565", ["Fiction", "Classic Literature", "American literature"]],
  ["The Girl with the Dragon Tattoo", "Stieg Larsson", 2005, "9780307454546", ["Fiction", "Mystery", "Thriller", "Detective and mystery stories"]],
  ["Gone Girl", "Gillian Flynn", 2012, "9780307588371", ["Fiction", "Thriller", "Suspense", "Missing persons"]],
  ["Leaves of Grass", "Walt Whitman", 1855, "9780140421996", ["Poetry", "American poetry"]],
  ["The Prophet", "Kahlil Gibran", 1923, "9780394404288", ["Poetry", "Spiritual life", "Prose poems"]],
  ["Siddhartha", "Hermann Hesse", 1922, "9780553208849", ["Fiction", "Buddhism", "Spiritual life", "Classic Literature"]],
  ["The Wealth of Nations", "Adam Smith", 1776, "9780553585971", ["Economics", "Early works to 1800"]],
  ["Capital in the Twenty-First Century", "Thomas Piketty", 2013, "9780674430006", ["Economics", "Capitalism", "Income distribution"]],
  ["The Design of Everyday Things", "Don Norman", 1988, "9780465050659", ["Design", "Industrial design", "Psychology"]],
  ["Gödel, Escher, Bach", "Douglas Hofstadter", 1979, "9780465026562", ["Artificial intelligence", "Logic", "Mathematics", "Philosophy"]],
  ["The Little Prince", "Antoine de Saint-Exupéry", 1943, "9780156012195", ["Juvenile fiction", "Fiction", "Classic Literature"]],
  ["Into the Wild", "Jon Krakauer", 1996, "9780385486804", ["Biography", "Travel", "Wilderness survival"]],
  ["Why We Sleep", "Matthew Walker", 2017, "9781501144318", ["Sleep", "Health", "Neuroscience"]],
  ["The Second Sex", "Simone de Beauvoir", 1949, "9780307277787", ["Feminism", "Women", "Philosophy", "Social conditions"]],
];

const BOOKS: (BookHit & { isbn: string })[] = RAW.map(([title, author, year, isbn, subjects]) => ({
  key: `fx:${isbn}`,
  title,
  author,
  year,
  isbn,
  coverUrl: null,
  categories: categorize(subjects),
}));

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ");

export function fixtureSearch(
  query: { q?: string; title?: string; author?: string; isbn?: string },
  limit: number,
): BookHit[] {
  let hits: typeof BOOKS;
  if (query.isbn) {
    hits = BOOKS.filter((b) => b.isbn === query.isbn);
  } else {
    const titleWords = norm(query.title ?? query.q ?? "").split(/\s+/).filter(Boolean);
    const authorWords = norm(query.author ?? "").split(/\s+/).filter(Boolean);
    hits = BOOKS.filter((b) => {
      const hay = norm(query.title ? b.title : `${b.title} ${b.author}`);
      const authorHay = norm(b.author ?? "");
      return (
        titleWords.length > 0 &&
        titleWords.every((w) => hay.split(/\s+/).some((t) => t.startsWith(w))) &&
        authorWords.every((w) => authorHay.split(/\s+/).some((t) => t.startsWith(w)))
      );
    });
  }
  return hits.slice(0, limit).map(({ isbn, ...b }) => b);
}
