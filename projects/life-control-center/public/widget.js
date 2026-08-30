// A L I — home-screen widget for Scriptable (design 2 · "Monogram").
//
// Install: in A L I → Settings → Home-screen widget → "Open the script", select all, copy;
// then in Scriptable open the script named "ALI", select everything, paste over, Done.
//
// The ATE ligature drawn large in the centre, one line of truth underneath.
// Data from /api/widget; iOS refreshes widgets every 10–30 minutes on its own.

const BASE = "https://life-control-center-eta.vercel.app";
const KEY = "";   // filled in automatically when you copy the script from Settings

const INK = new Color("#F2F2F7");
const INK3 = new Color("#8E8E9A");
const BG = new Color("#15161C");
const VIOLET = new Color("#8B7CF0");

// The mark, drawn in code — same 512-grid as the app icon, round caps simulated
// with end-cap circles (DrawContext has no cap setting).
function drawLigature(sizePt, color) {
  const dc = new DrawContext();
  dc.size = new Size(sizePt, sizePt);
  dc.opaque = false;
  dc.respectScreenScale = true;
  dc.setStrokeColor(color);
  dc.setFillColor(color);
  const k = sizePt / 512;
  const lw = 50 * sizePt / 512;
  dc.setLineWidth(lw);
  const segs = [
    [112, 140, 430, 140],  // top bar (T + A top + E top arm)
    [300, 140, 300, 404],  // stem (T + E spine)
    [292, 146, 118, 404],  // A diagonal
    [158, 300, 424, 300],  // shared crossbar (A bar + E middle arm)
    [300, 404, 424, 404],  // E bottom arm
  ];
  for (const [x1, y1, x2, y2] of segs) {
    const p = new Path();
    p.move(new Point(x1 * k, y1 * k));
    p.addLine(new Point(x2 * k, y2 * k));
    dc.addPath(p);
    dc.strokePath();
    for (const [x, y] of [[x1, y1], [x2, y2]]) {
      dc.fillEllipse(new Rect(x * k - lw / 2, y * k - lw / 2, lw, lw));
    }
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
w.setPadding(12, 12, 14, 12);

const small = config.widgetFamily !== "medium" && config.widgetFamily !== "large";
const markSize = small ? 78 : 92;

w.addSpacer();
const mid = w.addStack();
mid.addSpacer();
const img = mid.addImage(drawLigature(300, INK));
img.imageSize = new Size(markSize, markSize);
mid.addSpacer();
w.addSpacer(10);

const lineStack = w.addStack();
lineStack.addSpacer();
let line;
if (!d) {
  line = lineStack.addText("tap to open");
} else {
  const bits = [`${d.done} of ${d.total}`];
  bits.push(d.todosDue > 0 ? `${d.todosDue} due` : "no to-dos");
  if (d.streak >= 2) bits.push(`🔥 ${d.streak}`);
  line = lineStack.addText(bits.join(" · "));
  if (d.done >= d.total && d.total > 0) line.textColor = VIOLET;
}
line.font = Font.mediumSystemFont(13);
if (!line.textColor || !d || d.done < d.total) line.textColor = INK3;
lineStack.addSpacer();
w.addSpacer();

Script.setWidget(w);
if (!config.runsInWidget) await w.presentSmall();
Script.complete();
