#!/usr/bin/env python3
"""Fill missing winery coordinates from OpenStreetMap (Nominatim, no API key).

Reads data/wineries.json, geocodes every entry whose location is empty, and
writes the file back. Tries the winery name first (Nominatim knows most wineries
by name), then falls back to town/region. Honors Nominatim's usage policy with a
descriptive User-Agent and a 1.2s delay between requests.

Usage:
    python3 scripts/geocode.py            # fill only entries missing coordinates
    python3 scripts/geocode.py --force    # re-geocode every entry
    python3 scripts/geocode.py --dry-run  # show what would change, write nothing
"""

import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data" / "wineries.json"
ENDPOINT = "https://nominatim.openstreetmap.org/search"
HEADERS = {"User-Agent": "wine-life/1.0 (personal winery journal)"}
DELAY_S = 1.2


def geocode(query):
    if not query:
        return None
    url = ENDPOINT + "?" + urllib.parse.urlencode({"q": query, "format": "jsonv2", "limit": 1})
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=20) as resp:
        data = json.load(resp)
    if not data:
        return None
    hit = data[0]
    try:
        return float(hit["lat"]), float(hit["lon"]), hit.get("display_name", query)
    except (KeyError, ValueError):
        return None


def geocode_winery(w):
    country = w.get("country") or "Chile"
    parts_name = [w.get("name"), w.get("region"), country]
    parts_area = [w.get("town"), w.get("region"), country]
    full = ", ".join(p for p in parts_name if p)
    area = ", ".join(p for p in parts_area if p)
    hit = geocode(full)
    if hit:
        return hit
    time.sleep(DELAY_S)
    return geocode(area) if area and area != full else None


def has_coords(w):
    loc = w.get("location") or {}
    return isinstance(loc.get("lat"), (int, float)) and isinstance(loc.get("lng"), (int, float))


def main():
    force = "--force" in sys.argv
    dry = "--dry-run" in sys.argv

    wineries = json.loads(DATA.read_text())
    todo = [w for w in wineries if force or not has_coords(w)]
    if not todo:
        print("All wineries already have coordinates. Nothing to do.")
        return

    print("Geocoding %d winer%s ...\n" % (len(todo), "y" if len(todo) == 1 else "ies"))
    changed = 0
    for w in todo:
        name = w.get("name", "(unnamed)")
        try:
            hit = geocode_winery(w)
        except Exception as e:  # noqa: BLE001 - report and keep going
            print("  ! %-28s lookup error: %s" % (name, e))
            time.sleep(DELAY_S)
            continue
        if not hit:
            print("  - %-28s no match (edit by hand in the form)" % name)
        else:
            lat, lng, label = hit
            w["location"] = {"lat": round(lat, 7), "lng": round(lng, 7)}
            changed += 1
            print("  + %-28s %.5f, %.5f  (%s)" % (name, lat, lng, label[:50]))
        time.sleep(DELAY_S)

    if dry:
        print("\nDry run: %d would change. No file written." % changed)
        return
    if changed:
        DATA.write_text(json.dumps(wineries, ensure_ascii=False, indent=2) + "\n")
        print("\nWrote %d updated coordinate%s to %s" % (changed, "" if changed == 1 else "s", DATA))
    else:
        print("\nNo coordinates resolved. File unchanged.")


if __name__ == "__main__":
    main()
