"""Compose the reference-vs-local comparison sheets in report/."""
from PIL import Image, ImageDraw, ImageChops
import os

ROOT = r"C:\oss\Project\speedtest"
REP = os.path.join(ROOT, "report")
TARGET_H = 120

def ink_bbox(im, invert=None):
    """Bounding box of the glyph ink. Handles both dark-on-light and light-on-dark."""
    g = im.convert("L")
    w, h = g.size
    px = g.load()
    bg = px[0, 0]
    if invert is None:
        invert = bg > 128          # light background -> ink is darker
    xs, ys = [], []
    for y in range(h):
        for x in range(w):
            v = px[x, y]
            if (v < bg - 60) if invert else (v > bg + 60):
                xs.append(x)
                ys.append(y)
    if not xs:
        return (0, 0, w, h)
    return (min(xs), min(ys), max(xs) + 1, max(ys) + 1)

def norm(im, h=TARGET_H):
    return im.resize((round(im.width * h / im.height), h), Image.LANCZOS)

# ---------------------------------------------------------------- numbers
# Requires tools/number-diff.mjs and tools/number-polarity.mjs to have run first:
#   number-ref-48px.png   reference result page, gauge-mono 48px, DPR 1
#   number-local-48px.png this component, 36 svg units == 48 css px, DPR 1
#   number-html.png       plain HTML twin of the same string, same engine
def mask(path):
    g = Image.open(os.path.join(REP, path)).convert("L")
    bg = g.load()[0, 0]
    return g if bg <= 128 else g.point(lambda v: 255 - v)   # normalise to white-on-black

rows = [
    ("reference  speedtest.net result page  gauge-mono 48px  (live crop, ink inverted)", "number-ref-48px.png"),
    ("local  SVG <text>  36 svg units == 48 css px  (this component)", "number-local-48px.png"),
    ("local  HTML <div>  same font / size / colour  (same-engine control)", "number-html.png"),
]
try:
    imgs = [(t, mask(f)) for t, f in rows]
except FileNotFoundError as exc:
    print("skipping compare-numbers.png:", exc)
    imgs = []

if imgs:
    probe = ImageDraw.Draw(Image.new("RGB", (1, 1)))
    W = max([int(probe.textlength(t)) for t, _ in imgs] + [i.width + 40 for _, i in imgs])
    H = sum(i.height for _, i in imgs) + 3 * 24 + 16
    sheet = Image.new("RGB", (W, H), (6, 6, 6))
    d = ImageDraw.Draw(sheet)
    y = 10
    for t, i in imgs:
        d.text((8, y), t, fill=(150, 150, 150))
        y += 18
        sheet.paste(i.convert("RGB"), ((W - i.width) // 2, y))
        y += i.height + 14
    sheet.resize((W * 2, H * 2), Image.NEAREST).save(os.path.join(REP, "compare-numbers.png"))
    print("compare-numbers.png", (W * 2, H * 2))

# ---------------------------------------------------------------- ring strip
Image.open(os.path.join(ROOT, "shots", "compare-ring.png")).save(os.path.join(REP, "compare-ring.png"))

# ---------------------------------------------------------------- overview
ids = ["local-idle", "local-low", "local-mid", "local-high", "local-upload", "local-done"]
tile, pad, cols = 380, 14, 3
rows = (len(ids) + cols - 1) // cols
ov = Image.new("RGB", (cols * (tile + pad) + pad, rows * (tile + pad) + pad + 30), (5, 5, 5))
d = ImageDraw.Draw(ov)
d.text((pad, 9), "local gauge - idle / 8 / 155.61 / 862 / upload 341 / done", fill=(160, 160, 160))
for i, name in enumerate(ids):
    im = Image.open(os.path.join(REP, f"{name}.png")).convert("RGB").resize((tile, tile), Image.LANCZOS)
    ov.paste(im, (pad + (i % cols) * (tile + pad), 30 + pad + (i // cols) * (tile + pad)))
ov.save(os.path.join(REP, "overview-states.png"))
print("overview-states.png", ov.size)
