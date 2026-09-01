/**
 * Books · the waiting list of physical books (spec §4.3).
 * Seeded once from BOOK_SEED (matched by slug, never by title). Ali can add more.
 */

export type BookStatus = "queue" | "reading" | "finished";

export type Book = {
  id: number;
  slug: string | null;       // stable id for seeded books
  title: string;
  subtitle: string | null;
  author: string;
  isbn: string | null;
  coverUrl: string | null;
  covers: string | null;     // "what this book covers"
  payoff: string | null;     // "what I'll get out of it"
  pages: number | null;
  year: number | null;
  status: BookStatus;
  sortOrder: number;
  startedAt: number | null;  // ms
  finishedAt: number | null; // ms
};

export type BooksData = { books: Book[] };

/** Open Library cover by ISBN (no key needed). */
export function coverByIsbn(isbn: string, size: "S" | "M" | "L" = "L"): string {
  return `https://covers.openlibrary.org/b/isbn/${isbn}-${size}.jpg`;
}

export type BookSeedEntry = Omit<Book, "id" | "status" | "startedAt" | "finishedAt"> & { slug: string };

/**
 * Researched editions (2026-08-30). Covers verified to load.
 *  - Chidiac: Undercover Publishing House 2025 · not on Open Library, cover via Google Books.
 *  - Toon: Torva (Transworld) UK paperback 2024 · Open Library cover id 14857421.
 *  - Bartlett: Ebury Edge UK hardback 2023 · the author is Steven Bartlett (brief said Nigel Toon by mistake).
 *  - Peterson: Allen Lane UK 2018.
 *  - Clear: Random House Business UK 2018.
 */
export const BOOK_SEED: BookSeedEntry[] = [
  {
    slug: "chidiac-stop-letting",
    title: "Stop Letting Everything Affect You",
    subtitle: "How to break free from overthinking, emotional chaos and self-sabotage",
    author: "Daniel Chidiac",
    isbn: "9781764110808",
    coverUrl: "https://books.google.com/books/content?id=1F1xEQAAQBAJ&printsec=frontcover&img=1&zoom=1",
    covers: "Why small things hit so hard: overthinking loops, taking things personally, reacting instead of choosing. Short chapters, each ending in a practical reset you can apply the same day.",
    payoff: "A calmer default. Fewer spirals after a message, a comment or a bad meeting · and a repeatable way to step back before reacting.",
    pages: 188,
    year: 2025,
    sortOrder: 10,
  },
  {
    slug: "toon-how-ai-thinks",
    title: "How AI Thinks",
    subtitle: "How we built it, how it can help us, and how we can control it",
    author: "Nigel Toon",
    isbn: "9781911709473",
    coverUrl: "https://covers.openlibrary.org/b/id/14857421-L.jpg",
    covers: "A plain-language tour of how modern AI actually works, from the founder of chip company Graphcore: neural networks, training, why it needs so much compute, where it fails, and how we keep control of it.",
    payoff: "The mental model behind the tools I build with every day · so I can judge what AI can and can't do, and explain it to non-technical people with confidence.",
    pages: 320,
    year: 2024,
    sortOrder: 20,
  },
  {
    slug: "bartlett-diary-ceo",
    title: "The Diary of a CEO",
    subtitle: "The 33 Laws of Business and Life",
    author: "Steven Bartlett",
    isbn: "9781529146509",
    coverUrl: coverByIsbn("9781529146509"),
    covers: "33 short 'laws' drawn from the podcast and Bartlett's own companies, grouped into four pillars: the self, the story, the philosophy, the team. Psychology and behavioural science, told through stories.",
    payoff: "Sharper instincts for building products and teams: how to tell a story, when to say no, how to keep standards high · in a format that's easy to read in ten-minute chunks.",
    pages: 368,
    year: 2023,
    sortOrder: 30,
  },
  {
    slug: "peterson-12-rules",
    title: "12 Rules for Life",
    subtitle: "An Antidote to Chaos",
    author: "Jordan B. Peterson",
    isbn: "9780241351635",
    coverUrl: coverByIsbn("9780241351635"),
    covers: "Twelve rules for living with order and meaning · from 'stand up straight' to 'tell the truth'. Mixes clinical psychology, myth, religion and personal stories. Long chapters; dense but readable.",
    payoff: "A framework for discipline and responsibility that goes deeper than habit tips: why structure matters and how to hold a standard when nobody is watching.",
    pages: 409,
    year: 2018,
    sortOrder: 40,
  },
  {
    slug: "clear-atomic-habits",
    title: "Atomic Habits",
    subtitle: "Tiny Changes, Remarkable Results",
    author: "James Clear",
    isbn: "9781847941831",
    coverUrl: coverByIsbn("9781847941831"),
    covers: "The four laws of behaviour change · make it obvious, attractive, easy, satisfying · and how tiny 1% improvements compound. Very practical, full of examples and checklists.",
    payoff: "The playbook behind this app's routine and habit system: how to make stretching, breathing and reading automatic, and how to promote a habit from 'building' to 'routine'.",
    pages: 320,
    year: 2018,
    sortOrder: 50,
  },
];
