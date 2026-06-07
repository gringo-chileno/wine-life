# Wine Life

A personal journal of the wineries I visit in Chile and Argentina. It rates each
place across categories, keeps notes and favorite wines, and shows my own photos.
Static site, no build step, hosted on GitHub Pages.

Live: https://gringo-chileno.github.io/wine-life

## How it works

- `index.html` + `js/app.js` render the journal: a grid of winery cards with a
  big auto-averaged score, search, region/restaurant/kid filters, sort, and a
  detail view per winery with a photo lightbox.
- `editor.html` + `js/editor.js` are a built-in add/edit form. It edits a working
  copy in your browser (localStorage), then exports an updated `data/wineries.json`.
- `data/wineries.json` is the dataset. One object per winery.
- `images/<slug>/` holds optimized photos for each winery.

## Ratings

Five categories, each 0 to 5: **wine, scenery, facilities, kid-friendly, dining**.
`dining` is `null` when a place has no restaurant. The top-line score on each card
is the average of whatever categories are filled in, so a no-restaurant winery
isn't penalized. Missing data shows a dash.

## Adding a winery

1. Open `editor.html`, fill out the form, **Save entry**, then **Export wineries.json**.
2. Drop the exported file into `data/`.
3. Photos: put files in `images/<slug>/` after optimizing them (below), and list the
   filenames in the editor's Photos box.
4. Commit and push. GitHub Pages redeploys automatically.

## Photos

The site is public, so photos must not contain people, and metadata gets stripped
before committing.

```bash
# Resize to <=1600px and strip ALL EXIF/GPS:
python3 scripts/optimize_photos.py vina-montes ~/Desktop/montes/

# Phase 2: find candidates in the macOS Photos library by date/GPS (read-only):
python3 -m pip install --user osxphotos
python3 scripts/find_photos.py --slug vina-montes --from 2025-11-15 --to 2025-11-15
```

## Local preview

```bash
cd wine-life
python3 -m http.server 8000
# open http://localhost:8000
```

A local server is required (opening the file directly blocks the JSON fetch).
