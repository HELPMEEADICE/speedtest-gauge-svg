import numpy as np

def p3_to_srgb(rgb):
    def to_lin(c):
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    def to_srgb(c):
        c = np.clip(c, 0, 1)
        return 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055
    v = [to_lin(c) for c in rgb]
    m = np.array([[0.4865709, 0.2656677, 0.1982173],
                  [0.2289746, 0.6917385, 0.0792869],
                  [0.0000000, 0.0451134, 1.0439444]])
    xyz = m @ np.array(v)
    m2 = np.array([[3.2404542, -1.5371385, -0.4985314],
                   [-0.9692660, 1.8760108, 0.0415560],
                   [0.0556434, -0.2040259, 1.0572252]])
    out = m2 @ xyz
    return [to_srgb(c) for c in out]

for name, rgb in {
    "T70 accentTeal": (0.0, 0.773, 0.749),
    "P50 accentPurple": (0.671, 0.380, 0.910),
    "D100 secondary": (0.399, 0.399, 0.399),
    "L10 white": (1.0, 1.0, 1.0),
}.items():
    s = p3_to_srgb(rgb)
    print(f"{name:18s} -> #{int(round(s[0]*255)):02x}{int(round(s[1]*255)):02x}{int(round(s[2]*255)):02x}  {[round(c,4) for c in s]}")
