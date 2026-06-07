/* Wine Life - editor: client-only form backed by a localStorage working copy */
(function () {
  "use strict";

  var WL = window.WL;
  var STORE_KEY = "wineLife.workingCopy";

  var working = [];            // array of winery objects
  var amenities = [];          // chips for the entry being edited
  var favs = [];               // chips for the entry being edited
  var ratings = {};            // key -> number|null for the entry being edited

  var f = {
    form: document.getElementById("form"),
    slug: document.getElementById("editing-slug"),
    name: document.getElementById("f-name"),
    region: document.getElementById("f-region"),
    town: document.getElementById("f-town"),
    country: document.getElementById("f-country"),
    visited: document.getElementById("f-visited"),
    website: document.getElementById("f-website"),
    hasRestaurant: document.getElementById("f-has-restaurant"),
    ratingsBox: document.getElementById("ratings"),
    amenInput: document.getElementById("f-amenities-input"),
    amenChips: document.getElementById("amenities-chips"),
    favsInput: document.getElementById("f-favs-input"),
    favsChips: document.getElementById("favs-chips"),
    notes: document.getElementById("f-notes"),
    photos: document.getElementById("f-photos"),
    deleteBtn: document.getElementById("delete-btn"),
    list: document.getElementById("entry-list"),
    count: document.getElementById("entry-count"),
    regionList: document.getElementById("region-list")
  };

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  // ---- persistence -----------------------------------------------------------

  function save() {
    localStorage.setItem(STORE_KEY, JSON.stringify(working));
  }

  function loadWorking() {
    var raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      try { working = JSON.parse(raw) || []; return Promise.resolve(); }
      catch (e) { working = []; }
    }
    // No working copy yet: seed from the published data file.
    return WL.loadWineries().then(function (data) {
      working = data || [];
      save();
    }).catch(function () { working = []; });
  }

  // ---- rating controls -------------------------------------------------------

  function buildRatingControls() {
    f.ratingsBox.innerHTML = "";
    WL.RATING_KEYS.forEach(function (r) {
      var row = el("div", "rating-field");
      row.appendChild(el("span", null, r.label));
      var seg = el("div", "seg");
      seg.dataset.key = r.key;
      // a "-" button to clear, then 0..5
      ["–", 0, 1, 2, 3, 4, 5].forEach(function (val) {
        var b = el("button", null, String(val));
        b.type = "button";
        b.dataset.val = (val === "–") ? "" : String(val);
        b.addEventListener("click", function () {
          ratings[r.key] = (val === "–") ? null : val;
          paintSeg(seg, ratings[r.key]);
        });
        seg.appendChild(b);
      });
      row.appendChild(seg);
      f.ratingsBox.appendChild(row);
      paintSeg(seg, ratings[r.key]);
    });
  }

  function paintSeg(seg, value) {
    Array.prototype.forEach.call(seg.querySelectorAll("button"), function (b) {
      var bv = b.dataset.val === "" ? null : parseInt(b.dataset.val, 10);
      b.classList.toggle("on", bv === value);
    });
  }

  // ---- chip inputs -----------------------------------------------------------

  function renderChips(container, input, arr) {
    // remove existing chip nodes (keep the input)
    Array.prototype.slice.call(container.querySelectorAll(".chip")).forEach(function (c) { c.remove(); });
    arr.forEach(function (text, i) {
      var chip = el("span", "chip", text);
      var x = el("button", null, "×");
      x.type = "button";
      x.addEventListener("click", function () { arr.splice(i, 1); renderChips(container, input, arr); });
      chip.appendChild(x);
      container.insertBefore(chip, input);
    });
  }

  function wireChipInput(input, container, arr) {
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        var v = input.value.trim().replace(/,$/, "");
        if (v) { arr.push(v); input.value = ""; renderChips(container, input, arr); }
      } else if (e.key === "Backspace" && !input.value && arr.length) {
        arr.pop(); renderChips(container, input, arr);
      }
    });
  }

  // ---- form <-> object -------------------------------------------------------

  function blankForm() {
    f.slug.value = "";
    f.name.value = "";
    f.region.value = "";
    f.town.value = "";
    f.country.value = "Chile";
    f.visited.value = "";
    f.website.value = "";
    f.hasRestaurant.checked = false;
    f.notes.value = "";
    f.photos.value = "";
    amenities = [];
    favs = [];
    ratings = { wine: null, scenery: null, facilities: null, kidFriendly: null, dining: null };
    renderChips(f.amenChips, f.amenInput, amenities);
    renderChips(f.favsChips, f.favsInput, favs);
    buildRatingControls();
    f.deleteBtn.hidden = true;
    window.scrollTo(0, 0);
  }

  function loadIntoForm(w) {
    f.slug.value = w.slug || "";
    f.name.value = w.name || "";
    f.region.value = w.region || "";
    f.town.value = w.town || "";
    f.country.value = w.country || "Chile";
    f.visited.value = w.visited || "";
    f.website.value = w.website || "";
    f.hasRestaurant.checked = !!w.hasRestaurant;
    f.notes.value = w.notes || "";
    f.photos.value = (w.photos || []).map(stripImgPrefix).join("\n");
    amenities = (w.amenities || []).slice();
    favs = (w.favoriteWines || []).slice();
    ratings = {
      wine: numOrNull(w.ratings && w.ratings.wine),
      scenery: numOrNull(w.ratings && w.ratings.scenery),
      facilities: numOrNull(w.ratings && w.ratings.facilities),
      kidFriendly: numOrNull(w.ratings && w.ratings.kidFriendly),
      dining: numOrNull(w.ratings && w.ratings.dining)
    };
    renderChips(f.amenChips, f.amenInput, amenities);
    renderChips(f.favsChips, f.favsInput, favs);
    buildRatingControls();
    f.deleteBtn.hidden = false;
    window.scrollTo(0, 0);
  }

  function numOrNull(v) { return typeof v === "number" && !isNaN(v) ? v : null; }
  function stripImgPrefix(p) { return String(p).replace(/^images\/[^/]+\//, ""); }

  // Build a winery object from the current form state.
  function readForm() {
    var name = f.name.value.trim();
    var slug = f.slug.value || WL.slugify(name);
    var photoLines = f.photos.value.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
    var photos = photoLines.map(function (line) {
      return /^images\//.test(line) ? line : "images/" + slug + "/" + line;
    });
    var hasRestaurant = f.hasRestaurant.checked;
    return {
      slug: slug,
      name: name,
      region: f.region.value.trim(),
      country: f.country.value,
      town: f.town.value.trim(),
      location: { lat: null, lng: null },
      visited: f.visited.value || null,
      website: f.website.value.trim(),
      hasRestaurant: hasRestaurant,
      ratings: {
        wine: ratings.wine,
        scenery: ratings.scenery,
        facilities: ratings.facilities,
        kidFriendly: ratings.kidFriendly,
        dining: hasRestaurant ? ratings.dining : null
      },
      amenities: amenities.slice(),
      favoriteWines: favs.slice(),
      notes: f.notes.value.trim(),
      photos: photos
    };
  }

  // ---- list ------------------------------------------------------------------

  function renderList() {
    f.list.innerHTML = "";
    f.count.textContent = String(working.length);
    working.slice().sort(function (a, b) {
      return String(a.name).localeCompare(String(b.name));
    }).forEach(function (w) {
      var row = el("div", "entry-row");
      var label = el("div");
      label.appendChild(el("strong", null, w.name || "(unnamed)"));
      var meta = [w.region, WL.fmtScore(WL.computeOverall(w)) + "/5"].filter(Boolean).join("  ·  ");
      label.appendChild(el("div", "muted", meta));
      row.appendChild(label);

      var actions = el("div", "entry-actions");
      var edit = el("button", "link-btn", "Edit");
      edit.type = "button";
      edit.addEventListener("click", function () { loadIntoForm(w); });
      actions.appendChild(edit);
      row.appendChild(actions);
      f.list.appendChild(row);
    });
  }

  // ---- actions ---------------------------------------------------------------

  function upsert(entry) {
    var idx = -1;
    working.forEach(function (w, i) { if (w.slug === entry.slug) idx = i; });
    if (idx >= 0) working[idx] = entry; else working.push(entry);
    save();
    renderList();
  }

  function download(filename, text) {
    var blob = new Blob([text], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    a.remove(); URL.revokeObjectURL(url);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    var ta = document.createElement("textarea");
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); } catch (e) {}
    ta.remove();
    return Promise.resolve();
  }

  // ---- init ------------------------------------------------------------------

  function populateRegionDatalist() {
    WL.COMMON_REGIONS.forEach(function (r) {
      var o = document.createElement("option");
      o.value = r;
      f.regionList.appendChild(o);
    });
  }

  function wire() {
    wireChipInput(f.amenInput, f.amenChips, amenities);
    wireChipInput(f.favsInput, f.favsChips, favs);

    f.form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!f.name.value.trim()) { f.name.focus(); return; }
      var entry = readForm();
      upsert(entry);
      blankForm();
      flash("Saved “" + entry.name + "”. Export when you're ready to publish.");
    });

    document.getElementById("new-btn").addEventListener("click", blankForm);

    document.getElementById("reload-btn").addEventListener("click", function () {
      if (!confirm("Replace the working copy with the published data file? Unsaved edits are lost.")) return;
      WL.loadWineries().then(function (data) { working = data || []; save(); renderList(); blankForm(); });
    });

    document.getElementById("import-file").addEventListener("change", function (e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var data = JSON.parse(reader.result);
          if (!Array.isArray(data)) throw new Error("Not an array");
          working = data; save(); renderList(); blankForm();
          flash("Imported " + data.length + " wineries.");
        } catch (err) { alert("That file isn't valid wineries JSON: " + err.message); }
      };
      reader.readAsText(file);
    });

    document.getElementById("export-btn").addEventListener("click", function () {
      download("wineries.json", JSON.stringify(working, null, 2) + "\n");
    });

    document.getElementById("copy-entry-btn").addEventListener("click", function () {
      var entry = readForm();
      copyText(JSON.stringify(entry, null, 2)).then(function () {
        flash("Copied this entry's JSON to the clipboard.");
      });
    });

    f.deleteBtn.addEventListener("click", function () {
      var slug = f.slug.value;
      if (!slug) return;
      if (!confirm("Delete this entry from the working copy?")) return;
      working = working.filter(function (w) { return w.slug !== slug; });
      save(); renderList(); blankForm();
    });
  }

  function flash(msg) {
    var box = document.getElementById("flash") || (function () {
      var b = el("div", "note-box");
      b.id = "flash";
      f.form.parentNode.insertBefore(b, f.form);
      return b;
    })();
    box.textContent = msg;
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  populateRegionDatalist();
  loadWorking().then(function () {
    blankForm();
    wire();
    renderList();
  });
})();
