/* Wine Life - main view: grid, search/filter/sort, detail, lightbox */
(function () {
  "use strict";

  var WL = window.WL;
  var wineries = [];
  var bySlug = {};

  var els = {
    gridView: document.getElementById("grid-view"),
    detailView: document.getElementById("detail-view"),
    grid: document.getElementById("grid"),
    empty: document.getElementById("empty"),
    count: document.getElementById("result-count"),
    search: document.getElementById("search"),
    region: document.getElementById("filter-region"),
    restaurant: document.getElementById("filter-restaurant"),
    kid: document.getElementById("filter-kid"),
    sort: document.getElementById("sort"),
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

  // A 0-5 bar. value null renders as a dash with an empty track.
  function ratingBar(label, value) {
    var row = el("div", "rating-row");
    row.appendChild(el("span", "rating-label", label));
    var track = el("div", "rating-track");
    var fill = el("div", "rating-fill");
    if (typeof value === "number") {
      fill.style.width = (value / 5 * 100) + "%";
    } else {
      track.classList.add("rating-track-empty");
    }
    track.appendChild(fill);
    row.appendChild(track);
    row.appendChild(el("span", "rating-num", typeof value === "number" ? value.toFixed(0) : WL.DASH));
    return row;
  }

  // Photo thumb, or a lettered placeholder when there are no photos.
  function thumb(w) {
    var box = el("div", "thumb");
    if (w.photos && w.photos.length) {
      var img = el("img");
      img.loading = "lazy";
      img.alt = w.name;
      img.src = w.photos[0];
      img.onerror = function () { box.classList.add("thumb-empty"); box.textContent = initial(w); img.remove(); };
      box.appendChild(img);
    } else {
      box.classList.add("thumb-empty");
      box.textContent = initial(w);
    }
    return box;
  }

  function initial(w) {
    var n = (w.name || "?").replace(/^Vi[ñn]a\s+/i, "");
    return n.charAt(0).toUpperCase();
  }

  // ---- grid ------------------------------------------------------------------

  function card(w) {
    var a = el("a", "card");
    a.href = "#/winery/" + w.slug;

    a.appendChild(thumb(w));

    var body = el("div", "card-body");
    var top = el("div", "card-top");
    top.appendChild(el("h2", "card-name", w.name));

    var overall = WL.computeOverall(w);
    var score = el("div", "card-score");
    score.appendChild(el("span", "card-score-num", WL.fmtScore(overall)));
    score.appendChild(el("span", "card-score-max", "/5"));
    top.appendChild(score);
    body.appendChild(top);

    var meta = [w.region, w.town].filter(Boolean).join(" · ");
    body.appendChild(el("p", "card-meta", meta || WL.DASH));

    var mini = el("div", "card-mini");
    WL.RATING_KEYS.forEach(function (r) {
      var v = ratingValue(w, r.key);
      var chip = el("span", "mini-chip");
      chip.title = r.label;
      chip.appendChild(el("span", "mini-chip-label", r.label.charAt(0)));
      chip.appendChild(el("span", "mini-chip-val", typeof v === "number" ? v.toFixed(0) : WL.DASH));
      mini.appendChild(chip);
    });
    body.appendChild(mini);

    a.appendChild(body);
    return a;
  }

  function currentFilters() {
    return {
      q: els.search.value,
      region: els.region.value,
      restaurant: els.restaurant.value,
      kid: els.kid.value ? parseInt(els.kid.value, 10) : null,
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
      if (f.kid !== null) {
        var k = ratingValue(w, "kidFriendly");
        if (k === null || k < f.kid) return false;
      }
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

    renderGrid(list);
  }

  function renderGrid(list) {
    els.grid.innerHTML = "";
    list.forEach(function (w) { els.grid.appendChild(card(w)); });
    els.empty.hidden = list.length !== 0;
    els.count.textContent = list.length + (list.length === 1 ? " winery" : " wineries");
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

  // ---- detail ----------------------------------------------------------------

  function renderDetail(slug) {
    var w = bySlug[slug];
    if (!w) { location.hash = "#/"; return; }

    var v = els.detailView;
    v.innerHTML = "";

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
    head.appendChild(headText);

    var overall = WL.computeOverall(w);
    var big = el("div", "detail-score");
    big.appendChild(el("span", "detail-score-num", WL.fmtScore(overall)));
    big.appendChild(el("span", "detail-score-max", "/5"));
    big.appendChild(el("span", "detail-score-label", "overall"));
    head.appendChild(big);
    v.appendChild(head);

    // Ratings
    var ratings = el("section", "panel");
    ratings.appendChild(el("h3", "panel-title", "Ratings"));
    WL.RATING_KEYS.forEach(function (r) {
      if (r.key === "dining" && !w.hasRestaurant) {
        var row = el("div", "rating-row");
        row.appendChild(el("span", "rating-label", "Dining"));
        row.appendChild(el("span", "rating-na", "No restaurant"));
        ratings.appendChild(row);
        return;
      }
      ratings.appendChild(ratingBar(r.label, ratingValue(w, r.key)));
    });
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
    }
  }

  // ---- init ------------------------------------------------------------------

  function bindControls() {
    ["input", "change"].forEach(function (ev) {
      els.search.addEventListener(ev, applyFilters);
    });
    [els.region, els.restaurant, els.kid, els.sort].forEach(function (s) {
      s.addEventListener("change", applyFilters);
    });
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
