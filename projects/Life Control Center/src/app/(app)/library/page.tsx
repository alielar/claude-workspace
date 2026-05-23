/**
 * /library — Reading library. V2 Ambient Futurism design.
 * Layout: 1fr / 360px — left: year progress + book list; right: reading habit stats + add + wishlist.
 */

export const dynamic = "force-dynamic";

import { auth } from "@/lib/auth";
import { db } from "@/db";
import { books, readingSessions } from "@/db/schema";
import { eq, desc, gte } from "drizzle-orm";
import { format, subDays } from "date-fns";
import Link from "next/link";
import UploadButton from "@/components/library/UploadButton";

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// Cover color palettes per book slot (cycling)
const COVER_PALETTES = [
  ["#7B2D8B","#4A1060"],  // violet-dark
  ["#1B4E7A","#0D2840"],  // navy
  ["#2D6A4F","#1B3A2D"],  // forest
  ["#7A3B1E","#3D1A0A"],  // rust
  ["#4A3D8F","#261F50"],  // indigo
  ["#7A1C3B","#40091E"],  // crimson
  ["#1C5A6A","#0A2D38"],  // teal
  ["#5C4A1E","#2D2209"],  // golden
  ["#3B1C5A","#1A0A30"],  // purple
  ["#1A4A2D","#0A2018"],  // dark-green
  ["#5A3B1C","#2D1A09"],  // amber
  ["#1C3B5A","#0A1E2D"],  // slate-blue
];

function todayMadrid(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
}

function calcReadingStreak(dates: string[], today: string): number {
  const unique = [...new Set(dates)].sort().reverse();
  if (unique.length === 0) return 0;
  const yesterday = format(subDays(new Date(today + "T12:00:00"), 1), "yyyy-MM-dd");
  let check = unique.includes(today) ? today : yesterday;
  let count = 0;
  for (const d of unique) {
    if (d === check) { count++; check = format(subDays(new Date(check + "T12:00:00"), 1), "yyyy-MM-dd"); }
    else if (d < check) break;
  }
  return count;
}

