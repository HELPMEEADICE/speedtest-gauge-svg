"""Sample the real gauge-gradient assets along the arc ring to recover the gradient stops."""
from PIL import Image
import math, json, os

BASE = r"C:\oss\Project\speedtest\research"
FILES = {
    "dl-multi": "gauge-gradient-dl-multi-web-C__WQ3QL.png",
    "ul-multi": "gauge-gradient-ul-multi-web-BaUcwGfE.png",
    "dl-single": "gauge-gradient-dl-single-web-BoyDl7Ow.png",
    "ul-single": "gauge-gradient-ul-single-web-CHz2mjhc.png",
}

def hx(px):
    r, g, b = px[:3]
    return "#%02x%02x%02x" % (r, g, b)

out = {}
for key, fn in FILES.items():
    p = os.path.join(BASE, fn)
    im = Image.open(p).convert("RGBA")
    W, H = im.size
    # viewBox is 286 (2*2.2*130); the <image> is placed at width/height 285.
    cx = cy = W / 2.0
    scale = W / 286.0
    r_mid = 130 * scale
    samples = []
    for i in range(0, 28):
        t = i / 27.0
        ang = -135 + 270 * t          # gauge angle in degrees, 0 = top
        rad = math.radians(ang - 90)
        x = cx + r_mid * math.cos(rad)
        y = cy + r_mid * math.sin(rad)
        px = im.getpixel((int(round(x)), int(round(y))))
        samples.append({"t": round(t, 4), "deg": round(ang, 2), "rgb": px[:3], "hex": hx(px), "a": px[3]})
    # radial profile across the stroke at the 0-label position (bottom-left) and at top
    radial = {}
    for label, ang in (("start", -135), ("mid", 0), ("end", 135)):
        rad = math.radians(ang - 90)
        prof = []
        for rr in range(100, 150):
            x = cx + (rr * scale) * math.cos(rad)
            y = cy + (rr * scale) * math.sin(rad)
            if 0 <= x < W and 0 <= y < H:
                prof.append({"r": rr, "hex": hx(im.getpixel((int(x), int(y)))), "a": im.getpixel((int(x), int(y)))[3]})
        radial[label] = prof
    out[key] = {"size": [W, H], "arc": samples, "radial": radial}
    print(f"{key}: {W}x{H} center={cx:.1f} r_mid={r_mid:.1f}")
    print("   " + " ".join(f"{s['hex']}" for s in samples[::3]))

with open(os.path.join(BASE, "gradient-samples.json"), "w") as f:
    json.dump(out, f, indent=1)

# contact sheet so the assets can be eyeballed
sheet = Image.new("RGB", (W * 4, H), (20, 20, 20))
for i, fn in enumerate(FILES.values()):
    sheet.paste(Image.open(os.path.join(BASE, fn)).convert("RGB"), (i * W, 0))
sheet.save(os.path.join(BASE, "shots", "ref-gradient-assets.png"))
print("sheet saved")
