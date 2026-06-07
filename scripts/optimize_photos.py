#!/usr/bin/env python3
"""Resize winery photos and strip ALL metadata (including GPS), then save them
into images/<slug>/ as web-friendly JPEGs.

The site is public, so this matters: it removes location/EXIF data before any
photo gets committed. People-photos should simply not be added at all.

Usage:
    python3 scripts/optimize_photos.py <slug> <file-or-folder> [more files...]

Examples:
    python3 scripts/optimize_photos.py vina-montes ~/Desktop/montes/
    python3 scripts/optimize_photos.py vina-montes a.jpg b.heic

Notes:
    - Output: images/<slug>/<originalname>.jpg, resized so the long edge <= 1600px.
    - HEIC works if pillow-heif is installed; otherwise convert with `sips` first.
"""

import os
import sys
from pathlib import Path

try:
    from PIL import Image, ImageOps
except Exception as _e:
    # On Apple Silicon the wheel must be arm64. A common failure is an x86_64
    # Pillow that imports the package but fails to load _imaging.
    sys.exit(
        "Pillow failed to load (" + type(_e).__name__ + "). Install an arm64 build:\n"
        "    python3 -m pip install --user --force-reinstall --no-cache-dir Pillow\n"
        "Original error: " + str(_e)
    )

# Optional HEIC support.
try:
    import pillow_heif  # noqa
    pillow_heif.register_heif_opener()
except ImportError:
    pass

MAX_EDGE = 1600
QUALITY = 82
EXTS = {".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp", ".tif", ".tiff"}
REPO = Path(__file__).resolve().parent.parent


def gather(inputs):
    files = []
    for item in inputs:
        p = Path(item).expanduser()
        if p.is_dir():
            files += [c for c in sorted(p.iterdir()) if c.suffix.lower() in EXTS]
        elif p.suffix.lower() in EXTS:
            files.append(p)
        else:
            print(f"  skip (unsupported): {p}")
    return files


def optimize(src: Path, out_dir: Path) -> Path:
    img = Image.open(src)
    img = ImageOps.exif_transpose(img)          # honor orientation, then drop EXIF
    img = img.convert("RGB")
    img.thumbnail((MAX_EDGE, MAX_EDGE), Image.LANCZOS)
    out = out_dir / (src.stem + ".jpg")
    # Saving a fresh RGB image with no exif= kwarg writes no metadata at all.
    img.save(out, "JPEG", quality=QUALITY, optimize=True, progressive=True)
    return out


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    slug = sys.argv[1]
    out_dir = REPO / "images" / slug
    out_dir.mkdir(parents=True, exist_ok=True)

    files = gather(sys.argv[2:])
    if not files:
        sys.exit("No supported image files found.")

    print(f"Optimizing {len(files)} photo(s) -> images/{slug}/")
    written = []
    for src in files:
        try:
            out = optimize(src, out_dir)
            kb = out.stat().st_size // 1024
            print(f"  {src.name}  ->  {out.name}  ({kb} KB)")
            written.append(out.name)
        except Exception as e:
            print(f"  FAILED {src.name}: {e}")

    if written:
        print("\nAdd these filenames to the winery's photos (in the editor or JSON):")
        for name in written:
            print(f'  "images/{slug}/{name}"')


if __name__ == "__main__":
    main()
