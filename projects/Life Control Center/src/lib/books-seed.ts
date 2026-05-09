/**
 * 12-book reading roadmap for 2026.
 * One book per month. Public domain books include a free download URL.
 */

export type BookSeed = {
  title: string;
  author: string;
  topic: string;
  targetMonth: number; // 1–12
  targetYear: number;
  totalPages?: number;
  isPublicDomain: boolean;
  publicDomainUrl?: string;
  coverUrl?: string;
  sortOrder: number;
};

export const BOOKS_2026: BookSeed[] = [
  {
    title: "Sapiens: A Brief History of Humankind",
    author: "Yuval Noah Harari",
    topic: "World History",
    targetMonth: 1,
    targetYear: 2026,
    totalPages: 443,
    isPublicDomain: false,
    sortOrder: 1,
  },
  {
    title: "The Story of Morocco",
    author: "Barnaby Rogerson",
    topic: "Moroccan History",
    targetMonth: 2,
    targetYear: 2026,
    totalPages: 224,
    isPublicDomain: false,
    sortOrder: 2,
  },
  {
    title: "Animal Farm",
    author: "George Orwell",
    topic: "Politics / Power",
    targetMonth: 3,
    targetYear: 2026,
    totalPages: 112,
    isPublicDomain: false, // Copyright still active in most jurisdictions
    sortOrder: 3,
  },
  {
    title: "The Communist Manifesto",
    author: "Karl Marx & Friedrich Engels",
    topic: "Economics / Politics",
    targetMonth: 4,
    targetYear: 2026,
    totalPages: 60,
    isPublicDomain: true,
    publicDomainUrl: "https://www.marxists.org/archive/marx/works/download/pdf/Manifesto.pdf",
    sortOrder: 4,
  },
  {
    title: "Meditations",
    author: "Marcus Aurelius",
    topic: "Philosophy / Stoicism",
    targetMonth: 5,
    targetYear: 2026,
    totalPages: 254,
    isPublicDomain: true,
    publicDomainUrl: "https://www.gutenberg.org/files/2680/2680-h/2680-h.htm",
    sortOrder: 5,
  },
  {
    title: "The Lessons of History",
    author: "Will & Ariel Durant",
    topic: "History",
    targetMonth: 6,
    targetYear: 2026,
    totalPages: 117,
    isPublicDomain: false,
    sortOrder: 6,
  },
  {
    title: "Why Nations Fail",
    author: "Daron Acemoglu & James A. Robinson",
    topic: "Politics / Economics",
    targetMonth: 7,
    targetYear: 2026,
    totalPages: 529,
    isPublicDomain: false,
    sortOrder: 7,
  },
  {
    title: "1984",
    author: "George Orwell",
    topic: "Politics / Authoritarianism",
    targetMonth: 8,
    targetYear: 2026,
    totalPages: 328,
    isPublicDomain: false,
    sortOrder: 8,
  },
  {
    title: "The Republic",
    author: "Plato",
    topic: "Philosophy",
    targetMonth: 9,
    targetYear: 2026,
    totalPages: 416,
    isPublicDomain: true,
    publicDomainUrl: "https://www.gutenberg.org/files/1497/1497-h/1497-h.htm",
    sortOrder: 9,
  },
  {
    title: "A History of the Arab Peoples",
    author: "Albert Hourani",
    topic: "Arab / Moroccan History",
    targetMonth: 10,
    targetYear: 2026,
    totalPages: 551,
    isPublicDomain: false,
    sortOrder: 10,
  },
  {
    title: "Thinking, Fast and Slow",
    author: "Daniel Kahneman",
    topic: "Psychology / Reasoning",
    targetMonth: 11,
    targetYear: 2026,
    totalPages: 499,
    isPublicDomain: false,
    sortOrder: 11,
  },
  {
    title: "The Art of Thinking Clearly",
    author: "Rolf Dobelli",
    topic: "Logic / Arguments",
    targetMonth: 12,
    targetYear: 2026,
    totalPages: 352,
    isPublicDomain: false,
    sortOrder: 12,
  },
];
