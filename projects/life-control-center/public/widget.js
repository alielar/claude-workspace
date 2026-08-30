// A L I — home-screen widget for Scriptable (https://scriptable.app, free).
//
// Install once: open Scriptable → + → paste this file → name it "ALI".
// Then long-press the home screen → + → Scriptable → medium or small widget →
// long-press the widget → Edit → Script: ALI · When interacting: Open URL · URL: https://life-control-center-eta.vercel.app/today
//
// It shows today's progress, what's next and open to-dos, in the app's own look.
// Data comes from /api/widget; iOS refreshes widgets every 10–30 minutes on its own.

const BASE = "https://life-control-center-eta.vercel.app";
const VIOLET = new Color("#8B7CF0");
const BG = new Color("#15161C");
const INK = new Color("#F2F2F7");
const INK3 = new Color("#8E8E9A");
const LINE = new Color("#262833");
const POS = new Color("#5FBF8A");

let d = null;
try {
  const req = new Request(BASE + "/api/widget");
  req.timeoutInterval = 8;
  d = await req.loadJSON();
} catch (e) { d = null; }

const w = new ListWidget();
w.backgroundColor = BG;
w.setPadding(14, 16, 14, 16);
w.url = BASE + "/today";
w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);

const small = config.widgetFamily === "small";

if (!d) {
  const t = w.addText("A L I");
  t.font = Font.semiboldSystemFont(15); t.textColor = INK;
  w.addSpacer(6);
  const s = w.addText("Couldn't reach the app — tap to open it.");
  s.font = Font.systemFont(13); s.textColor = INK3;
  Script.setWidget(w); Script.complete();
} else {
  // Head: name + streak
  const head = w.addStack(); head.centerAlignContent();
  const name = head.addText("A L I");
  name.font = Font.semiboldSystemFont(13); name.textColor = INK3;
  head.addSpacer();
  if (d.streak >= 2) {
    const st = head.addText(`🔥 ${d.streak}`);
    st.font = Font.mediumSystemFont(13); st.textColor = INK3;
  }
  w.addSpacer(6);

  // Progress: big count + bar
  const count = w.addText(`${d.done} / ${d.total} done`);
  count.font = Font.boldMonospacedSystemFont(small ? 20 : 22); count.textColor = INK;
  w.addSpacer(6);
  const bar = w.addStack(); bar.size = new Size(0, 6); bar.cornerRadius = 3; bar.backgroundColor = LINE;
  const pct = d.total ? d.done / d.total : 0;
  const fill = bar.addStack(); fill.backgroundColor = pct >= 1 ? POS : VIOLET; fill.cornerRadius = 3;
  const width = (small ? 158 - 32 : 338 - 32);
  fill.size = new Size(Math.max(6, Math.round(width * pct)), 6);
  bar.addSpacer();
  w.addSpacer(10);

  // Next steps
  const rows = small ? d.next.slice(0, 2) : d.next;
  if (rows.length === 0) {
    const ok = w.addText(d.total && d.done >= d.total ? "All done for now ✓" : "Nothing due right now");
    ok.font = Font.systemFont(14); ok.textColor = INK3;
  }
  for (const n of rows) {
    const r = w.addStack(); r.centerAlignContent();
    const box = r.addStack(); box.size = new Size(14, 14); box.cornerRadius = 4; box.borderWidth = 1.5; box.borderColor = INK3;
    r.addSpacer(8);
    const label = r.addText(`${n.emoji ? n.emoji + " " : ""}${n.title}`);
    label.font = Font.mediumSystemFont(14); label.textColor = INK; label.lineLimit = 1;
    w.addSpacer(5);
  }

  // Foot: to-dos due
  w.addSpacer();
  const foot = w.addStack(); foot.centerAlignContent();
  const work = d.todosWork ? ` · ${d.todosWork} work` : "";
  const td = foot.addText(d.todosDue === 0 ? "No to-dos due" : `${d.todosDue} to-do${d.todosDue === 1 ? "" : "s"} due${work}`);
  td.font = Font.systemFont(13); td.textColor = d.todosDue ? VIOLET : INK3;
  foot.addSpacer();
  if (d.trainedToday) { const tr = foot.addText("🏋️ trained"); tr.font = Font.systemFont(13); tr.textColor = INK3; }

  Script.setWidget(w);
  if (!config.runsInWidget) await w.presentMedium();
  Script.complete();
}
