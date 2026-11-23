"""Generate PWA icon PNGs from the school icon SVG"""
import cairosvg
from PIL import Image
import io
import os

svg_path = "/home/z/my-project/public/icon.svg"
output_dir = "/home/z/my-project/public"

sizes = [72, 96, 128, 144, 152, 192, 384, 512]

for size in sizes:
    # Convert SVG to PNG at the target size
    png_data = cairosvg.svg2png(
        url=svg_path,
        output_width=size,
        output_height=size,
    )
    
    # Save the PNG
    if size == 192:
        output_path = os.path.join(output_dir, "icon-192x192.png")
    elif size == 512:
        output_path = os.path.join(output_dir, "icon-512x512.png")
    else:
        output_path = os.path.join(output_dir, f"icon-{size}x{size}.png")
    
    with open(output_path, "wb") as f:
        f.write(png_data)
    
    print(f"Generated {output_path} ({size}x{size})")

# Also create a favicon.ico from the 32x32 version
png_32 = cairosvg.svg2png(url=svg_path, output_width=32, output_height=32)
img = Image.open(io.BytesIO(png_32))
favicon_path = os.path.join(output_dir, "favicon.ico")
img.save(favicon_path, format="ICO", sizes=[(16,16), (32,32), (48,48)])
print(f"Generated {favicon_path}")

# Create apple-touch-icon (180x180)
png_180 = cairosvg.svg2png(url=svg_path, output_width=180, output_height=180)
apple_path = os.path.join(output_dir, "apple-touch-icon.png")
with open(apple_path, "wb") as f:
    f.write(png_180)
print(f"Generated {apple_path}")

print("\nAll icons generated successfully!")
