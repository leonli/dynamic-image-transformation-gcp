/**
 * Shared navigation for the Implementation Guide.
 * Renders header, side navigation, breadcrumb, prev/next pager and the
 * language switch into placeholder elements. All generated links are
 * relative, so the site works under any prefix (deployed at /docs/).
 *
 * Page skeleton expected:
 *   <div id="dit-header"></div>
 *   <div class="dit-shell">
 *     <nav id="dit-sidenav" class="dit-sidenav"></nav>
 *     <main class="dit-main">
 *       <div id="dit-breadcrumb"></div>
 *       <article>…</article>
 *       <div id="dit-pager"></div>
 *     </main>
 *   </div>
 *   <div id="dit-footer"></div>
 */
(function () {
  "use strict";

  var PAGES = [
    { file: "index.html",           en: "Solution overview",      zh: "方案概览" },
    { file: "architecture.html",    en: "Architecture overview",  zh: "架构概览" },
    { file: "plan.html",            en: "Plan your deployment",   zh: "部署规划" },
    { file: "deploy.html",          en: "Deploy the solution",    zh: "部署方案" },
    { file: "migrate.html",         en: "Migrate from AWS",       zh: "从 AWS 迁移" },
    { file: "use.html",             en: "Use the solution",       zh: "使用方案" },
    { file: "thumbor.html",         en: "Thumbor compatibility",  zh: "Thumbor 兼容" },
    { file: "api-reference.html",   en: "API reference",          zh: "API 参考" },
    { file: "troubleshooting.html", en: "Troubleshooting",        zh: "故障排查" },
    { file: "uninstall.html",       en: "Uninstall the solution", zh: "卸载方案" }
  ];

  var STR = {
    en: {
      product: "Dynamic Image Transformation for Google Cloud CDN",
      guide: "Implementation Guide",
      contents: "Contents",
      switchLabel: "中文",
      switchTitle: "查看本页中文版",
      home: "Implementation Guide",
      prev: "Previous",
      next: "Next",
      footer: "Dynamic Image Transformation for Google Cloud CDN — Implementation Guide. " +
              "A GCP counterpart of the AWS solution “Dynamic Image Transformation for Amazon CloudFront”."
    },
    zh: {
      product: "Dynamic Image Transformation for Google Cloud CDN",
      guide: "实施指南",
      contents: "目录",
      switchLabel: "English",
      switchTitle: "View this page in English",
      home: "实施指南",
      prev: "上一页",
      next: "下一页",
      footer: "Dynamic Image Transformation for Google Cloud CDN — 实施指南。" +
              "对标 AWS 解决方案 “Dynamic Image Transformation for Amazon CloudFront” 的 GCP 实现。"
    }
  };

  var path = window.location.pathname;
  var lang = path.indexOf("/zh/") !== -1 ? "zh" : "en";
  var otherLang = lang === "zh" ? "en" : "zh";
  var file = path.split("/").pop() || "index.html";
  var t = STR[lang];

  var current = null;
  for (var i = 0; i < PAGES.length; i++) {
    if (PAGES[i].file === file) { current = i; break; }
  }
  if (current === null) { current = 0; file = "index.html"; }

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  // ---------- header ----------
  var headerHost = document.getElementById("dit-header");
  if (headerHost) {
    var header = el("header", "dit-header");
    var brand = el("a", "product");
    brand.href = "index.html";
    brand.innerHTML = t.product +
      '<span class="divider">|</span><span class="guide">' + t.guide + "</span>";
    var spacer = el("div", "spacer");
    var sw = el("a", "lang-switch", t.switchLabel);
    sw.href = "../" + otherLang + "/" + file;
    sw.title = t.switchTitle;
    sw.setAttribute("hreflang", otherLang);
    header.appendChild(brand);
    header.appendChild(spacer);
    header.appendChild(sw);
    headerHost.replaceWith(header);
  }

  // ---------- side navigation ----------
  var navHost = document.getElementById("dit-sidenav");
  if (navHost) {
    navHost.appendChild(el("div", "nav-title", t.contents));
    PAGES.forEach(function (p, idx) {
      var a = el("a", idx === current ? "active" : "");
      a.href = p.file;
      a.textContent = p[lang];
      if (idx === current) a.setAttribute("aria-current", "page");
      navHost.appendChild(a);
    });
  }

  // ---------- breadcrumb ----------
  var bcHost = document.getElementById("dit-breadcrumb");
  if (bcHost) {
    bcHost.className = "dit-breadcrumb";
    if (current === 0) {
      bcHost.innerHTML = t.home;
    } else {
      bcHost.innerHTML =
        '<a href="index.html">' + t.home + '</a><span class="sep">&rsaquo;</span>' +
        PAGES[current][lang];
    }
  }

  // ---------- pager ----------
  var pagerHost = document.getElementById("dit-pager");
  if (pagerHost) {
    pagerHost.className = "dit-pager";
    if (current > 0) {
      var prev = PAGES[current - 1];
      var pa = el("a", "prev",
        '<span class="pager-label">&larr; ' + t.prev + "</span>" + prev[lang]);
      pa.href = prev.file;
      pagerHost.appendChild(pa);
    }
    if (current < PAGES.length - 1) {
      var next = PAGES[current + 1];
      var na = el("a", "next",
        '<span class="pager-label">' + t.next + " &rarr;</span>" + next[lang]);
      na.href = next.file;
      pagerHost.appendChild(na);
    }
  }

  // ---------- footer ----------
  var footHost = document.getElementById("dit-footer");
  if (footHost) {
    var foot = el("footer", "dit-footer", t.footer);
    footHost.replaceWith(foot);
  }
})();
