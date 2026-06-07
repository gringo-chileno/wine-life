#!/usr/bin/env python3
"""Phase 2 helper: find candidate winery photos in the macOS Photos library by
date (and optionally GPS), then export copies to a staging folder for review.

This reads the Photos library read-only and exports COPIES. It never modifies
the library. Review the staging folder, keep the non-people scenery/wine shots,
then run optimize_photos.py on the ones you keep.

Requires osxphotos:
    python3 -m pip install --user osxphotos

Usage:
    # All photos taken on a date range:
    python3 scripts/find_photos.py --slug vina-montes --from 2025-11-15 --to 2025-11-15

    # Narrow to photos near a GPS point (lat,lng) within N km:
    python3 scripts/find_photos.py --slug vina-montes --from 2025-11-15 --to 2025-11-15 \\
        --near -34.64,-71.16 --km 3

Exports to: scripts/_staging/<slug>/
"""

import argparse
import math
import sys
from datetime import datetime, timedelta
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
STAGING = REPO / "scripts" / "_staging"


def haversine_km(a, b):
    (lat1, lon1), (lat2, lon2) = a, b
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    h = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def main():
    ap = argparse.ArgumentParser(description="Find candidate winery photos by date/GPS.")
    ap.add_argument("--slug", required=True, help="winery slug (staging subfolder name)")
    ap.add_argument("--from", dest="dfrom", required=True, help="YYYY-MM-DD")
    ap.add_argument("--to", dest="dto", required=True, help="YYYY-MM-DD")
    ap.add_argument("--near", help="lat,lng to filter around (optional)")
    ap.add_argument("--km", type=float, default=3.0, help="radius in km for --near (default 3)")
    ap.add_argument("--limit", type=int, default=80, help="max photos to export")
    args = ap.parse_args()

    try:
        import osxphotos
    except ImportError:
        sys.exit("osxphotos not installed. Run: python3 -m pip install --user osxphotos")

    d0 = datetime.strptime(args.dfrom, "%Y-%m-%d")
    d1 = datetime.strptime(args.dto, "%Y-%m-%d") + timedelta(days=1)
    center = None
    if args.near:
        lat, lng = (float(x) for x in args.near.split(","))
        center = (lat, lng)

    print("Opening Photos library (read-only)...")
    db = osxphotos.PhotosDB()
    photos = db.photos()

    picked = []
    for p in photos:
        if p.ismissing or p.date is None:
            continue
        dt = p.date.replace(tzinfo=None)
        if not (d0 <= dt < d1):
            continue
        if center is not None:
            if not p.location or p.location[0] is None:
                continue
            if haversine_km(center, p.location) > args.km:
                continue
        picked.append(p)

    picked.sort(key=lambda p: p.date)
    picked = picked[: args.limit]

    # Report the photos' own GPS so a winery's location can come straight from
    # where you actually stood (the "from photos" source). Falls back to
    # scripts/geocode.py (by name) when none of the photos are geotagged.
    gps = [p.location for p in picked if p.location and p.location[0] is not None]
    if gps:
        lats = sorted(g[0] for g in gps)
        lngs = sorted(g[1] for g in gps)
        mid = len(lats) // 2
        mlat = lats[mid] if len(lats) % 2 else (lats[mid - 1] + lats[mid]) / 2
        mlng = lngs[mid] if len(lngs) % 2 else (lngs[mid - 1] + lngs[mid]) / 2
        print('Photo GPS (median of %d geotagged): "location": { "lat": %.7f, "lng": %.7f }'
              % (len(gps), mlat, mlng))
    else:
        print("No geotagged photos here. Use scripts/geocode.py to look the winery up by name.")
    print()

    out = STAGING / args.slug
    out.mkdir(parents=True, exist_ok=True)
    print(f"Found {len(picked)} candidate(s). Exporting copies to {out} ...")

    exported = 0
    for p in picked:
        try:
            p.export(str(out), use_photos_export=False)
            exported += 1
        except Exception as e:
            print(f"  skip {p.original_filename}: {e}")

    print(f"\nExported {exported} file(s) to {out}")
    print("Review them, delete any with people or that you don't want, then run:")
    print(f"  python3 scripts/optimize_photos.py {args.slug} {out}")


if __name__ == "__main__":
    main()
