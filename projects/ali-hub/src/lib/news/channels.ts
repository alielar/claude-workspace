/**
 * The YouTube channels behind News (Ali 2026-10-03) · a FIXED list, two shelves.
 *
 *   DAILY PICKS  · exactly two cards a day: the latest upload of each.
 *   WATCH LATER  · uploads from the last two weeks, in Ali's priority order (top = most
 *                  important, bottom = entertainment). Watched videos drop off.
 *
 * Handles and names Ali gave, matched 2026-10-03 (ids verified against each channel's own feed):
 *   @maxfisher        → Max Fisher (UCqPTW4CeoAgq111DA__mP9g, 556K)
 *   @hoog-youtube     → Hoog (UCii9ezsUa_mBiSdw0PtSOaw, 1.14M)
 *   @TheDiaryOfACEO   → The Diary Of A CEO, the main channel, not "Clips" (UCGq-a57w-aPwyi3pW7XLiHw, 20M)
 *   Finary            → Finary (UCRCCAnVyzDTcqNYh0pDcq7Q, 912K · the French personal-finance channel)
 *   AI in Context     → AI In Context (UCwicfou4Ewu-koikmga-bEg, 438K)
 *   Bloomberg Originals → Bloomberg Originals, @business (UCUMZ7gohGI9HcU9VNsr2FJQ, 5.2M) · AI, politics, business titles only
 *   @WillTennyson     → Will Tennyson (UCB2wtYpfbCpYDc5TeTwuqFA, 5.4M)
 *   Tibi Jones        → Tibi Jones (UCSDx1E2Z9eDv0pEgW4_yubA, 622K)
 *   The AI Daily Brief → UCKelCK4ZaO6HeEI1KQjqzWA · TLDR News Global → UC-uhvujip5deVcEtLxnW8qg
 *   + two Claude Code channels, picked from the five researched 2026-09-12: IndyDevDan (the most
 *     consistent on HOW to work with coding agents · principles, not tool tours) and AI LABS
 *     (Claude Code and Claude skills week by week, hands-on, short).
 *
 * Settings → YouTube channels shows this list; a watch-later channel can be switched off there
 * (`user_settings.news_channels` = enabled ids, null = all on). The two daily picks are fixed.
 */

export type Channel = {
  id: string;
  name: string;
  handle: string;
  /** Daily pick (one card a day) or watch later (a list). */
  shelf: "daily" | "later";
  /** Watch later only · 1 = most important. */
  priority: number;
  /** One quiet line in Settings. */
  hint: string;
  /** Only videos whose title matches (Bloomberg Originals: AI, politics or business). */
  filter?: RegExp;
};

export const DAILY_PICKS: Channel[] = [
  { id: "UCKelCK4ZaO6HeEI1KQjqzWA", name: "The AI Daily Brief", handle: "@AIDailyBrief",   shelf: "daily", priority: 0, hint: "AI & Tech · one story a day, 15-20 min" },
  { id: "UC-uhvujip5deVcEtLxnW8qg", name: "TLDR News Global",   handle: "@TLDRnewsGLOBAL", shelf: "daily", priority: 0, hint: "Global news · world politics in plain language" },
];

const BLOOMBERG_FILTER = /\b(ai|artificial intelligence|openai|anthropic|nvidia|chip|chips|robot|politic|politics|election|president|congress|senate|trump|xi|putin|war|tariff|tariffs|trade|business|econom|economy|market|markets|stock|stocks|company|companies|billion|trillion|bank|banks|startup|ceo|tech|deal|merger|inflation|fed|dollar|oil|energy|china|europe|eu)\b/i;

export const WATCH_LATER: Channel[] = [
  { id: "UCqPTW4CeoAgq111DA__mP9g", name: "Max Fisher",          handle: "@maxfisher",       shelf: "later", priority: 1,  hint: "the world, explained" },
  { id: "UCii9ezsUa_mBiSdw0PtSOaw", name: "Hoog",                handle: "@hoog-youtube",    shelf: "later", priority: 2,  hint: "documentaries" },
  { id: "UCGq-a57w-aPwyi3pW7XLiHw", name: "The Diary Of A CEO",  handle: "@TheDiaryOfACEO",  shelf: "later", priority: 3,  hint: "long conversations" },
  { id: "UCRCCAnVyzDTcqNYh0pDcq7Q", name: "Finary",              handle: "@Finary",          shelf: "later", priority: 4,  hint: "money, in French" },
  { id: "UCwicfou4Ewu-koikmga-bEg", name: "AI In Context",       handle: "@AI_In_Context",   shelf: "later", priority: 5,  hint: "AI, the bigger picture" },
  { id: "UCUMZ7gohGI9HcU9VNsr2FJQ", name: "Bloomberg Originals", handle: "@business",        shelf: "later", priority: 6,  hint: "AI, politics and business videos only", filter: BLOOMBERG_FILTER },
  { id: "UC_x36zCEGilGpB1m-V4gmjg", name: "IndyDevDan",          handle: "@indydevdan",      shelf: "later", priority: 7,  hint: "Claude Code · how to work with coding agents" },
  { id: "UCelfWQr9sXVMTvBzviPGlFw", name: "AI LABS",             handle: "@AILABS",          shelf: "later", priority: 8,  hint: "Claude Code and skills, week by week" },
  { id: "UCB2wtYpfbCpYDc5TeTwuqFA", name: "Will Tennyson",       handle: "@WillTennyson",    shelf: "later", priority: 9,  hint: "fitness, for fun" },
  { id: "UCSDx1E2Z9eDv0pEgW4_yubA", name: "Tibi Jones",          handle: "@tibijones",       shelf: "later", priority: 10, hint: "entertainment" },
];

export const ALL_CHANNELS: Channel[] = [...DAILY_PICKS, ...WATCH_LATER];
export const channelById = (id: string) => ALL_CHANNELS.find((c) => c.id === id) ?? null;

/** Watch later keeps two weeks; a daily pick is the latest upload, however old. */
export const LATER_WINDOW_DAYS = 14;
