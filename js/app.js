/* Wine Life - main view: grid, search/filter/sort, detail, lightbox */
(function () {
  "use strict";

  var WL = window.WL;
  var wineries = [];
  var bySlug = {};
  var viewMode = "grid";   // "grid" | "map"
  var lastList = [];        // most recent filtered list (for the map)

  var els = {
    gridView: document.getElementById("grid-view"),
    detailView: document.getElementById("detail-view"),
    grid: document.getElementById("grid"),
    empty: document.getElementById("empty"),
    count: document.getElementById("result-count"),
    search: document.getElementById("search"),
    region: document.getElementById("filter-region"),
    restaurant: document.getElementById("filter-restaurant"),
    hotel: document.getElementById("filter-hotel"),
    kid: document.getElementById("filter-kid"),
    sort: document.getElementById("sort"),
    viewGrid: document.getElementById("view-grid"),
    viewMap: document.getElementById("view-map"),
    mapWrap: document.getElementById("map-wrap"),
    map: document.getElementById("map"),
    mapNote: document.getElementById("map-note"),
    lightbox: document.getElementById("lightbox"),
    lightboxImg: document.getElementById("lightbox-img"),
    lightboxClose: document.querySelector(".lightbox-close")
  };

  // ---- helpers ---------------------------------------------------------------

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function ratingValue(w, key) {
    var v = w.ratings ? w.ratings[key] : null;
    return typeof v === "number" ? v : null;
  }

  // A 0-5 bar. An unrated category shows "?" with an empty track.
  function ratingBar(label, value) {
    var row = el("div", "rating-row");
    row.appendChild(el("span", "rating-label", label));
    var track = el("div", "rating-track");
    var fill = el("div", "rating-fill");
    if (typeof value === "number") {
      fill.style.width = (value / 5 * 100) + "%";
      track.appendChild(fill);
    } else {
      // Unrated: show the empty striped track, no fill (a width-less fill div
      // would otherwise default to full width and hide the empty state).
      track.classList.add("rating-track-empty");
    }
    row.appendChild(track);
    row.appendChild(el("span", "rating-num", typeof value === "number" ? value.toFixed(0) : "?"));
    return row;
  }

  function initial(w) {
    var n = (w.name || "?").replace(/^Vi[ñn]a\s+/i, "");
    return n.charAt(0).toUpperCase();
  }

  // ---- SVG gauges ------------------------------------------------------------

  var SVGNS = "http://www.w3.org/2000/svg";
  function svg(tag, attrs) {
    var node = document.createElementNS(SVGNS, tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    return node;
  }

  // A circular gauge that fills proportional to a 0-5 score, number in the middle.
  function scoreRing(value, size, accent) {
    var s = size || 56;
    var stroke = s < 60 ? 5 : 6;
    var r = (s - stroke) / 2;
    var c = s / 2;
    var circ = 2 * Math.PI * r;
    var has = typeof value === "number" && !isNaN(value);
    var frac = has ? Math.max(0, Math.min(1, value / 5)) : 0;

    var root = svg("svg", { class: "ring", viewBox: "0 0 " + s + " " + s, width: s, height: s });
    root.appendChild(svg("circle", {
      class: "ring-track", cx: c, cy: c, r: r, fill: "none", "stroke-width": stroke
    }));
    if (has) {
      var prog = svg("circle", {
        class: "ring-prog", cx: c, cy: c, r: r, fill: "none", "stroke-width": stroke,
        stroke: accent || "var(--wine)", "stroke-linecap": "round",
        "stroke-dasharray": circ, "stroke-dashoffset": circ * (1 - frac),
        transform: "rotate(-90 " + c + " " + c + ")"
      });
      root.appendChild(prog);
    }
    var label = svg("text", {
      class: "ring-text", x: c, y: c, "text-anchor": "middle", "dominant-baseline": "central"
    });
    label.textContent = has ? value.toFixed(1) : WL.DASH;
    root.appendChild(label);
    return root;
  }

  // A 5-axis radar of the category scores. Unrated axes collapse to the center
  // and their label is muted, which reads as "no data on this axis".
  function radarChart(w) {
    var size = 280, c = size / 2, R = 92, padX = 46, padY = 12;
    var keys = WL.RATING_KEYS;
    var n = keys.length;
    // Pad the viewBox horizontally so the side axis labels aren't clipped.
    var root = svg("svg", {
      class: "radar",
      viewBox: (-padX) + " " + (-padY) + " " + (size + 2 * padX) + " " + (size + 2 * padY),
      width: "100%", role: "img", "aria-label": "Rating radar chart"
    });

    function pt(i, radius) {
      var ang = -Math.PI / 2 + (i / n) * 2 * Math.PI;
      return [c + radius * Math.cos(ang), c + radius * Math.sin(ang)];
    }

    // concentric grid rings at 1..5
    for (var ring = 1; ring <= 5; ring++) {
      var pts = [];
      for (var i = 0; i < n; i++) pts.push(pt(i, R * ring / 5).map(round1).join(","));
      root.appendChild(svg("polygon", {
        class: "radar-grid", points: pts.join(" "), fill: "none"
      }));
    }
    // spokes + axis labels
    keys.forEach(function (k, i) {
      var outer = pt(i, R);
      root.appendChild(svg("line", {
        class: "radar-spoke", x1: c, y1: c, x2: round1(outer[0]), y2: round1(outer[1])
      }));
      var lp = pt(i, R + 20);
      var t = svg("text", {
        class: "radar-axis" + (WL.ratingNum(w, k.key) === null ? " radar-axis-muted" : ""),
        x: round1(lp[0]), y: round1(lp[1]),
        "text-anchor": lp[0] < c - 5 ? "end" : (lp[0] > c + 5 ? "start" : "middle"),
        "dominant-baseline": lp[1] < c - 5 ? "auto" : (lp[1] > c + 5 ? "hanging" : "central")
      });
      t.textContent = k.label;
      root.appendChild(t);
    });
    // data polygon
    var dpts = keys.map(function (k, i) {
      var v = WL.ratingNum(w, k.key);
      return pt(i, R * (v || 0) / 5).map(round1).join(",");
    });
    root.appendChild(svg("polygon", { class: "radar-area", points: dpts.join(" ") }));
    // dots on rated axes
    keys.forEach(function (k, i) {
      var v = WL.ratingNum(w, k.key);
      if (v === null) return;
      var p = pt(i, R * v / 5);
      root.appendChild(svg("circle", { class: "radar-dot", cx: round1(p[0]), cy: round1(p[1]), r: 3.5 }));
    });
    return root;
  }

  function round1(n) { return Math.round(n * 10) / 10; }

  // ---- grid ------------------------------------------------------------------

  function card(w) {
    var accent = WL.regionColor(w.region);
    var a = el("a", "card");
    a.href = "#/winery/" + w.slug;
    a.style.setProperty("--accent", accent);

    // Photo-hero: full-bleed photo (or a colored letter), name + region + score
    // overlaid on a gradient scrim so it stays readable.
    var hero = el("div", "card-hero");
    if (w.photos && w.photos.length) {
      var img = el("img", "card-hero-img");
      img.loading = "lazy";
      img.alt = w.name;
      img.src = w.photos[0];
      img.onerror = function () {
        hero.classList.add("card-hero-empty");
        img.remove();
        hero.insertBefore(el("span", "card-hero-letter", initial(w)), hero.firstChild);
      };
      hero.appendChild(img);
    } else {
      hero.classList.add("card-hero-empty");
      hero.appendChild(el("span", "card-hero-letter", initial(w)));
    }
    hero.appendChild(el("div", "card-hero-scrim"));

    var overall = WL.computeOverall(w);
    var badge = el("div", "card-hero-badge");
    badge.appendChild(scoreRing(overall, 52, "#fff"));
    hero.appendChild(badge);

    var heroText = el("div", "card-hero-text");
    heroText.appendChild(el("h2", "card-name", w.name));
    var meta = [w.region, w.town].filter(Boolean).join(" · ");
    heroText.appendChild(el("p", "card-meta", meta || WL.DASH));
    hero.appendChild(heroText);
    a.appendChild(hero);

    var body = el("div", "card-body");
    var mini = el("div", "card-mini");
    WL.RATING_KEYS.forEach(function (r) {
      var text = WL.ratingText(w, r.key);
      var chip = el("span", "mini-chip");
      if (text === "?" || text === WL.DASH) chip.classList.add("mini-chip-muted");
      chip.appendChild(el("span", "mini-chip-label", r.label));
      chip.appendChild(el("span", "mini-chip-val", text));
      mini.appendChild(chip);
    });
    body.appendChild(mini);

    var amen = el("div", "card-amen");
    amen.appendChild(amenChip("👶", "Kid-friendly", w.kidFriendly));
    amen.appendChild(amenChip("🏨", "Hotel", w.hasHotel));
    body.appendChild(amen);

    a.appendChild(body);
    return a;
  }

  function amenChip(icon, label, on) {
    var chip = el("span", "amen-chip" + (on ? " amen-on" : " amen-off"));
    chip.appendChild(el("span", "amen-ico", icon));
    chip.appendChild(el("span", "amen-lbl", label));
    chip.appendChild(el("span", "amen-mark", on ? "✓" : "✕"));
    return chip;
  }

  function currentFilters() {
    return {
      q: els.search.value,
      region: els.region.value,
      restaurant: els.restaurant.value,
      hotel: els.hotel.value,
      kid: els.kid.value,
      sort: els.sort.value
    };
  }

  function applyFilters() {
    var f = currentFilters();
    var list = wineries.filter(function (w) {
      if (!WL.matchesSearch(w, f.q)) return false;
      if (f.region && w.region !== f.region) return false;
      if (f.restaurant === "yes" && !w.hasRestaurant) return false;
      if (f.restaurant === "no" && w.hasRestaurant) return false;
      if (f.hotel === "yes" && !w.hasHotel) return false;
      if (f.hotel === "no" && w.hasHotel) return false;
      if (f.kid === "yes" && !w.kidFriendly) return false;
      if (f.kid === "no" && w.kidFriendly) return false;
      return true;
    });

    list.sort(function (a, b) {
      switch (f.sort) {
        case "wine": return (ratingValue(b, "wine") || -1) - (ratingValue(a, "wine") || -1);
        case "scenery": return (ratingValue(b, "scenery") || -1) - (ratingValue(a, "scenery") || -1);
        case "recent": return String(b.visited || "").localeCompare(String(a.visited || ""));
        case "name": return String(a.name).localeCompare(String(b.name));
        default:
          return (WL.computeOverall(b) || -1) - (WL.computeOverall(a) || -1);
      }
    });

    lastList = list;
    els.count.textContent = list.length + (list.length === 1 ? " winery" : " wineries");
    if (viewMode === "map") { renderMap(list); }
    else { renderGrid(list); }
  }

  function renderGrid(list) {
    els.grid.innerHTML = "";
    list.forEach(function (w) { els.grid.appendChild(card(w)); });
    els.empty.hidden = list.length !== 0;
  }

  function populateRegionFilter() {
    var regions = {};
    wineries.forEach(function (w) { if (w.region) regions[w.region] = true; });
    Object.keys(regions).sort().forEach(function (r) {
      var opt = el("option", null, r);
      opt.value = r;
      els.region.appendChild(opt);
    });
  }

  // ---- map -------------------------------------------------------------------

  var leafletPromise = null;
  var map = null;
  var markerLayer = null;

  function loadLeaflet() {
    if (window.L) return Promise.resolve();
    if (leafletPromise) return leafletPromise;
    leafletPromise = new Promise(function (resolve, reject) {
      var css = el("link");
      css.rel = "stylesheet";
      css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(css);
      var s = document.createElement("script");
      s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      s.onload = resolve;
      s.onerror = function () { reject(new Error("Could not load map library")); };
      document.head.appendChild(s);
    });
    return leafletPromise;
  }

  function hasCoords(w) {
    return w.location && typeof w.location.lat === "number" && typeof w.location.lng === "number";
  }

  function setViewMode(mode) {
    viewMode = mode;
    var onMap = mode === "map";
    els.viewGrid.classList.toggle("on", !onMap);
    els.viewMap.classList.toggle("on", onMap);
    els.viewGrid.setAttribute("aria-selected", String(!onMap));
    els.viewMap.setAttribute("aria-selected", String(onMap));
    els.grid.hidden = onMap;
    els.mapWrap.hidden = !onMap;
    if (onMap) els.empty.hidden = true;
    applyFilters();
  }

  function renderMap(list) {
    loadLeaflet().then(function () {
      var pins = list.filter(hasCoords);
      if (!map) {
        map = L.map(els.map, { scrollWheelZoom: false });
        // Dark basemap (CARTO) so the map fits the black theme.
        L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
          attribution: "© OpenStreetMap, © CARTO", subdomains: "abcd", maxZoom: 19
        }).addTo(map);
        markerLayer = L.layerGroup().addTo(map);
      }
      markerLayer.clearLayers();

      if (!pins.length) {
        map.setView([-34.0, -71.0], 6);
        els.mapNote.textContent = list.length
          ? "None of these wineries have map coordinates yet."
          : "No wineries match. Try clearing filters or search.";
        els.mapNote.hidden = false;
      } else {
        els.mapNote.hidden = true;
        var bounds = [];
        pins.forEach(function (w) {
          var ll = [w.location.lat, w.location.lng];
          bounds.push(ll);
          var m = L.circleMarker(ll, {
            radius: 9, color: "#fff", weight: 2,
            fillColor: WL.regionColor(w.region), fillOpacity: 0.95
          });
          m.bindPopup(popupHtml(w));
          markerLayer.addLayer(m);
        });
        if (pins.length === 1) map.setView(bounds[0], 11);
        else map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
      }
      // Leaflet needs a size recalc when its container was hidden at init.
      setTimeout(function () { map.invalidateSize(); }, 0);
    }).catch(function () {
      els.mapNote.textContent = "Could not load the map. Check your connection and try again.";
      els.mapNote.hidden = false;
    });
  }

  function popupHtml(w) {
    var meta = [w.region, w.town].filter(Boolean).join(" · ");
    var overall = WL.fmtScore(WL.computeOverall(w));
    return "<div class='pin'>" +
      "<strong>" + escapeHtml(w.name) + "</strong>" +
      "<div class='pin-meta'>" + escapeHtml(meta || WL.DASH) + "</div>" +
      "<div class='pin-score'>" + overall + " / 5 overall</div>" +
      "<a class='pin-link' href='#/winery/" + encodeURIComponent(w.slug) + "'>View details →</a>" +
      "</div>";
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  // ---- detail ----------------------------------------------------------------

  function renderDetail(slug) {
    var w = bySlug[slug];
    if (!w) { location.hash = "#/"; return; }

    var v = els.detailView;
    v.innerHTML = "";
    v.style.setProperty("--accent", WL.regionColor(w.region));

    var back = el("a", "back-link", "← All wineries");
    back.href = "#/";
    v.appendChild(back);

    var head = el("div", "detail-head");
    var headText = el("div");
    headText.appendChild(el("h1", "detail-name", w.name));
    var meta = [w.region, w.town, w.country].filter(Boolean).join(" · ");
    headText.appendChild(el("p", "detail-meta", meta || WL.DASH));
    var sub = el("p", "detail-sub");
    sub.appendChild(el("span", null, "Visited: " + WL.fmt(w.visited)));
    if (w.website) {
      sub.appendChild(document.createTextNode("  ·  "));
      var link = el("a", null, "Website");
      link.href = w.website;
      link.target = "_blank";
      link.rel = "noopener";
      sub.appendChild(link);
    }
    headText.appendChild(sub);

    var badges = el("div", "badges");
    if (w.hasRestaurant) badges.appendChild(el("span", "badge", "🍽 Restaurant"));
    if (w.hasHotel) badges.appendChild(el("span", "badge", "🏨 Hotel on site"));
    if (w.kidFriendly) badges.appendChild(el("span", "badge", "👶 Kid-friendly"));
    if (badges.children.length) headText.appendChild(badges);

    head.appendChild(headText);

    var overall = WL.computeOverall(w);
    var big = el("div", "detail-score");
    big.appendChild(scoreRing(overall, 96, WL.regionColor(w.region)));
    big.appendChild(el("span", "detail-score-label", "overall"));
    head.appendChild(big);
    v.appendChild(head);

    // Ratings: radar chart + the 0-5 bars side by side on wide screens.
    var ratings = el("section", "panel");
    ratings.appendChild(el("h3", "panel-title", "Ratings"));
    var rgrid = el("div", "ratings-grid");

    var radarBox = el("div", "radar-box");
    radarBox.appendChild(radarChart(w));
    rgrid.appendChild(radarBox);

    var bars = el("div", "rating-bars");
    WL.RATING_KEYS.forEach(function (r) {
      if (r.key === "dining" && !w.hasRestaurant) {
        var row = el("div", "rating-row");
        row.appendChild(el("span", "rating-label", "Dining"));
        row.appendChild(el("span", "rating-na", "No restaurant"));
        bars.appendChild(row);
        return;
      }
      bars.appendChild(ratingBar(r.label, ratingValue(w, r.key)));
    });
    rgrid.appendChild(bars);
    ratings.appendChild(rgrid);
    v.appendChild(ratings);

    // Amenities + favorite wines, side by side on wide screens
    var cols = el("div", "detail-cols");

    var amen = el("section", "panel");
    amen.appendChild(el("h3", "panel-title", "What else they have"));
    if (w.amenities && w.amenities.length) {
      var tags = el("div", "tags");
      w.amenities.forEach(function (t) { tags.appendChild(el("span", "tag", t)); });
      amen.appendChild(tags);
    } else {
      amen.appendChild(el("p", "muted", WL.DASH));
    }
    cols.appendChild(amen);

    var favs = el("section", "panel");
    favs.appendChild(el("h3", "panel-title", "Favorite wines"));
    if (w.favoriteWines && w.favoriteWines.length) {
      var ul = el("ul", "fav-list");
      w.favoriteWines.forEach(function (name) { ul.appendChild(el("li", null, name)); });
      favs.appendChild(ul);
    } else {
      favs.appendChild(el("p", "muted", WL.DASH));
    }
    cols.appendChild(favs);
    v.appendChild(cols);

    // Notes
    var notes = el("section", "panel");
    notes.appendChild(el("h3", "panel-title", "Notes"));
    notes.appendChild(el("p", "notes-text", w.notes && w.notes.trim() ? w.notes : WL.DASH));
    v.appendChild(notes);

    // Photos
    var photos = el("section", "panel");
    photos.appendChild(el("h3", "panel-title", "Photos"));
    if (w.photos && w.photos.length) {
      var gallery = el("div", "gallery");
      w.photos.forEach(function (src) {
        var im = el("img", "gallery-img");
        im.loading = "lazy";
        im.alt = w.name;
        im.src = src;
        im.addEventListener("click", function () { openLightbox(src, w.name); });
        gallery.appendChild(im);
      });
      photos.appendChild(gallery);
    } else {
      photos.appendChild(el("p", "muted", WL.DASH + " no photos yet"));
    }
    v.appendChild(photos);
  }

  // ---- lightbox --------------------------------------------------------------

  function openLightbox(src, alt) {
    els.lightboxImg.src = src;
    els.lightboxImg.alt = alt || "";
    els.lightbox.hidden = false;
    els.lightbox.setAttribute("aria-hidden", "false");
  }
  function closeLightbox() {
    els.lightbox.hidden = true;
    els.lightbox.setAttribute("aria-hidden", "true");
    els.lightboxImg.src = "";
  }

  // ---- routing ---------------------------------------------------------------

  function route() {
    var hash = location.hash || "#/";
    var m = hash.match(/^#\/winery\/(.+)$/);
    if (m) {
      els.gridView.hidden = true;
      els.detailView.hidden = false;
      renderDetail(decodeURIComponent(m[1]));
      window.scrollTo(0, 0);
    } else {
      els.detailView.hidden = true;
      els.gridView.hidden = false;
      // Map tiles render blank if the container was hidden during detail view.
      if (viewMode === "map" && map) setTimeout(function () { map.invalidateSize(); }, 0);
    }
  }

  // ---- init ------------------------------------------------------------------

  function bindControls() {
    ["input", "change"].forEach(function (ev) {
      els.search.addEventListener(ev, applyFilters);
    });
    [els.region, els.restaurant, els.hotel, els.kid, els.sort].forEach(function (s) {
      s.addEventListener("change", applyFilters);
    });
    els.viewGrid.addEventListener("click", function () { if (viewMode !== "grid") setViewMode("grid"); });
    els.viewMap.addEventListener("click", function () { if (viewMode !== "map") setViewMode("map"); });
    els.lightboxClose.addEventListener("click", closeLightbox);
    els.lightbox.addEventListener("click", function (e) {
      if (e.target === els.lightbox) closeLightbox();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !els.lightbox.hidden) closeLightbox();
    });
    window.addEventListener("hashchange", route);
  }

  WL.loadWineries().then(function (data) {
    wineries = data || [];
    wineries.forEach(function (w) { bySlug[w.slug] = w; });
    populateRegionFilter();
    bindControls();
    applyFilters();
    route();
  }).catch(function (err) {
    els.grid.innerHTML = "";
    var msg = el("p", "load-error",
      "Could not load data. If you opened the file directly, run a local server instead: python3 -m http.server");
    els.grid.appendChild(msg);
    console.error(err);
  });
})();
