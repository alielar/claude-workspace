// A L I — home-screen widget for Scriptable (design 3 · "The Ring").
//
// Install: in A L I → Settings → Home-screen widget → "Open the script", select all, copy;
// then in Scriptable open the script named "ALI", select everything, paste over, Done.
//
// A progress ring around the ATE ligature. Bottom line: "3 of 5 | VI" —
// items done today, then the current streak in Roman numerals. A violet dot
// sits at the numeral's top-right when the streak ties or beats the record.
// Data from /api/widget; iOS refreshes widgets every 10–30 minutes on its own.

const BASE = "https://life-control-center-eta.vercel.app";
const KEY = "";   // filled in automatically when you copy the script from Settings

const INK = new Color("#F2F2F7");
const INK3 = new Color("#8E8E9A");
const BG = new Color("#15161C");
const TRACK = new Color("#262833");
const VIOLET = new Color("#8B7CF0");

function roman(n) {
  if (n < 1) return "";
  const table = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
    [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let out = "";
  for (const [v, s] of table) while (n >= v) { out += s; n -= v; }
  return out;
}

// Ring + ligature drawn in one image. Arcs are polylines (DrawContext has no arc
// primitive); round ends are simulated with end-cap circles.
function drawRing(sizePt, pct) {
  const dc = new DrawContext();
  dc.size = new Size(sizePt, sizePt);
  dc.opaque = false;
  dc.respectScreenScale = true;
  const c = sizePt / 2;
  const rw = sizePt * 0.075;                 // ring stroke width
  const r = c - rw / 2 - 1;                  // ring radius
  const arc = (from, to, color) => {
    dc.setStrokeColor(color); dc.setFillColor(color); dc.setLineWidth(rw);
    const p = new Path();
    const steps = Math.max(2, Math.ceil((to - from) / 0.05));
    for (let i = 0; i <= steps; i++) {
      const a = from + ((to - from) * i) / steps;
      const pt = new Point(c + r * Math.cos(a), c + r * Math.sin(a));
      if (i === 0) p.move(pt); else p.addLine(pt);
    }
    dc.addPath(p); dc.strokePath();
    for (const a of [from, to]) {
      dc.fillEllipse(new Rect(c + r * Math.cos(a) - rw / 2, c + r * Math.sin(a) - rw / 2, rw, rw));
    }
  };
  arc(0, Math.PI * 2, TRACK);
  if (pct > 0) {
    const start = -Math.PI / 2;
    arc(start, start + Math.PI * 2 * Math.min(1, pct), pct >= 1 ? VIOLET : VIOLET);
  }
  // The ligature, centred inside the ring (same 512-grid as the app icon).
  const glyph = sizePt * 0.46;
  const ox = (sizePt - glyph) / 2, oy = (sizePt - glyph) / 2;
  const k = glyph / 512, lw = 56 * k;
  dc.setStrokeColor(INK); dc.setFillColor(INK); dc.setLineWidth(lw);
  const segs = [[112, 140, 430, 140], [300, 140, 300, 404], [292, 146, 118, 404], [158, 300, 424, 300], [300, 404, 424, 404]];
  for (const [x1, y1, x2, y2] of segs) {
    const p = new Path();
    p.move(new Point(ox + x1 * k, oy + y1 * k));
    p.addLine(new Point(ox + x2 * k, oy + y2 * k));
    dc.addPath(p); dc.strokePath();
    for (const [x, y] of [[x1, y1], [x2, y2]]) dc.fillEllipse(new Rect(ox + x * k - lw / 2, oy + y * k - lw / 2, lw, lw));
  }
  return dc.getImage();
}

let d = null;
try {
  const req = new Request(BASE + "/api/widget");
  req.headers = { "x-app-key": KEY };
  req.timeoutInterval = 8;
  d = await req.loadJSON();
} catch (e) { d = null; }

const w = new ListWidget();
w.backgroundColor = BG;
w.url = BASE + "/today";
w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
w.setPadding(10, 10, 12, 10);

const pct = d && d.total ? d.done / d.total : 0;

w.addSpacer();
const mid = w.addStack();
mid.addSpacer();
const img = mid.addImage(drawRing(300, pct));
img.imageSize = new Size(config.widgetFamily === "medium" ? 104 : 96, config.widgetFamily === "medium" ? 104 : 96);
mid.addSpacer();
w.addSpacer(8);

const lineStack = w.addStack();
lineStack.centerAlignContent();
lineStack.addSpacer();
if (!d) {
  const t = lineStack.addText("tap to open");
  t.font = Font.mediumSystemFont(13); t.textColor = INK3;
} else {
  const countTxt = lineStack.addText(`${d.done} of ${d.total}`);
  countTxt.font = Font.mediumSystemFont(13);
  countTxt.textColor = d.done >= d.total && d.total > 0 ? VIOLET : INK3;
  const streak = d.streak ?? 0;
  if (streak >= 1) {
    // "|" as a drawn divider so it is a perfectly straight vertical line.
    lineStack.addSpacer(7);
    const bar = lineStack.addStack();
    bar.size = new Size(1.5, 13);
    bar.backgroundColor = INK3;
    lineStack.addSpacer(7);
    const num = lineStack.addText(roman(streak));
    num.font = Font.mediumSystemFont(13);
    num.textColor = INK;
    if (d.bestStreak !== undefined && streak >= d.bestStreak) {
      // Record day: a small violet dot at the numeral's top-right corner.
      const sup = lineStack.addStack();
      sup.layoutVertically();
      const dot = sup.addText("●");
      dot.font = Font.systemFont(6);
      dot.textColor = VIOLET;
      sup.addSpacer(8);
    }
  }
}
lineStack.addSpacer();
w.addSpacer();

Script.setWidget(w);
if (!config.runsInWidget) await w.presentSmall();
Script.complete();
