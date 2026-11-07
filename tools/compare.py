"""Pixel-level verification of the local render against the sampled production assets.

Fixes over v1
  * colour sampling skips the two clip edges (t=0 / t=1) where the sector boundary is
    legitimately antialiased
  * the radial profile is taken at 17 deg, i.e. between two tick labels, so label ink
    cannot be mistaken for the ring
  * the needle axis is searched only inside r < 84 user units, where labels cannot reach
"""
from PIL import Image, ImageDraw
import json, math, os

ROOT = r"C:\oss\Project\speedtest"
SHOTS = os.path.join(ROOT, "shots")
VB = 286.0
PAD = 8
CSS = 440.0

def frame(name):
    im = Image.open(os.path.join(SHOTS, name)).convert("RGB")
    W, _ = im.size
    s = W / (CSS + PAD * 2)
    origin = PAD * s
    size = CSS * s
    return im, origin + size / 2, size / VB          # im, centre (px), units-per-px

def hx(px):
    return "#%02x%02x%02x" % tuple(px[:3])

def rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

def dist(a, b):
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))

def px_at(im, cx, cy, r_px, deg):
    rad = math.radians(deg - 90)
    return im.getpixel((int(round(cx + r_px * math.cos(rad))), int(round(cy + r_px * math.sin(rad)))))

stops = json.load(open(os.path.join(ROOT, "research", "gradient-samples.json")))
ref = stops["dl-multi"]["arc"]

im, c, upp = frame("gigabit.png")

# ---------------------------------------------------------------- 1. colours
print("== 1. ring colour vs production asset ==")
rows = []
for i, s in enumerate(ref):
    if i == 0 or i == len(ref) - 1:
        rows.append((s["t"], s["hex"], "clip-edge", None))       # sector boundary, skip
        continue
    got = px_at(im, c, c, 130 * upp, s["deg"])
    rows.append((s["t"], s["hex"], hx(got), dist(got, rgb(s["hex"]))))
for i, r in enumerate(rows):
    if i % 3 == 0:
        d = "  edge" if r[3] is None else f"{r[3]:5.1f}"
        print(f"  idx={i:2d} t={r[0]:.3f} asset={r[1]} local={r[2]} dE={d}")
ds = [r[3] for r in rows if r[3] is not None]
print(f"  interior samples={len(ds)}  max dE={max(ds):.1f}  mean dE={sum(ds)/len(ds):.1f}  (0-441 RGB Euclidean)")

# --------------------------------------------------------------- 2. geometry
print("== 2. ring geometry (radial scan at 17 deg, label-free) ==")
lit = []
for rr in range(int(90 * upp), int(160 * upp)):
    v = px_at(im, c, c, rr, 17)
    if sum(v) > 45:
        lit.append(rr / upp)
if lit:
    inner, outer = min(lit), max(lit)
    print(f"  band r={inner:.2f}..{outer:.2f}  width={outer-inner:.2f}   spec 118.5..141.5 / 23.0")
    print(f"  error: inner {inner-118.5:+.2f}  outer {outer-141.5:+.2f}  width {(outer-inner)-23:+.2f}")

# --------------------------------------------------------------- 3. needle
print("== 3. needle axis (r < 84 units only) ==")
scores = []
for a in range(-135, 136):
    tot = 0
    for rr in range(int(30 * upp), int(82 * upp)):
        tot += sum(px_at(im, c, c, rr, a))
    scores.append((tot, a))
scores.sort(reverse=True)
print("  top angle candidates:", [s[1] for s in scores[:5]])
peak = scores[0][1]
print(f"  measured needle angle={peak}  analytic(1000 Mbps -> clamp)=135  error={peak-135:+d} deg")

# ------------------------------------------------------------ 4. comparison
SHEET = Image.new("RGB", (720, 210), (0, 0, 0))
ld = ImageDraw.Draw(SHEET)
ld.text((10, 6), "reference: production gauge-gradient-dl-multi-web.png sampled along the ring", fill=(150, 150, 150))
ld.text((370, 6), "local: shots/gigabit.png sampled the same way", fill=(150, 150, 150))
for i, (t, want, got, d) in enumerate(rows):
    x0 = 10 + i * 12.6
    if want:
        ld.rectangle([x0, 40, x0 + 12, 130], fill=rgb(want))
    if got and got.startswith("#"):
        ld.rectangle([370 + i * 12.6, 40, 382 + i * 12.6, 130], fill=rgb(got))
ld.text((10, 150), f"max dE {max(ds):.0f} / mean dE {sum(ds)/len(ds):.1f} over {len(ds)} interior samples", fill=(210, 210, 210))
SHEET.resize((1440, 420), Image.NEAREST).save(os.path.join(SHOTS, "compare-ring.png"))
print("wrote shots/compare-ring.png")
