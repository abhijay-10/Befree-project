/*
 * Admin UI v2: small visual hooks for the header, Overview and Reports. It only adds classes, decorative elements and
 * wrappers around text that is already there; it reads no data, changes no text and does not change any behaviour.
 */
(function () {
  "use strict";

  const $ = function (s, root) { return (root || document).querySelector(s); };
  const quiet = function () { return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; };
  const head = $(".admin-v2-head");
  if (!head) return;

  /* ---------- Header: shadow once the page scrolls ---------- */
  const onScroll = function () { head.classList.toggle("is-scrolled", window.scrollY > 4); };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- Breadcrumb: chevrons between the parts (the " / " text stays, hidden) ---------- */
  const crumb = $("#breadcrumb");
  function dressCrumb() {
    if (!crumb || crumb.querySelector(".v2-crumb")) return;
    const parts = crumb.textContent.split(" / ");
    if (parts.length < 2) return;
    crumb.replaceChildren();
    parts.forEach(function (p, i) {
      if (i) {
        const sep = document.createElement("span");
        sep.className = "v2-crumb-sep";
        sep.setAttribute("aria-hidden", "true");
        sep.textContent = " / ";
        crumb.appendChild(sep);
      }
      const s = document.createElement("span");
      s.className = "v2-crumb";
      s.textContent = p;
      crumb.appendChild(s);
    });
  }
  if (crumb) { new MutationObserver(dressCrumb).observe(crumb, { childList: true, characterData: true, subtree: true }); dressCrumb(); }

  /* ---------- Search: "Ctrl K" hint, and the shortcut focuses the field ---------- */
  const search = $(".search", head), input = $("#global-search");
  if (search && input && !$(".v2-kbd", search)) {
    const kbd = document.createElement("kbd");
    kbd.className = "v2-kbd";
    kbd.textContent = /Mac/i.test(navigator.platform) ? "⌘ K" : "Ctrl K";
    search.appendChild(kbd);
    document.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); input.focus(); }
    });
  }

  /* ---------- Tabs: one sliding gradient underline; page background on Overview and Reports ---------- */
  const tabs = $(".tabs", head);
  const line = document.createElement("i");
  line.className = "v2-tab-line";
  if (tabs) tabs.appendChild(line);
  function placeLine() {
    const active = tabs && $('.tab[aria-selected="true"]', tabs);
    if (!active) return;
    line.style.transform = "translateX(" + active.offsetLeft + "px) scaleX(" + (active.offsetWidth / 100) + ")";
    document.body.classList.toggle("v2-page", active.dataset.tab === "overview" || active.dataset.tab === "reports");
  }
  if (tabs) {
    new MutationObserver(placeLine).observe(tabs, { attributes: true, subtree: true, attributeFilter: ["aria-selected"] });
    window.addEventListener("resize", placeLine);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(placeLine);
    setTimeout(placeLine, 0);
  }

  /* ---------- Refresh icon turns once per click ---------- */
  const refresh = $("#refresh-btn");
  if (refresh) refresh.addEventListener("click", function () {
    refresh.classList.remove("v2-spin");
    void refresh.offsetWidth;
    refresh.classList.add("v2-spin");
    setTimeout(function () { refresh.classList.remove("v2-spin"); }, 700);
  });

  /* ---------- Cards that the earlier polish did not cover: accent colour and icon tile ---------- */
  const ICONS = {
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.3-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 4.8a3.5 3.5 0 0 1 0 6.4M18.5 14.8c1.6.8 2.6 2.6 3 5.2"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.2"/><circle cx="4.5" cy="12" r="1.2"/><circle cx="4.5" cy="18" r="1.2"/>',
    pie: '<path d="M12 3a9 9 0 1 0 9 9h-9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>',
    trend: '<path d="m4 16 6-6 4 4 6-7M15 7h5v5"/>',
    alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.5"/>',
    funnel: '<path d="M4 5h16l-6 7v5l-4 2v-7z"/>',
    check: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="m8 12.2 2.8 2.8L16.2 9"/>',
    steps: '<path d="M4 18h5v-5h5V8h6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.2l3.4 2"/>'
  };
  const MORE = {
    "Country comparison": ["#0ea5e9", "globe"], "Leads": ["#ec4899", "users"], "Open leads by status": ["#8b5cf6", "list"],
    "Service contribution": ["#14b8a6", "pie"], "Revenue forecast": ["#4f46e5", "trend"], "At-risk deals": ["#f43f5e", "alert"],
    "Deals Pipeline": ["#8b5cf6", "funnel"], "Confirmed deals": ["#10b981", "check"], "Stage-to-stage conversion": ["#f59e0b", "steps"],
    "Lead response time": ["#0ea5e9", "clock"], "Forecast vs target": ["#4f46e5", "trend"]
  };
  function dressCards(panel) {
    panel.querySelectorAll(".card").forEach(function (card) {
      if (card.classList.contains("pz-card") || card.classList.contains("ov-kpi") || card.classList.contains("ov-banner")) return;
      const title = card.querySelector(".card-title");
      if (!title) return;
      const text = (title.firstChild && title.firstChild.nodeType === 3 ? title.firstChild.nodeValue : title.textContent).trim();
      const spec = MORE[text] || (card.dataset.v2 && MORE[card.dataset.v2]);
      if (!spec) return;
      if (!card.dataset.v2) { card.dataset.v2 = text; card.classList.add("v2-card"); card.style.setProperty("--accent", spec[0]); }
      if (!title.querySelector(".v2-icon")) {
        const tile = document.createElement("span");
        tile.className = "v2-icon";
        tile.setAttribute("aria-hidden", "true");
        tile.innerHTML = '<svg viewBox="0 0 24 24">' + ICONS[spec[1]] + "</svg>";
        title.prepend(tile);
      }
    });
  }

  /* ---------- Banner: stat chips and a warning pill (same text, wrapped) ---------- */
  function dressBanner(panel) {
    const banner = $(".ov-banner", panel);
    if (!banner || banner.dataset.v2) return;
    banner.dataset.v2 = "1";
    banner.querySelectorAll(".ov-banner-text > p").forEach(function (p, i) {
      if (/^(Could not be read from CRM|Reason):/.test(p.textContent)) { p.classList.add("v2-warn"); return; }
      if (i !== 0) return;
      const parts = p.textContent.split(" · ");
      p.replaceChildren();
      p.classList.add("v2-chips");
      parts.forEach(function (t, k) {
        if (k) { const sep = document.createElement("span"); sep.className = "v2-hide"; sep.textContent = " · "; p.appendChild(sep); }
        const chip = document.createElement("span");
        chip.className = "v2-chip";
        chip.textContent = t;
        p.appendChild(chip);
      });
    });
  }

  /* ---------- KPI cards: one active card on click, with a ripple; the click does nothing else ---------- */
  function onKpiClick(e) {
    const card = e.target.closest(".ov-kpi");
    if (!card) return;
    const panel = card.closest(".admin-v2");
    panel.querySelectorAll(".ov-kpi.v2-active").forEach(function (c) { if (c !== card) c.classList.remove("v2-active"); });
    card.classList.add("v2-active");
    if (quiet()) return;
    const box = card.getBoundingClientRect(), ripple = document.createElement("span");
    ripple.className = "v2-ripple";
    ripple.style.left = (e.clientX - box.left) + "px";
    ripple.style.top = (e.clientY - box.top) + "px";
    card.appendChild(ripple);
    setTimeout(function () { ripple.remove(); }, 520);
  }

  /* ---------- 12-column layout: places the existing cards in rows and adds decorative section headings ---------- */
  // [section, area key, columns, extra] in display order. Area keys come from each card's title.
  const LAYOUT = {
    overview: [
      [null, "banner", 12], ["Key metrics", "kpis", 12], ["Forecast", "Revenue Forecast", 12],
      ["Revenue & activity", "Revenue forecast", 8], [null, "Recent activity", 4, "fit"],
      ["Pipeline & performance", "Deals won vs lost", 6], [null, "Unconfirmed deals by stage", 6], [null, "Deals Pipeline", 6], [null, "At-risk deals", 6],
      ["Breakdowns", "Leads", 8], [null, "Open leads by status", 4], [null, "Service contribution", 12], [null, "Country comparison", 12],
      ["Details", "Confirmed deals", 12]
    ],
    reports: [
      ["Revenue & performance", "Revenue trend", 8], [null, "Deals won vs lost", 4],
      ["Breakdowns", "Amount by country", 4], [null, "Amount by service", 4], [null, "Sales by owner", 4, "third"],
      ["Channels & marketing", "Marketing attribution", 12]
    ]
  };
  const keyOf = function (card) {
    if (card.classList.contains("ov-banner")) return "banner";
    if (card.classList.contains("ov-kpis")) return "kpis";
    if (card.dataset.pzKey) return card.dataset.pzKey === "Revenue won" ? "Deals won vs lost" : card.dataset.pzKey;
    if (card.dataset.v2) return card.dataset.v2;
    const t = card.querySelector(".card-title");
    return t ? (t.firstChild && t.firstChild.nodeType === 3 ? t.firstChild.nodeValue : t.textContent).trim() : "";
  };
  function layout(panel) {
    const tab = panel.id.replace("panel-", ""), plan = LAYOUT[tab];
    if (!plan) return;
    // Only once the real cards are there (not while loading, not on the "could not load" message)
    if (!panel.querySelector(tab === "overview" ? ":scope > .ov-kpis" : ":scope > .rp-grid")) {
      panel.querySelectorAll(":scope > .v2-section").forEach(function (h) { h.remove(); });
      return;
    }
    // Wrapper rows hand their cards to the page grid
    panel.querySelectorAll(":scope > .ov-split, :scope > .nc-row, :scope > .rp-grid").forEach(function (w) { w.classList.add("v2-contents"); });
    const items = [];
    panel.querySelectorAll(":scope > *:not(.v2-section), :scope > .v2-contents > *").forEach(function (n) { if (!n.classList.contains("v2-contents")) items.push(n); });
    let order = 0, placed = 0;
    plan.forEach(function (row) {
      const section = row[0], key = row[1], span = row[2], extra = row[3];
      if (section) {
        let h = panel.querySelector(':scope > .v2-section[data-section="' + section + '"]');
        if (!h) {
          h = document.createElement("div");
          h.className = "v2-section";
          h.dataset.section = section;
          h.setAttribute("aria-hidden", "true");
          h.textContent = section;
          panel.appendChild(h);
        }
        h.style.order = String(order++);
      }
      const item = items.find(function (n) { return keyOf(n) === key; });
      if (!item) return;
      placed++;
      item.style.order = String(order++);
      item.dataset.v2Span = String(span);
      item.classList.toggle("v2-fit", extra === "fit");
      if (extra === "third") item.dataset.v2Third = "1"; else delete item.dataset.v2Third;
    });
    // Anything not in the plan stays at the bottom, full width
    items.forEach(function (n) { if (!n.dataset.v2Span) n.style.order = String(order + 1); });
    panel.classList.toggle("v2-laid", placed > 0);
  }

  document.querySelectorAll(".admin-v2").forEach(function (panel) {
    const dress = function () { dressCards(panel); dressBanner(panel); layout(panel); };
    new MutationObserver(dress).observe(panel, { childList: true, subtree: true });
    panel.addEventListener("click", onKpiClick);
    dress();
  });

  /* ---------- Revenue trend: gradient line (indigo to violet) ---------- */
  if (window.Chart && Chart.register) {
    Chart.register({
      id: "v2Revenue",
      beforeInit: function (chart) {
        if (!chart.canvas.closest(".admin-v2 .rp-line")) return;
        const ds = chart.data.datasets[0];
        if (!ds) return;
        ds.borderColor = function (c) {
          const area = c.chart.chartArea;
          if (!area) return "#4f46e5";
          const g = c.chart.ctx.createLinearGradient(area.left, 0, area.right, 0);
          g.addColorStop(0, "#4f46e5");
          g.addColorStop(1, "#8b5cf6");
          return g;
        };
        ds.pointBorderColor = "#8b5cf6";
      }
    });
  }
})();
