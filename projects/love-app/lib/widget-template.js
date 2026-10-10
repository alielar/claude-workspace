// Love: shows the latest photo from your partner. Set up by love-app, nothing to edit here.
const BASE = "__BASE__";
const KEY = "__KEY__";

const fm = FileManager.local();
const dir = fm.joinPath(fm.documentsDirectory(), "love");
if (!fm.fileExists(dir)) fm.createDirectory(dir);
const imgPath = fm.joinPath(dir, "latest.jpg");
const metaPath = fm.joinPath(dir, "latest.json");

const readMeta = () => (fm.fileExists(metaPath) ? JSON.parse(fm.readString(metaPath)) : null);

// Shrink and crop the photo to the widget's shape, so iOS never refuses it as too large.
function fit(image, w, h) {
  const s = Math.max(w / image.size.width, h / image.size.height);
  const dw = image.size.width * s, dh = image.size.height * s;
  const ctx = new DrawContext();
  ctx.size = new Size(w, h);
  ctx.opaque = true;
  ctx.respectScreenScale = false;
  ctx.drawImageInRect(image, new Rect((w - dw) / 2, (h - dh) / 2, dw, dh));
  return ctx.getImage();
}

const family = config.widgetFamily || "large";
const shape = { small: [500, 500], medium: [1000, 470], large: [1000, 1050], extraLarge: [1400, 660] }[family] || [1000, 1050];

let meta = readMeta();
let image = null;
try {
  const req = new Request(`${BASE}/api/photos?limit=1&k=${KEY}`);
  req.timeoutInterval = 12;
  const res = await req.loadJSON();
  const latest = res.photos && res.photos[0];
  if (latest) {
    const shapeKey = shape.join("x");
    if (!meta || meta.url !== latest.url || meta.shape !== shapeKey || !fm.fileExists(imgPath)) {
      const raw = await new Request(latest.url).loadImage();
      image = fit(raw, shape[0], shape[1]);
      fm.writeImage(imgPath, image);
    }
    meta = { ...latest, shape: shapeKey };
    fm.writeString(metaPath, JSON.stringify(meta));
  }
} catch (e) {
  // Offline or server down: keep showing the last photo.
}
if (!image && fm.fileExists(imgPath)) image = fm.readImage(imgPath);

const w = new ListWidget();
w.url = `${BASE}/?k=${KEY}`;
w.refreshAfterDate = new Date(Date.now() + 60 * 1000);

if (image) {
  w.backgroundImage = image;
  w.addSpacer();
  if (meta && meta.at) {
    const row = w.addStack();
    row.centerAlignContent();
    row.backgroundColor = new Color("#000000", 0.35);
    row.cornerRadius = 10;
    row.setPadding(4, 8, 4, 8);
    const d = row.addDate(new Date(meta.at));
    d.applyRelativeStyle();
    d.font = Font.semiboldSystemFont(13);
    d.textColor = Color.white();
    const ago = row.addText(" ago");
    ago.font = Font.semiboldSystemFont(13);
    ago.textColor = Color.white();
  }
} else {
  w.backgroundColor = new Color("#F4D6DC");
  w.addSpacer();
  const t = w.addText("No photo yet");
  t.font = Font.semiboldSystemFont(17);
  t.textColor = new Color("#7A2E3E");
  t.centerAlignText();
  w.addSpacer();
}

if (config.runsInWidget) {
  Script.setWidget(w);
} else {
  await w.presentLarge();
}
Script.complete();
