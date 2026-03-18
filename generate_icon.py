"""Generate CycleIQ app icon: black bg, rounded corners, green glow, frosted glass C."""

from PIL import Image, ImageDraw, ImageFilter, ImageChops
import math

SIZE = 1024
RADIUS = 180
GREEN = (0, 229, 160)

# --- Rounded corner mask ---
mask = Image.new("L", (SIZE, SIZE), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, SIZE, SIZE], radius=RADIUS, fill=255)

# --- Black background ---
img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 255))

# --- Build C shape mask first (needed for glow placement) ---
c_cx, c_cy = SIZE // 2, SIZE // 2
outer_r = 295
inner_r = 205
gap_half_deg = 43

# Outer circle mask
outer = Image.new("L", (SIZE, SIZE), 0)
ImageDraw.Draw(outer).ellipse(
    [c_cx - outer_r, c_cy - outer_r, c_cx + outer_r, c_cy + outer_r], fill=255
)

# Inner circle mask (hole)
inner = Image.new("L", (SIZE, SIZE), 0)
ImageDraw.Draw(inner).ellipse(
    [c_cx - inner_r, c_cy - inner_r, c_cx + inner_r, c_cy + inner_r], fill=255
)

# Gap wedge mask (opening on right side of C)
gap = Image.new("L", (SIZE, SIZE), 0)
gap_draw = ImageDraw.Draw(gap)
wl = SIZE * 2
a_top = math.radians(-gap_half_deg)
a_bot = math.radians(gap_half_deg)
pts = [
    (c_cx, c_cy),
    (c_cx + int(wl * math.cos(a_top)), c_cy + int(wl * math.sin(a_top))),
    (c_cx + wl, c_cy),
    (c_cx + int(wl * math.cos(a_bot)), c_cy + int(wl * math.sin(a_bot))),
]
gap_draw.polygon(pts, fill=255)

# Round the ends of the C
end_r = (outer_r - inner_r) // 2
mid_r = (outer_r + inner_r) / 2
for angle_deg in [gap_half_deg, -gap_half_deg]:
    rad = math.radians(angle_deg)
    ex = c_cx + int(mid_r * math.cos(rad))
    ey = c_cy + int(mid_r * math.sin(rad))
    ImageDraw.Draw(outer).ellipse(
        [ex - end_r, ey - end_r, ex + end_r, ey + end_r], fill=255
    )

# C mask = outer - inner - gap
c_mask = ImageChops.subtract(outer, inner)
c_mask = ImageChops.subtract(c_mask, gap)

# --- Radial gradient glow (green, behind C) ---
glow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
max_r = int(SIZE * 0.44)
glow_draw = ImageDraw.Draw(glow)
for r in range(max_r, 0, -2):
    t = r / max_r
    alpha = int(90 * (1 - t ** 1.3))
    if alpha < 1:
        continue
    bbox = [c_cx - r, c_cy - r, c_cx + r, c_cy + r]
    glow_draw.ellipse(bbox, fill=(GREEN[0], GREEN[1], GREEN[2], alpha))
glow = glow.filter(ImageFilter.GaussianBlur(radius=50))
img = Image.alpha_composite(img, glow)

# --- Green outer glow tightly around C shape ---
c_glow_blur = c_mask.copy().filter(ImageFilter.GaussianBlur(radius=30))
c_glow_blur = c_glow_blur.point(lambda p: min(255, int(p * 1.0)))
green_glow_layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
green_fill = Image.new("RGBA", (SIZE, SIZE), (GREEN[0], GREEN[1], GREEN[2], 120))
green_glow_layer = Image.composite(green_fill, green_glow_layer, c_glow_blur)
img = Image.alpha_composite(img, green_glow_layer)

# --- Frosted glass C: semi-transparent white fill ---
glass_base = Image.new("RGBA", (SIZE, SIZE), (255, 255, 255, 55))
glass_layer = Image.composite(glass_base, Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0)), c_mask)
img = Image.alpha_composite(img, glass_layer)

# --- Edge / inner glow on C (bright white edges for glass look) ---
edges = c_mask.filter(ImageFilter.FIND_EDGES)
edges = edges.filter(ImageFilter.GaussianBlur(radius=4))
edges = edges.point(lambda p: min(255, int(p * 4.0)))
edge_layer = Image.new("RGBA", (SIZE, SIZE), (255, 255, 255, 200))
edge_comp = Image.composite(edge_layer, Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0)), edges)
edge_comp_masked = Image.composite(edge_comp, Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0)), c_mask)
img = Image.alpha_composite(img, edge_comp_masked)

# --- Softer inner edge glow (wider, dimmer) ---
edges2 = c_mask.filter(ImageFilter.FIND_EDGES)
edges2 = edges2.filter(ImageFilter.GaussianBlur(radius=12))
edges2 = edges2.point(lambda p: min(255, int(p * 1.8)))
edge_layer2 = Image.new("RGBA", (SIZE, SIZE), (255, 255, 255, 90))
edge_comp2 = Image.composite(edge_layer2, Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0)), edges2)
edge_comp2_masked = Image.composite(edge_comp2, Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0)), c_mask)
img = Image.alpha_composite(img, edge_comp2_masked)

# --- Subtle green tint on the C ---
green_tint = Image.new("RGBA", (SIZE, SIZE), (GREEN[0], GREEN[1], GREEN[2], 22))
green_tint_masked = Image.composite(green_tint, Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0)), c_mask)
img = Image.alpha_composite(img, green_tint_masked)

# --- Specular highlight on upper-left portion of C (glass reflection) ---
highlight = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
h_draw = ImageDraw.Draw(highlight)
for i in range(180):
    t = i / 180
    a = int(40 * (1 - t ** 0.8))
    if a < 1:
        continue
    h_draw.ellipse(
        [c_cx - 260 - 30, c_cy - 300 + i, c_cx + 180, c_cy - 180 + i],
        fill=(255, 255, 255, a),
    )
highlight_masked = Image.composite(highlight, Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0)), c_mask)
img = Image.alpha_composite(img, highlight_masked)

# --- Apply rounded corner mask ---
final = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
final = Image.composite(img, final, mask)

final.save("C:/Users/Luka/Downloads/CyclingHub/icon.png", "PNG")
print(f"Icon saved: {SIZE}x{SIZE}")
