/* Minimal slide engine: keyboard / buttons / dots / swipe / hash deep-links. */
(function () {
  "use strict";
  var slides = Array.prototype.slice.call(document.querySelectorAll(".slide"));
  var dotsHost = document.getElementById("dots");
  var countEl = document.getElementById("count");
  var cur = 0;

  slides.forEach(function (_, i) {
    var b = document.createElement("button");
    b.setAttribute("aria-label", "Slide " + (i + 1));
    b.addEventListener("click", function () { go(i); });
    dotsHost.appendChild(b);
  });
  var dots = Array.prototype.slice.call(dotsHost.children);

  function go(i) {
    if (i < 0 || i >= slides.length) return;
    slides[cur].classList.remove("active");
    dots[cur].classList.remove("on");
    cur = i;
    slides[cur].classList.add("active");
    dots[cur].classList.add("on");
    countEl.textContent = (cur + 1) + " / " + slides.length;
    if (history.replaceState) history.replaceState(null, "", "#" + (cur + 1));
  }

  document.getElementById("prev").addEventListener("click", function () { go(cur - 1); });
  document.getElementById("next").addEventListener("click", function () { go(cur + 1); });

  document.addEventListener("keydown", function (e) {
    if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") { e.preventDefault(); go(cur + 1); }
    else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); go(cur - 1); }
    else if (e.key === "Home") { go(0); }
    else if (e.key === "End") { go(slides.length - 1); }
  });

  var x0 = null;
  document.addEventListener("touchstart", function (e) { x0 = e.touches[0].clientX; }, { passive: true });
  document.addEventListener("touchend", function (e) {
    if (x0 === null) return;
    var dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 60) { if (dx < 0) go(cur + 1); else go(cur - 1); }
    x0 = null;
  }, { passive: true });

  var h = parseInt((location.hash || "").replace("#", ""), 10);
  go(!isNaN(h) && h >= 1 && h <= slides.length ? h - 1 : 0);
})();
