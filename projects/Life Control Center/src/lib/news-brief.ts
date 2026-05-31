/**
 * News Brief Generator — free RSS-based approach.
 *
 * Fetches headlines from curated RSS feeds across 4 topic pillars,
 * filtered by Ali's interests. Zero API cost.
 *
 * Categories:  football · geopolitics · business · tech/ai
 *
 * Topics of interest:
 *   Football: KACM, Morocco / Atlas Lions, FRMF, World Cup 2026, Champions League, European leagues
 *   Geopolitics: Morocco news, MENA, world affairs
 *   Business: markets, companies, economics
 *   Tech & AI: product launches, AI research, industry shifts
 */

export type NewsCategory = "football" | "geopolitics" | "business" | "tech";

export type NewsStory = {
  headline: string;
  summary: string;
  keyPoints: string[];
  category: NewsCategory | "ai" | "other";
  source?: string;
  /** @deprecated Kept for backward compat */
  whyItMatters?: string;
};

export type NewsBrief = {
  date: string;
  stories: NewsStory[];
  generatedAt: string;
};

// ─── RSS Feed Sources ────────────────────────────────────────────────────────

type FeedConfig = {
  url: string;
  category: NewsCategory;
  /** Keywords to boost relevance (optional — if empty, all items are included) */
  keywords?: string[];
};

