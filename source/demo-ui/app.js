/**
 * Dynamic Image Transformation for Google Cloud CDN — Demo UI
 *
 * Builds a DefaultImageRequest JSON (see docs/COMPAT_SPEC.md §2.1),
 * base64-encodes it and requests `/<base64>` from the same origin.
 * The load balancer routes /demo/* to this static site and every other
 * path to the image-handler API, so relative-root URLs work as-is.
 *
 * Not intended for production use; signature-enabled deployments are
 * not supported by this demo.
 */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };

  // When opened from the deployed site, the API lives at the same origin.
  // When opened as a local file, fall back to the demo deployment.
  var API_ORIGIN = window.location.protocol === "file:"
    ? "https://img.googledemo.com"
    : window.location.origin;

  var DEFAULT_BUCKET = "helloworld-334009-dit-source";

  // ------------------------------------------------------------------
  // Request assembly
  // ------------------------------------------------------------------

  function num(el) {
    var v = el.value.trim();
    if (v === "") return null;
    var n = Number(v);
    return isNaN(n) ? null : n;
  }

  function buildRequest() {
    var req = {};
    var bucket = $("f-bucket").value.trim();
    var key = $("f-key").value.trim();
    if (bucket) req.bucket = bucket; // explicit bucket keeps the demo JSON self-describing
    req.key = key;

    var edits = {};

    // resize
    var w = num($("f-width"));
    var h = num($("f-height"));
    var fit = $("f-fit").value;
    if (w !== null || h !== null || fit) {
      var resize = {};
      if (w !== null) resize.width = w;
      if (h !== null) resize.height = h;
      if (fit) resize.fit = fit;
      edits.resize = resize;
    }

    // output format + quality (quality lives under edits.<format>.quality)
    var fmt = $("f-format").value;
    if (fmt) {
      req.outputFormat = fmt;
      var q = parseInt($("f-quality").value, 10);
      if (q !== 80) { // 80 is the slider default; only emit when changed
        edits[fmt] = { quality: q };
      }
    }

    // rotate / flip / flop / grayscale
    var rot = $("f-rotate").value;
    if (rot !== "") edits.rotate = parseInt(rot, 10);
    if ($("f-flip").checked) edits.flip = true;
    if ($("f-flop").checked) edits.flop = true;
    if ($("f-grayscale").checked) edits.grayscale = true;

    // blur (sharp sigma, valid 0.3–1000)
    var blur = parseFloat($("f-blur").value);
    if (blur > 0) edits.blur = Math.max(0.3, blur);

    // smartCrop
    if ($("f-smartcrop-on").checked) {
      edits.smartCrop = {
        faceIndex: num($("f-faceindex")) || 0,
        padding: num($("f-padding")) || 0
      };
    }

    // roundCrop / contentModeration
    if ($("f-roundcrop").checked) edits.roundCrop = true;
    if ($("f-moderation").checked) edits.contentModeration = true;

    // overlayWith
    if ($("f-overlay-on").checked) {
      var ov = {
        bucket: $("f-ov-bucket").value.trim() || bucket,
        key: $("f-ov-key").value.trim()
      };
      var alpha = num($("f-ov-alpha"));
      var wr = num($("f-ov-wratio"));
      var hr = num($("f-ov-hratio"));
      if (alpha !== null) ov.alpha = String(alpha);
      if (wr !== null) ov.wRatio = String(wr);
      if (hr !== null) ov.hRatio = String(hr);
      var left = $("f-ov-left").value.trim();
      var top = $("f-ov-top").value.trim();
      if (left || top) {
        ov.options = {};
        if (left) ov.options.left = left;
        if (top) ov.options.top = top;
      }
      edits.overlayWith = ov;
    }

    if (Object.keys(edits).length > 0) req.edits = edits;
    return req;
  }

  // base64 with UTF-8 safety (keys may contain non-ASCII characters)
  function toBase64(str) {
    return btoa(unescape(encodeURIComponent(str)));
  }

  function buildUrl(req) {
    return API_ORIGIN + "/" + toBase64(JSON.stringify(req));
  }

  // ------------------------------------------------------------------
  // Thumbor URL (subset: resize / fit / format / quality / grayscale)
  // ------------------------------------------------------------------

  function buildThumborUrl() {
    var bucket = $("f-bucket").value.trim();
    var key = $("f-key").value.trim();
    var parts = [];

    var fit = $("f-fit").value;
    if (fit === "inside" || fit === "contain") parts.push("fit-in");

    var w = num($("f-width"));
    var h = num($("f-height"));
    if (w !== null || h !== null) parts.push((w || 0) + "x" + (h || 0));

    var filters = [];
    var fmt = $("f-format").value;
    if (fmt) filters.push("format(" + fmt + ")");
    var q = parseInt($("f-quality").value, 10);
    if (fmt && q !== 80) filters.push("quality(" + q + ")");
    if ($("f-grayscale").checked) filters.push("grayscale()");
    if (filters.length) parts.push("filters:" + filters.join(":"));

    // bucket prefix: gs:<bucket>/ overrides the default bucket
    var keyPart = (bucket && bucket !== DEFAULT_BUCKET ? "gs:" + bucket + "/" : "") + key;
    parts.push(keyPart);

    // flag options the Thumbor subset does not carry over
    var dropped = [];
    if ($("f-flip").checked || $("f-flop").checked) dropped.push("flip/flop");
    if ($("f-rotate").value !== "") dropped.push("rotate");
    if (parseFloat($("f-blur").value) > 0) dropped.push("blur");
    if ($("f-smartcrop-on").checked) dropped.push("smartCrop");
    if ($("f-roundcrop").checked) dropped.push("roundCrop");
    if ($("f-moderation").checked) dropped.push("contentModeration");
    if ($("f-overlay-on").checked) dropped.push("overlay");
    $("thumbor-note").textContent = dropped.length
      ? "Not included in this Thumbor preview (use filters like rotate()/blur()/watermark() manually, see the docs): " + dropped.join(", ")
      : "";

    return API_ORIGIN + "/" + parts.join("/");
  }

  // ------------------------------------------------------------------
  // UI wiring
  // ------------------------------------------------------------------

  function refresh() {
    var req = buildRequest();
    $("out-json").textContent = JSON.stringify(req, null, 2);
    $("out-url").textContent = buildUrl(req);
    $("out-thumbor-url").textContent = buildThumborUrl();
    $("grp-smartcrop").classList.toggle("disabled", !$("f-smartcrop-on").checked);
    $("grp-overlay").classList.toggle("disabled", !$("f-overlay-on").checked);
  }

  function setStatus(el, msg, cls) {
    el.textContent = msg;
    el.className = "status" + (cls ? " " + cls : "");
  }

  function loadImage(imgEl, url, statusEl, doneMsg) {
    setStatus(statusEl, "Loading…");
    imgEl.hidden = true;
    var probe = new Image();
    probe.onload = function () {
      imgEl.src = url;
      imgEl.hidden = false;
      setStatus(statusEl, doneMsg, "ok");
    };
    probe.onerror = function () {
      // fetch the error body for a useful message
      fetch(url).then(function (r) { return r.json(); }).then(function (body) {
        setStatus(statusEl, (body.status || "") + " " + (body.code || "") + ": " + (body.message || "request failed"), "err");
      }).catch(function () {
        setStatus(statusEl, "Request failed — check bucket/key and that the API is reachable.", "err");
      });
    };
    probe.src = url;
  }

  $("btn-import").addEventListener("click", function () {
    var key = $("f-key").value.trim();
    if (!key) { setStatus($("import-status"), "Enter a key first.", "err"); return; }
    var url = buildUrl({ bucket: $("f-bucket").value.trim(), key: key });
    loadImage($("img-original"), url, $("import-status"), "Loaded.");
    refresh();
  });

  $("btn-preview").addEventListener("click", function () {
    var key = $("f-key").value.trim();
    if (!key) { setStatus($("preview-status"), "Enter a key first.", "err"); return; }
    var url = $("panel-thumbor").hidden ? buildUrl(buildRequest()) : buildThumborUrl();
    loadImage($("img-preview"), url, $("preview-status"), "Done.");
  });

  function copyBtn(btnId, srcId) {
    $(btnId).addEventListener("click", function () {
      var text = $(srcId).textContent;
      (navigator.clipboard
        ? navigator.clipboard.writeText(text)
        : Promise.reject())
        .then(function () {
          $(btnId).textContent = "Copied";
          setTimeout(function () { $(btnId).textContent = "Copy"; }, 1500);
        })
        .catch(function () {
          window.prompt("Copy URL:", text);
        });
    });
  }
  copyBtn("btn-copy-url", "out-url");
  copyBtn("btn-copy-thumbor", "out-thumbor-url");

  // tabs
  function selectTab(which) {
    var isDefault = which === "default";
    $("tab-default").classList.toggle("active", isDefault);
    $("tab-thumbor").classList.toggle("active", !isDefault);
    $("tab-default").setAttribute("aria-selected", String(isDefault));
    $("tab-thumbor").setAttribute("aria-selected", String(!isDefault));
    $("panel-default").hidden = !isDefault;
    $("panel-thumbor").hidden = isDefault;
  }
  $("tab-default").addEventListener("click", function () { selectTab("default"); });
  $("tab-thumbor").addEventListener("click", function () { selectTab("thumbor"); });

  // live refresh on any input
  Array.prototype.forEach.call(document.querySelectorAll("input, select"), function (el) {
    el.addEventListener("input", refresh);
    el.addEventListener("change", refresh);
  });
  $("f-quality").addEventListener("input", function () {
    $("f-quality-out").textContent = $("f-quality").value;
  });
  $("f-blur").addEventListener("input", function () {
    $("f-blur-out").textContent = $("f-blur").value;
  });

  refresh();
})();
