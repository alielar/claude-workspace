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
  // ── Batch 2 (2026-09-11) · Ali's own reasons in `payoff` ("read once", "underrated"…) ──
  //  - Knight: Simon & Schuster UK paperback 2018 (ISBN 9781471146725).
  //  - Horowitz: Harper Business hardback 2014 (ISBN 9780062273208).
  //  - Hormozi: Acquisition.com Publishing paperback 2021 (ISBN 9781737475712).
  //  - Housel: Harriman House paperback 2020 (ISBN 9780857197689).
  //  - Voss: Random House Business UK paperback 2017 (ISBN 9781847941497).
  //  - Gerber: HarperBusiness 1995 edition (ISBN 9780887307287).
  {
    slug: "knight-shoe-dog",
    title: "Shoe Dog",
    subtitle: "A memoir by the creator of Nike",
    author: "Phil Knight",
    isbn: "9781471146725",
    coverUrl: coverByIsbn("9781471146725"),
    covers: "Nike's founder tells the first twenty years straight: selling Japanese running shoes from the boot of a car, banks refusing credit, lawsuits, a business that nearly died every year before it became Nike. Honest about the doubt and the mistakes.",
    payoff: "Read once already. Teaches resilience: how it feels to keep going when the money is not there and nobody believes the plan, and why the founder's stubbornness mattered more than any strategy.",
    pages: 400,
    year: 2018,
    sortOrder: 60,
  },
  {
    slug: "horowitz-hard-thing",
    title: "The Hard Thing About Hard Things",
    subtitle: "Building a business when there are no easy answers",
    author: "Ben Horowitz",
    isbn: "9780062273208",
    coverUrl: coverByIsbn("9780062273208"),
    covers: "A founder-turned-investor on the parts of running a company nobody teaches: firing people, demoting a friend, managing your own psychology, hiring executives, when to sell. Built from his years as CEO of Opsware, then Andreessen Horowitz.",
    payoff: "How to operate and build a company step by step: the concrete moves for the hard moments, not the inspiring ones, from someone who lived them.",
    pages: 304,
    year: 2014,
    sortOrder: 70,
  },
  {
    slug: "hormozi-100m-offers",
    title: "$100M Offers",
    subtitle: "How to make offers so good people feel stupid saying no",
    author: "Alex Hormozi",
    isbn: "9781737475712",
    coverUrl: coverByIsbn("9781737475712"),
    covers: "A method for building an offer: pick a market that is in pain and can pay, raise the perceived value instead of cutting the price, stack the deliverables, add guarantees, scarcity and urgency, then name it. Short, direct, full of worked examples.",
    payoff: "Underrated despite the sales record. Breaks down pricing, the most important thing in any business: how to charge more by changing what is offered rather than discounting, straight into easypeasy's offers.",
    pages: 164,
    year: 2021,
    sortOrder: 80,
  },
  {
    slug: "housel-psychology-money",
    title: "The Psychology of Money",
    subtitle: "Timeless lessons on wealth, greed, and happiness",
    author: "Morgan Housel",
    isbn: "9780857197689",
    coverUrl: coverByIsbn("9780857197689"),
    covers: "Nineteen short stories about how people actually behave with money: luck and risk, why enough is hard to feel, compounding, tail events, room for error, and why staying wealthy is a different skill from getting wealthy.",
    payoff: "Underrated. How to take risk: size bets so a bad outcome does not end the game, keep room for error, and stop treating money decisions as maths problems when they are behaviour problems.",
    pages: 256,
    year: 2020,
    sortOrder: 90,
  },
  {
    slug: "voss-never-split",
    title: "Never Split the Difference",
    subtitle: "Negotiating as if your life depended on it",
    author: "Chris Voss with Tahl Raz",
    isbn: "9781847941497",
    coverUrl: coverByIsbn("9781847941497"),
    covers: "A former FBI hostage negotiator's toolkit adapted to business and life: mirroring, labelling emotions, calibrated 'how' questions, getting to 'that's right', the late-night FM DJ voice, and why a good 'no' beats a fake 'yes'.",
    payoff: "Very underrated. How to actually negotiate: tactical empathy that works on real sales calls and in real conversations, not the theory of compromise.",
    pages: 288,
    year: 2017,
    sortOrder: 100,
  },
  {
    slug: "gerber-emyth-revisited",
    title: "The E-Myth Revisited",
    subtitle: "Why most small businesses don't work and what to do about it",
    author: "Michael E. Gerber",
    isbn: "9780887307287",
    coverUrl: coverByIsbn("9780887307287"),
    covers: "Why technicians who start businesses end up owning a job, not a company. The three roles (entrepreneur, manager, technician), the franchise prototype idea, and working ON the business through documented systems so it runs without you.",
    payoff: "Underrated. System building explained at its best: how to turn what only I know how to do into processes a team can run, so easypeasy scales beyond me.",
    pages: 268,
    year: 1995,
    sortOrder: 110,
  },
];