const FEEDS: FeedConfig[] = [
  // Football — Morocco national team, World Cup 2026, Champions League, European leagues
  { url: "https://www.goal.com/feeds/en/news", category: "football" },
  { url: "https://www.football-espana.net/feed", category: "football" },
  { url: "https://www.marca.com/en/rss/football.xml", category: "football" },
  { url: "https://moroccoworldnews.com/category/sports/feed", category: "football" },
  { url: "https://www.fifa.com/rss/index.xml", category: "football", keywords: ["world cup", "2026", "morocco", "fifa", "atlas lions"] },
  // Morocco-focused football sources
  { url: "https://www.reuters.com/sports/soccer/rss", category: "football", keywords: ["morocco", "atlas lions", "hakimi", "regragui", "world cup 2026", "africa cup"] },
  { url: "https://www.skysports.com/rss/12040", category: "football" },

  // Geopolitics — Morocco politics, MENA, world affairs
  { url: "https://moroccoworldnews.com/feed", category: "geopolitics", keywords: ["morocco", "rabat", "casablanca", "fes", "marrakech", "king mohammed", "atlas", "sahara", "mena", "government", "parliament", "minister"] },
  { url: "https://feeds.bbci.co.uk/news/world/africa/rss.xml", category: "geopolitics" },
  { url: "https://feeds.bbci.co.uk/news/world/rss.xml", category: "geopolitics" },
  { url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml", category: "geopolitics" },
  { url: "https://www.aljazeera.com/xml/rss/all.xml", category: "geopolitics" },

  // Business — markets, companies, economics
  { url: "https://feeds.bbci.co.uk/news/business/rss.xml", category: "business" },
  { url: "https://www.cnbc.com/id/100003114/device/rss/rss.html", category: "business" },
  { url: "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml", category: "business" },

  // Tech & AI — product launches, AI research, industry shifts
  { url: "https://feeds.arstechnica.com/arstechnica/index", category: "tech" },
  { url: "https://www.theverge.com/rss/index.xml", category: "tech" },
  { url: "https://techcrunch.com/feed/", category: "tech" },
  { url: "https://feeds.bbci.co.uk/news/technology/rss.xml", category: "tech" },
];

// Keywords that boost a story for Ali's specific interests
const INTEREST_KEYWORDS: Record<NewsCategory, string[]> = {
  football: ["morocco", "atlas lions", "moroccan", "kacm", "kawkab", "frmf", "world cup", "2026", "champions league", "real madrid", "barcelona", "premier league", "ligue 1", "botola", "regragui", "hakimi", "achraf", "en-nesyri", "mazraoui", "amrabat", "ziyech", "ounahi", "diaz", "brahim", "aguerd", "bounou", "el kaabi", "fifa", "caf", "africa cup", "afcon", "nations cup", "psg", "man city", "arsenal"],
  geopolitics: ["morocco", "rabat", "sahara", "mena", "africa", "middle east", "israel", "palestine", "ukraine", "nato", "eu", "trump", "election", "casablanca", "fes", "marrakech", "king mohammed"],
  business: ["markets", "stock", "earnings", "gdp", "recession", "startup", "ipo", "acquisition", "apple", "google", "amazon", "tesla"],
  tech: ["ai", "artificial intelligence", "openai", "anthropic", "claude", "gpt", "llm", "apple", "google", "chip", "semiconductor", "robot", "machine learning", "deepmind", "chatbot", "agent"],
};

// ─── RSS Parsing ─────────────────────────────────────────────────────────────

interface RSSItem {
  title: string;
  description: string;
  link: string;
  pubDate: string;
}

/** Minimal XML tag extractor — no dependency needed */
function extractTag(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>|<${tag}[^>]*>([\\s\\S]*?)</${tag}>`);
  const m = xml.match(re);
  return (m?.[1] ?? m?.[2] ?? "").trim();
}

function parseRSSItems(xml: string): RSSItem[] {
  const items: RSSItem[] = [];
  // Match both <item> (RSS 2.0) and <entry> (Atom)
  const itemRegex = /<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[0];
    const title = extractTag(block, "title");
    // RSS uses <description>, Atom uses <summary> or <content>
    const description = extractTag(block, "description") || extractTag(block, "summary") || extractTag(block, "content");
    // RSS uses <link>, Atom uses <link href="..."/>
    let link = extractTag(block, "link");
    if (!link) {
      const hrefMatch = block.match(/<link[^>]+href=["']([^"']+)["']/);
      if (hrefMatch) link = hrefMatch[1];
    }
    const pubDate = extractTag(block, "pubDate") || extractTag(block, "published") || extractTag(block, "updated");
    if (title) {
      items.push({ title: stripHtml(title), description: stripHtml(description).slice(0, 600), link, pubDate });
    }
  }
  return items;
}

function stripHtml(s: string): string {
  let out = s
    .replace(/<[^>]*>/g, "");

  // Decode entities in multiple passes to handle double-encoding (e.g. &amp;#8217;)
  for (let i = 0; i < 3; i++) {
    const prev = out;
    out = out
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/&ndash;/g, "–")
      .replace(/&mdash;/g, "—")
      .replace(/&lsquo;/g, "\u2018")
      .replace(/&rsquo;/g, "\u2019")
      .replace(/&ldquo;/g, "\u201C")
      .replace(/&rdquo;/g, "\u201D")
      .replace(/&hellip;/g, "\u2026")
      .replace(/&trade;/g, "\u2122")
      .replace(/&copy;/g, "\u00A9")
      .replace(/&reg;/g, "\u00AE")
      .replace(/&eacute;/g, "\u00E9")
      .replace(/&egrave;/g, "\u00E8")
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    if (out === prev) break; // no more entities to decode
  }

  return out
    .replace(/&[a-zA-Z]+;/g, "") // strip any remaining unknown named entities
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Feed Fetching ───────────────────────────────────────────────────────────

async function fetchFeed(feed: FeedConfig): Promise<{ stories: NewsStory[]; category: NewsCategory }> {
  try {
    const res = await fetch(feed.url, {
      headers: { "User-Agent": "LifeControlCenter/1.0 (personal dashboard)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { stories: [], category: feed.category };
    const xml = await res.text();
    const items = parseRSSItems(xml);

    const stories: NewsStory[] = items.slice(0, 15).map((item) => ({
      headline: item.title,
      summary: item.description || item.title,
      keyPoints: [],
      category: feed.category,
      source: item.link,
    }));

    return { stories, category: feed.category };
  } catch {
    return { stories: [], category: feed.category };
  }
}

/** Score a story based on keyword relevance */
function relevanceScore(story: NewsStory): number {
  const text = `${story.headline} ${story.summary}`.toLowerCase();
  const keywords = INTEREST_KEYWORDS[story.category as NewsCategory] ?? [];
  let score = 0;
  for (const kw of keywords) {
    if (text.includes(kw.toLowerCase())) score += 1;
  }
  return score;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Generate a daily news brief from RSS feeds — zero API cost */
export async function generateNewsBrief(date: string): Promise<NewsBrief> {
  // Fetch all feeds in parallel
  const results = await Promise.all(FEEDS.map(fetchFeed));

  // Group stories by the 4 display categories
  const byCategory: Record<string, NewsStory[]> = {
    football: [],
    geopolitics: [],
    business: [],
    tech: [],
  };

  for (const { stories, category } of results) {
    byCategory[category].push(...stories);
  }

  // Deduplicate by headline similarity within each category
  for (const cat of Object.keys(byCategory)) {
    const seen = new Set<string>();
    byCategory[cat] = byCategory[cat].filter((s) => {
      const key = s.headline.toLowerCase().slice(0, 40);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // Sort each category by relevance, take top 5 → 20 total
  for (const cat of Object.keys(byCategory)) {
    byCategory[cat].sort((a, b) => relevanceScore(b) - relevanceScore(a));
  }

  const selected: NewsStory[] = [];
  for (const cat of ["football", "geopolitics", "business", "tech"]) {
    selected.push(...byCategory[cat].slice(0, 5));
  }

  return {
    date,
    stories: selected,
    generatedAt: new Date().toISOString(),
  };
}

/** Format a news brief as HTML email */
export function formatBriefAsEmail(brief: NewsBrief): string {
  const CAT_COLORS: Record<string, string> = {
    football:    "#F97316",
    geopolitics: "#F87171",
    business:    "#34D399",
    tech:        "#22D3EE",
    other:       "#94A3B8",
  };
  const CAT_LABELS: Record<string, string> = {
    football:    "⚽ Football",
    geopolitics: "🌍 Geopolitics",
    business:    "📈 Business",
    tech:        "💻 Tech & AI",
    other:       "📰 News",
  };

  const storiesHtml = brief.stories
    .map((s) => {
      const color = CAT_COLORS[s.category] ?? CAT_COLORS.other;
      const label = CAT_LABELS[s.category] ?? CAT_LABELS.other;
      return `
    <div style="margin-bottom:20px;padding:16px;background:#1a1a24;border-radius:12px;border-left:3px solid ${color}">
      <div style="color:${color};font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px">
        ${label}
      </div>
      <h2 style="color:#f1f5f9;font-size:15px;font-weight:600;margin:0 0 8px 0;line-height:1.4">${s.headline}</h2>
      <p style="color:#94a3b8;font-size:13px;margin:0 0 10px 0;line-height:1.6">${s.summary}</p>
      ${s.source ? `<div style="margin-top:8px"><a href="${s.source}" style="color:#475569;font-size:11px">${s.source}</a></div>` : ""}
    </div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="background:#0a0a0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;padding:0">
  <div style="max-width:640px;margin:0 auto;padding:24px 16px">
    <div style="margin-bottom:24px">
      <div style="display:inline-block;background:#7C5CFF;color:#fff;padding:4px 12px;border-radius:6px;font-size:12px;font-weight:600;margin-bottom:8px">DAILY BRIEF</div>
      <h1 style="color:#f1f5f9;font-size:22px;font-weight:700;margin:0">
        ${new Date(brief.date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
      </h1>
      <p style="color:#475569;font-size:13px;margin:4px 0 0 0">${brief.stories.length} stories · RSS feeds · No opinion</p>
    </div>
    ${storiesHtml}
    <div style="text-align:center;padding-top:16px;border-top:1px solid rgba(255,255,255,0.07)">
      <p style="color:#334155;font-size:12px">Life Control Center · Daily Brief</p>
    </div>
  </div>
</body>
</html>`;
}
