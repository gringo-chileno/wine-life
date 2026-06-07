/* Wine Life - shared data helpers (plain script, exposes window.WL) */
(function () {
  "use strict";

  // The five rating categories, 0-5. `dining` is null when there's no restaurant.
  var RATING_KEYS = [
    { key: "wine", label: "Wine" },
    { key: "scenery", label: "Scenery" },
    { key: "facilities", label: "Facilities" },
    { key: "kidFriendly", label: "Kid-friendly" },
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
    computeOverall: computeOverall,
    fmt: fmt,
    fmtScore: fmtScore,
    ratingNum: ratingNum,
    ratingText: ratingText,
    slugify: slugify,
    matchesSearch: matchesSearch,
    loadWineries: loadWineries
  };
})();
