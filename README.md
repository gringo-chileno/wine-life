# Wine Life

A personal journal of the wineries I visit in Chile and Argentina. It rates each
place across categories, keeps notes and favorite wines, and shows my own photos.
Static site, no build step.

Live: https://wine-life.view.fast/ (Spacefast)
Also still up: https://gringo-chileno.github.io/wine-life (GitHub Pages)

## How it works

- `index.html` + `js/app.js` render the journal: a grid of winery cards with a
  big auto-averaged score, search, region/restaurant/kid filters, sort, and a
  detail view per winery with a photo lightbox.
- `data/wineries.json` is the dataset. One object per winery.
- `images/<slug>/` holds optimized photos for each winery.

## Ratings

Five categories, each 0 to 5: **wine, scenery, facilities, kid-friendly, dining**.
`dining` is `null` when a place has no restaurant. The top-line score on each card
is the average of whatever categories are filled in, so a no-restaurant winery
isn't penalized. Missing data shows a dash.

## Adding a winery

There is no add form. The site is public, so entries are added by editing
`data/wineries.json` directly (I do this through Claude Code).

1. Add an object to `data/wineries.json`, copying the shape of an existing entry.
2. Photos: optimize them (below) into `images/<slug>/`, then list the filenames
   in that entry's `photos` array. The first one is the card cover.
3. Commit and push, which redeploys GitHub Pages.
4. Run `./publish.sh "what changed"` to update the Spacefast site.

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