export default async function LibraryPage() {
  const session = await auth();
  const userId  = session!.user!.id!;

  const lookback = format(subDays(new Date(), 90), "yyyy-MM-dd");

  const [allBooks, recentSessions] = await Promise.all([
    db.select().from(books).where(eq(books.userId, userId)).orderBy(books.sortOrder),
    db.select({
      id: readingSessions.id,
      bookId: readingSessions.bookId,
      title: books.title,
      durationMinutes: readingSessions.durationMinutes,
      date: readingSessions.date,
      startedAt: readingSessions.startedAt,
    }).from(readingSessions)
      .innerJoin(books, eq(readingSessions.bookId, books.id))
      .where(eq(readingSessions.userId, userId))
      .orderBy(desc(readingSessions.startedAt))
      .limit(20),
  ]);

  const today = todayMadrid();
  const thisMonthStart = today.substring(0, 7) + "-01";
  const thisMonthSessions = recentSessions.filter((s) => s.date >= thisMonthStart);
  const thisMonthMinutes = thisMonthSessions.reduce((sum, s) => sum + s.durationMinutes, 0);
  const readingStreak = calcReadingStreak(recentSessions.map((s) => s.date), today);

  const fmtDuration = (min: number) => min >= 60
    ? `${Math.floor(min / 60)}h ${min % 60}m`
    : `${min}m`;

  const now          = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear  = now.getFullYear();
  const monthAbbrs   = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

  const finished = allBooks.filter((b) => b.status === "finished").length;
  const reading  = allBooks.filter((b) => b.status === "reading").length;

  // Build 12 month segments for the progress bar
  const segments = Array.from({ length: 12 }, (_, i) => {
    const mo = i + 1;
    const book = allBooks.find((b) => b.targetMonth === mo && b.targetYear === currentYear);
    if (!book) return "empty";
    if (book.status === "finished")  return "done";
    if (book.status === "reading")   return "reading";
    if (mo < currentMonth)           return "miss";
    if (mo === currentMonth)         return "current";
    return "empty";
  });

  return (
    <div style={{ padding: "0 0 40px" }}>

      {/* Page title */}
      <div className="cc-pagetitle" style={{ marginBottom: 20 }}>
        <div>
          <h1>Library<span className="grad-text">.</span></h1>
          <div className="sub">
            {allBooks.length} books · {currentYear} · curated reading journal
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="cc-btn" style={{ fontSize: 12 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Upload PDF
          </button>
          <button className="cc-btn cc-btn-primary" style={{ fontSize: 12 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add book
          </button>
        </div>
      </div>

      {/* 1fr / 360px grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 14 }}>

        {/* ── LEFT ────────────────────────────────────────────────── */}
        <div>
          {/* Year progress card */}
          <div className="cc-card" style={{
            marginBottom: 14, padding: "24px 28px",
            background: "radial-gradient(60% 80% at 0% 0%, rgba(124,77,255,0.12), transparent 60%), var(--bg-card)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24 }}>
              <div>
                <div style={{ fontSize: 11, letterSpacing: "0.20em", textTransform: "uppercase", color: "var(--ink-3)", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "99px", background: "var(--cyan)", boxShadow: "0 0 6px var(--cyan)", display: "inline-block" }} />
                  {currentYear} progress
                </div>
                <div style={{ fontSize: 56, fontWeight: 200, letterSpacing: "-0.04em", lineHeight: 1, background: "var(--grad)", WebkitBackgroundClip: "text", color: "transparent", filter: "drop-shadow(0 0 18px rgba(124,77,255,0.20))", marginTop: 6 }}>
                  {finished}<span style={{ fontSize: 24, WebkitTextFillColor: "var(--ink-3)" }}> /{allBooks.length} books finished</span>
                </div>
                <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>
                  on pace · target 1 book / month
                </div>
              </div>
              <div style={{ fontSize: 13, color: "var(--ink-2)", textAlign: "right", letterSpacing: "0.01em" }}>
                {reading > 0 && <div><b style={{ color: "var(--ink)" }}>{reading} reading</b> · in progress</div>}
                <div style={{ marginTop: 4 }}><b style={{ color: "var(--ink)" }}>{allBooks.length - finished - reading} ahead</b> · queued</div>
              </div>
            </div>

            {/* Month segment bar */}
            <div style={{ height: 8, background: "rgba(255,255,255,0.04)", borderRadius: 99, overflow: "hidden", marginTop: 18, display: "flex", gap: 1 }}>
              {segments.map((state, i) => (
                <div key={i} style={{
                  flex: 1, height: "100%",
                  background:
                    state === "done"    ? "var(--grad)" :
                    state === "reading" ? "linear-gradient(90deg, rgba(124,77,255,0.50), rgba(100,255,218,0.20))" :
                    state === "current" ? "rgba(100,255,218,0.20)" :
                    "rgba(255,255,255,0.025)",
                  boxShadow:
                    state === "done"    ? "0 0 6px rgba(124,77,255,0.40)" :
                    state === "current" ? "0 0 8px rgba(100,255,218,0.30)" :
                    "none",
                  border: state === "current" ? "1px dashed rgba(100,255,218,0.50)" : "none",
                  borderRadius: 1,
                }} />
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9.5, color: "var(--ink-4)", letterSpacing: "0.10em", marginTop: 6, fontFamily: "var(--f-mono)" }}>
              {monthAbbrs.map((m, i) => (
                <span key={m} style={{ color: i + 1 === currentMonth ? "var(--cyan)" : "var(--ink-4)" }}>{m}</span>
              ))}
            </div>
          </div>

          {/* Book list */}
          <div className="cc-card">
            <div className="cc-card-head">
              <div className="title">{currentYear} Reading list</div>
              <div className="tail">click to open · drag to reorder months</div>
            </div>

            {allBooks.length === 0 && (
              <div style={{ padding: "32px 0", textAlign: "center" }}>
                <div style={{ fontSize: 13, color: "var(--ink-2)", marginBottom: 16 }}>No books yet.</div>
                <form action="/api/library/seed" method="POST">
                  <button type="submit" className="cc-btn cc-btn-primary" style={{ margin: "0 auto" }}>
                    Load {currentYear} Reading List
                  </button>
                </form>
              </div>
            )}

            {allBooks.map((book, idx) => {
              const isCurrentMonth = book.targetMonth === currentMonth && book.targetYear === currentYear;
              const isFinished     = book.status === "finished";
              const isReading      = book.status === "reading";
              const isNotStarted   = book.status === "not_started";
              const palette        = COVER_PALETTES[idx % COVER_PALETTES.length];
              const monthLabel     = MONTH_NAMES[(book.targetMonth ?? 1) - 1];

              return (
                <div
                  key={book.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "64px 70px 1fr 130px 220px",
                    gap: 18,
                    alignItems: "center",
                    padding: "16px 18px",
                    border: `1px solid ${isCurrentMonth ? "rgba(124,77,255,0.30)" : "var(--line)"}`,
                    borderRadius: 12,
                    background: isCurrentMonth
                      ? "radial-gradient(60% 80% at 0% 0%, rgba(124,77,255,0.10), transparent 60%), radial-gradient(40% 80% at 100% 100%, rgba(100,255,218,0.08), transparent 60%), rgba(255,255,255,0.025)"
                      : "rgba(255,255,255,0.012)",
                    cursor: "pointer",
                    marginBottom: 8,
                    position: "relative",
                    boxShadow: isCurrentMonth ? "0 0 24px rgba(124,77,255,0.10)" : "none",
                    opacity: isNotStarted && !isCurrentMonth ? 0.8 : 1,
                  }}
                >
                  {/* Current month left accent */}
                  {isCurrentMonth && (
                    <div style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: 2, background: "var(--grad)", borderRadius: "2px 0 0 2px", boxShadow: "0 0 10px rgba(124,77,255,0.50)" }} />
                  )}
                  {/* "This month" badge */}
                  {isCurrentMonth && (
                    <div style={{ position: "absolute", top: -8, right: 18, fontSize: 9, letterSpacing: "0.20em", textTransform: "uppercase", fontWeight: 600, padding: "2px 8px", background: "var(--grad)", color: "#0A0A14", borderRadius: 99, boxShadow: "0 0 12px rgba(124,77,255,0.40)" }}>
                      This month
                    </div>
                  )}

                  {/* Month */}
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 10, letterSpacing: "0.20em", textTransform: "uppercase", color: isCurrentMonth ? "var(--cyan)" : "var(--ink-3)", fontWeight: 600 }}>
                      {monthLabel}
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 500, letterSpacing: "-0.02em", color: isCurrentMonth ? "var(--ink)" : "var(--ink-2)", fontFamily: "var(--f-mono)", marginTop: 2 }}>
                      {String(book.sortOrder).padStart(2, "0")}
                    </div>
                  </div>

                  {/* Cover */}
                  <div style={{
                    width: 54, height: 78, borderRadius: 4, overflow: "hidden",
                    background: `linear-gradient(160deg, ${palette[0]}, ${palette[1]})`,
                    position: "relative", flexShrink: 0,
                    opacity: isNotStarted && !isCurrentMonth ? 0.5 : 1,
                    boxShadow: isCurrentMonth ? "0 0 16px rgba(124,77,255,0.20)" : "0 4px 12px rgba(0,0,0,0.40)",
                  }}>
                    <div style={{ position: "absolute", inset: 6, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                      <div style={{ fontSize: 7.5, color: "rgba(255,255,255,0.75)", lineHeight: 1.15, fontWeight: 500, letterSpacing: 0 }}>
                        {book.title.substring(0, 20)}
                      </div>
                      <div style={{ fontSize: 6.5, color: "rgba(255,255,255,0.45)", letterSpacing: "0.02em", marginTop: 2 }}>
                        {book.author.split(" ").slice(-1)[0]}
                      </div>
                    </div>
                  </div>

                  {/* Info */}
                  <div>
                    <div style={{ fontSize: 15.5, fontWeight: 500, letterSpacing: "-0.005em", lineHeight: 1.25, color: isNotStarted && !isCurrentMonth ? "var(--ink-2)" : "var(--ink)" }}>
                      {book.title}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 3 }}>{book.author}</div>
                    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                      {book.topic && (
                        <span style={{ padding: "3px 8px", fontSize: 9.5, letterSpacing: "0.10em", textTransform: "uppercase", border: "1px solid var(--line)", borderRadius: 99, color: "var(--ink-3)", fontWeight: 500 }}>
                          {book.topic}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Status */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ fontSize: 9.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600 }}>Status</div>
                    <div style={{ fontSize: 14, fontWeight: 500, letterSpacing: "-0.005em", color: isFinished ? "var(--pos)" : isReading ? "var(--cyan)" : "var(--ink-3)" }}>
                      {isFinished ? "Finished" : isReading ? `Reading · ${(book as any).progress ?? 0}%` : "Not started"}
                    </div>
                    {isReading && (
                      <>
                        <div style={{ height: 2, width: "100%", background: "var(--line)", marginTop: 4, borderRadius: 99, overflow: "hidden" }}>
                          <div style={{ height: "100%", background: "var(--grad)", width: `${(book as any).progress ?? 0}%` }} />
                        </div>
                        <div style={{ fontFamily: "var(--f-mono)", fontSize: 11.5, color: "var(--ink-3)", marginTop: 2, letterSpacing: "0.04em" }}>
                          p. {(book as any).lastPageRead ?? 0} / {book.totalPages ?? "?"}
                        </div>
                      </>
                    )}
                    {isFinished && (
                      <div style={{ fontFamily: "var(--f-mono)", fontSize: 11.5, color: "var(--ink-3)", marginTop: 2, letterSpacing: "0.04em" }}>100%</div>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center" }}>
                    {book.pdfKey ? (
                      <>
                        <span style={{ fontSize: 11, color: "var(--ink-4)" }}>
                          {(book as any).annotationCount ?? 0} notes
                        </span>
                        <Link
                          href={`/library/read/${book.id}`}
                          className={`cc-btn${isCurrentMonth ? " cc-btn-primary" : " cc-btn-ghost"}`}
                          style={{ padding: "8px 14px", fontSize: 12 }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                          {isReading ? "Resume reading" : isFinished ? "Review" : "Open"}
                        </Link>
                      </>
                    ) : (
                      <UploadButton bookId={book.id} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── RIGHT ───────────────────────────────────────────────── */}
        <div>
          {/* Reading habit card */}
          <div className="cc-card" style={{ marginBottom: 14 }}>
            <div className="cc-card-head"><div className="title">Reading habit</div><div className="tail">{MONTH_NAMES[now.getMonth()]}</div></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
              <div style={{ paddingRight: 12, borderRight: "1px solid var(--line)" }}>
                <div style={{ fontSize: 9.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-3)" }}>This month</div>
                <div style={{ fontSize: 22, marginTop: 4, fontWeight: 300, letterSpacing: "-0.02em" }}>
                  {thisMonthMinutes > 0 ? fmtDuration(thisMonthMinutes) : "-"}
                </div>
                <div style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 2, fontFamily: "var(--f-mono)" }}>
                  {thisMonthSessions.length} session{thisMonthSessions.length !== 1 ? "s" : ""}
                </div>
              </div>
              <div style={{ paddingLeft: 12 }}>
                <div style={{ fontSize: 9.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-3)" }}>Days streak</div>
                <div style={{ fontSize: 22, marginTop: 4, fontWeight: 300, letterSpacing: "-0.02em" }}>
                  {readingStreak} <span style={{ color: "var(--ink-3)", fontSize: 12 }}>days</span>
                </div>
                <div style={{ fontSize: 10.5, color: readingStreak >= 7 ? "var(--pos)" : "var(--ink-3)", marginTop: 2, fontFamily: "var(--f-mono)" }}>
                  {readingStreak >= 7 ? "🔥 on a roll" : "target · 30 days"}
                </div>
              </div>
            </div>
            <div style={{ height: 1, background: "var(--line)", margin: "14px 0" }} />
            <div style={{ fontSize: 9.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-3)", marginBottom: 8 }}>Recent sessions</div>
            {recentSessions.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--ink-4)", padding: "8px 0" }}>No sessions yet. Open a book to start reading.</div>
            ) : (
              recentSessions.slice(0, 5).map((s, i, arr) => {
                const d = new Date(s.startedAt);
                const dayLabel = d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
                return (
                  <div key={s.id} style={{ padding: "9px 0", borderBottom: i < arr.length - 1 ? "1px solid var(--line)" : "none", fontSize: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>{s.title}</span>
                      <span style={{ fontFamily: "var(--f-mono)", color: "var(--ink-3)", fontSize: 11, letterSpacing: "0.04em", flexShrink: 0 }}>{fmtDuration(s.durationMinutes)}</span>
                    </div>
                    <div style={{ fontSize: 10.5, color: "var(--ink-4)", marginTop: 2, letterSpacing: "0.04em", fontFamily: "var(--f-mono)" }}>{dayLabel}</div>
                  </div>
                );
              })
            )}
          </div>

          {/* Drop / add card */}
          <div style={{ padding: 18, border: "1px dashed var(--line-hi)", borderRadius: 12, background: "rgba(100,255,218,0.04)", textAlign: "center", marginBottom: 14 }}>
            <div style={{ display: "inline-flex", width: 42, height: 42, borderRadius: "99px", background: "rgba(100,255,218,0.10)", alignItems: "center", justifyContent: "center", color: "var(--cyan)", marginBottom: 8 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            </div>
            <div style={{ fontSize: 13.5, fontWeight: 500 }}>Drop a PDF here</div>
            <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 4, lineHeight: 1.5 }}>Or paste a Goodreads link.<br />Claude auto-fills the metadata.</div>
            <button className="cc-btn" style={{ margin: "12px auto 0", display: "flex" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add book
            </button>
          </div>

          {/* Wishlist */}
          <div className="cc-card">
            <div className="cc-card-head"><div className="title">Wishlist · 2027 picks</div><div className="tail">+8</div></div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {["The Beginning of Infinity · Deutsch","The Power Broker · Caro","Skin in the Game · Taleb"].map((item, i) => (
                <div key={i} style={{ padding: "8px 0", borderBottom: i < 2 ? "1px solid var(--line)" : "none", fontSize: 12.5 }}>
                  {item.split(" · ")[0]} <span style={{ color: "var(--ink-3)", fontSize: 11 }}>· {item.split(" · ")[1]}</span>
                </div>
              ))}
              <div style={{ padding: "8px 0", fontSize: 12, color: "var(--ink-3)" }}>+ 5 more</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
