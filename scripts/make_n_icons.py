"""
Regenerate all app icons with the simple "N" logo design
(green background #166534 + white bold N), matching favicon.svg.
Outputs: favicon.ico, icon.svg (copy of design), all PWA PNGs, apple-touch-icon.png
"""
from PIL import Image, ImageDraw, ImageFont
import os
import shutil

BASE = "/home/z/my-project/public"
GREEN = (22, 101, 52, 255)      # #166534 - matches app primary green
WHITE = (255, 255, 255, 255)
FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

def make_icon(size: int, rounded: bool = False) -> Image.Image:
    """Draw the N logo at the given size. rounded=True uses rounded corners with transparency."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    if rounded:
        radius = max(2, int(size * 0.1875))  # rx=12/64 like favicon.svg
        draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=GREEN)
    else:
        draw.rectangle([0, 0, size, size], fill=GREEN)
    # Letter N centered, ~56% of icon size (like 36/64 in favicon.svg)
    font = ImageFont.truetype(FONT_PATH, max(8, int(size * 0.5625)))
    draw.text((size / 2, size / 2), "N", font=font, fill=WHITE, anchor="mm")
    return img

sizes = [72, 96, 128, 144, 152, 192, 384, 512]

# 1) PWA PNG icons (full bleed square - required for maskable purpose)
for s in sizes:
    make_icon(s, rounded=False).save(os.path.join(BASE, f"icon-{s}x{s}.png"))
    print(f"icon-{s}x{s}.png done")

# 2) apple-touch-icon.png (180x180, full bleed)
make_icon(180, rounded=False).save(os.path.join(BASE, "apple-touch-icon.png"))
print("apple-touch-icon.png done")

# 3) favicon.ico (multi-size, rounded corners for nicer tab look)
ico_sizes = [16, 32, 48]
ico_images = [make_icon(s, rounded=True) for s in ico_sizes]
ico_images[1].save(
    os.path.join(BASE, "favicon.ico"),
    format="ICO",
    sizes=[(s, s) for s in ico_sizes],
)
print("favicon.ico done")

# 4) icon.svg - same N design as favicon.svg (rounded rect + N)
svg = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="12" fill="#166534"/>
  <text x="32" y="44" font-family="Arial, sans-serif" font-size="36" font-weight="bold" fill="white" text-anchor="middle">N</text>
</svg>'''
with open(os.path.join(BASE, "icon.svg"), "w") as f:
    f.write(svg)
print("icon.svg done")

# 5) favicon.svg - ensure identical design
with open(os.path.join(BASE, "favicon.svg"), "w") as f:
    f.write(svg)
print("favicon.svg done")

print("ALL ICONS REGENERATED WITH N LOGO")
