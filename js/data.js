/* Wine Life - shared data helpers (plain script, exposes window.WL) */
(function () {
  "use strict";

  // The four rating categories, 0-5. `dining` is null when there's no restaurant.
  // Kid-friendly is a yes/no attribute (like restaurant/hotel), not a rated axis.
  var RATING_KEYS = [
    { key: "wine", label: "Wine" },
    { key: "scenery", label: "Scenery" },
    { key: "facilities", label: "Facilities" },
    { key: "dining", label: "Dining" }
  ];

  // Shown first in the region picker. Free-text entry is always allowed too.
  var COMMON_REGIONS = [
    "Maipo",
    "Cachapoal",
    "Colchagua",
    "Casablanca",
    "San Antonio / Leyda",
    "Aconcagua",
    "Maule",
    "Curicó",
    "Itata",
    "Limarí",
    "Mendoza / Maipú",
    "Mendoza / Luján de Cuyo",
    "Mendoza / Uco Valley"
  ];

  var DASH = "—";

  // A signature accent color per wine region (editorial touch on cards/detail).
  // Unknown regions get a stable color derived from their name.
  var REGION_COLORS = {
    "Maipo": "#7b3f6b",
    "Cachapoal": "#9c4221",
    "Colchagua": "#6b1d2e",
    "Casablanca": "#2f6f6a",
    "San Antonio / Leyda": "#3a6ea5",
    "Aconcagua": "#8a6d3b",
    "Maule": "#4f7a3f",
    "Curicó": "#a3781f",
    "Itata": "#5b4a8a",
    "Limarí": "#b06a28",
    "Mendoza / Maipú": "#8c2740",
    "Mendoza / Luján de Cuyo": "#6d2f4d",
    "Mendoza / Uco Valley": "#2c5f7a"
  };

  function regionColor(region) {
    var r = String(region || "").trim();
    if (REGION_COLORS[r]) return REGION_COLORS[r];
    if (!r) return "#6b615c";
    var hash = 0;
    for (var i = 0; i < r.length; i++) hash = (hash * 31 + r.charCodeAt(i)) % 360;
    return "hsl(" + hash + ", 38%, 36%)";
  }

  // Average of the ratings that are actually present (non-null numbers).
  // Returns null when nothing is rated, so a no-restaurant winery isn't penalized.
  function computeOverall(winery) {
    if (!winery || !winery.ratings) return null;
    var values = [];
    RATING_KEYS.forEach(function (r) {
      var v = winery.ratings[r.key];
      if (typeof v === "number" && !isNaN(v)) values.push(v);
    });
    if (values.length === 0) return null;
    var sum = values.reduce(function (a, b) { return a + b; }, 0);
    return Math.round((sum / values.length) * 10) / 10;
  }

  // Display a number or the dash for missing data.
  function fmt(value) {
    if (value === null || value === undefined || value === "") return DASH;
    return String(value);
  }

  // One-decimal score string (e.g. "4.0"), or the dash.
  function fmtScore(value) {
    if (typeof value !== "number" || isNaN(value)) return DASH;
    return value.toFixed(1);
  }

  // The numeric rating for a category, or null when unrated.
  function ratingNum(winery, key) {
    var v = winery && winery.ratings ? winery.ratings[key] : null;
    return typeof v === "number" && !isNaN(v) ? v : null;
  }

  // How a category shows on screen:
  //   "no restaurant" dining -> dash (not applicable)
  //   unrated / "don't remember" -> "?" (excluded from the overall score)
  //   otherwise the number.
  function ratingText(winery, key) {
    if (key === "dining" && winery && !winery.hasRestaurant) return DASH;
    var v = ratingNum(winery, key);
    return v === null ? "?" : v.toFixed(0);
  }

  // Slugify a winery name into a stable id / folder name.
  function slugify(name) {
    return String(name || "")
      .toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "") // strip accents
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  // Multi-word search: true when EVERY query word appears somewhere in the
  // winery's text fields (name, region, town, notes, favorite wines, amenities).
  function matchesSearch(winery, query) {
    var q = String(query || "").trim().toLowerCase();
    if (!q) return true;
    var hay = [
      winery.name,
      winery.region,
      winery.town,
      winery.country,
      winery.notes,
      (winery.favoriteWines || []).join(" "),
      (winery.amenities || []).join(" ")
    ].join(" ").toLowerCase();
    return q.split(/\s+/).every(function (word) {
      return hay.indexOf(word) !== -1;
    });
  }

  // Geocode a free-text place query to coordinates via OpenStreetMap's
  // Nominatim (no API key). Returns {lat, lng, label} or null. The browser
  // sends a Referer that satisfies Nominatim's usage policy for light use.
  function geocode(query) {
    var q = String(query || "").trim();
    if (!q) return Promise.resolve(null);
    var url = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=" + encodeURIComponent(q);
    return fetch(url, { headers: { "Accept": "application/json" } })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (list) {
        if (!list || !list.length) return null;
        var hit = list[0];
        var lat = parseFloat(hit.lat), lng = parseFloat(hit.lon);
        if (isNaN(lat) || isNaN(lng)) return null;
        return { lat: lat, lng: lng, label: hit.display_name || q };
      });
  }

  // Best-effort geocode for a winery: try the name first (Nominatim knows most
  // wineries by name), then fall back to just the town/region.
  function geocodeWinery(w) {
    var country = w.country || "Chile";
    var full = [w.name, w.region, country].filter(Boolean).join(", ");
    var area = [w.town, w.region, country].filter(Boolean).join(", ");
    return geocode(full).then(function (hit) {
      if (hit) return hit;
      return area && area !== full ? geocode(area) : null;
    });
  }

  // Load the dataset. Works over http(s); file:// will fail fetch (use a server).
  function loadWineries() {
    return fetch("data/wineries.json", { cache: "no-store" }).then(function (res) {
      if (!res.ok) throw new Error("Failed to load wineries.json (" + res.status + ")");
      return res.json();
    });
  }

  window.WL = {
    RATING_KEYS: RATING_KEYS,
    COMMON_REGIONS: COMMON_REGIONS,
    DASH: DASH,
    regionColor: regionColor,
    computeOverall: computeOverall,
    fmt: fmt,
    fmtScore: fmtScore,
    ratingNum: ratingNum,
    ratingText: ratingText,
    slugify: slugify,
    matchesSearch: matchesSearch,
    geocode: geocode,
    geocodeWinery: geocodeWinery,
    loadWineries: loadWineries
  };
})();
