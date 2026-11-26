/*
 * Visual polish for the Admin widgets. It only dresses what the other files have already drawn: classes, colours,
 * icons, tooltips and motion. It reads no data, changes no text and calculates nothing.
 */
(function () {
  "use strict";

  const ICONS = {
    funnel: '<path d="M4 5h16l-6 7v5l-4 2v-7z"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z"/>',
    briefcase: '<rect x="3" y="7.5" width="18" height="12.5" rx="2"/><path d="M8.5 7.5V5a1.5 1.5 0 0 1 1.5-1.5h4A1.5 1.5 0 0 1 15.5 5v2.5M3 13h18"/>',
    share: '<circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="6" r="2.6"/><circle cx="18" cy="18" r="2.6"/><path d="m8.4 10.8 7.2-3.6M8.4 13.2l7.2 3.6"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.3-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 4.8a3.5 3.5 0 0 1 0 6.4M18.5 14.8c1.6.8 2.6 2.6 3 5.2"/>',
    bars: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
    pulse: '<path d="M3 12h4l2-6 4 12 2-6h6"/>',
    trophy: '<path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4"/>',
    trend: '<path d="m4 16 6-6 4 4 6-7M15 7h5v5"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>'
  };
  // Card title -> its accent and icon. "Revenue won" is the same card as "Deals won vs lost" (its title follows the toggle).
  const WON_LOST = { key: "wonlost", accent: "#0D9488", icon: "bars" };
  const CARDS = {
    "Unconfirmed deals by stage": { key: "stage", accent: "#4F46E5", icon: "funnel" },
    "Amount by country": { key: "country", accent: "#0D9488", icon: "globe" },
    "Amount by service": { key: "service", accent: "#7C3AED", icon: "briefcase" },
    "Channel contribution": { key: "channel", accent: "#2563EB", icon: "share" },
    "Marketing attribution": { key: "attribution", accent: "#7C3AED", icon: "target" },
    "Leads by channel": { key: "leads", accent: "#DB2777", icon: "users" },
    "Deals won vs lost": WON_LOST,
    "Revenue won": WON_LOST,
    "Recent activity": { key: "activity", accent: "#0284C7", icon: "pulse" },
    "Sales by owner": { key: "owner", accent: "#D97706", icon: "trophy" },
    "Revenue trend": { key: "revenue", accent: "#2563EB", icon: "trend" }
  };
  const PALETTE = ["#4F46E5", "#7C3AED", "#0D9488", "#D97706", "#E11D48", "#0284C7", "#059669", "#C026D3"]; // indigo, violet, teal, amber, rose, sky, emerald, fuchsia
  // The same country, service or channel always gets the same colour, in every widget
  const FIXED = {
    US: 0, UK: 4, AU: 2,
    "Accounting Services": 0, "Bookkeeping Services": 1, "Payroll Services": 2, "Tax Services": 3,
    "Audit Support Services": 4, "Paraplanning Services": 5, "Mortgage Services": 1, "Virtual Admin Services": 3,
    Email: 0, Webinars: 1, Events: 2, "LinkedIn Organic": 5, "LinkedIn Ads": 3, "Google Ads": 4, Website: 6, "Social Media": 7
  };
  const colourOf = function (name) {
    const i = name in FIXED ? FIXED[name] : [...name].reduce(function (h, c) { return (h * 31 + c.charCodeAt(0)) % 997; }, 7);
    return PALETTE[i % PALETTE.length];
  };
  const quiet = function () { return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; };
  const initials = function (name) {
    const w = String(name || "?").trim().split(/\s+/);
    return ((w[0] || "?").charAt(0) + (w.length > 1 ? w[w.length - 1].charAt(0) : "")).toUpperCase();
  };

  // Shows 0 → the value already on screen, then puts back that exact text.
  function countUp(node) {
    if (node.dataset.pzCount) return;
    node.dataset.pzCount = "1";
    const final = node.textContent;
    const m = /^(\D*?)(\d[\d,]*(?:\.\d+)?)(.*)$/.exec(final);
    if (quiet()) return;
    if (!m || !parseFloat(m[2].replace(/,/g, ""))) { node.classList.add("pz-fade"); return; }
    const target = parseFloat(m[2].replace(/,/g, "")), decimals = (m[2].split(".")[1] || "").length, grouped = m[2].indexOf(",") !== -1;
    const start = performance.now();
    let done = false;
    const step = function (now) {
      if (!node.isConnected || done) return;
      const t = Math.max(0, Math.min(1, (now - start) / 700)), v = target * (1 - Math.pow(1 - t, 3));
      node.textContent = t < 1 ? m[1] + (grouped ? v.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : v.toFixed(decimals)) + m[3] : final;
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    setTimeout(function () { done = true; node.textContent = final; }, 850); // the true value, with or without animation
  }

  function head(card, spec) {
    card.classList.add("pz-card", "pz-" + spec.key);
    card.style.setProperty("--accent", spec.accent);
    icon(card, spec);
  }
  // The icon tile beside the title (put back if the title text is replaced, as the won/lost toggle does)
  function icon(card, spec) {
    const title = card.querySelector(".card-title");
    if (!title || title.querySelector(".pz-icon")) return;
    const tile = document.createElement("span");
    tile.className = "pz-icon";
    tile.setAttribute("aria-hidden", "true");
    tile.innerHTML = '<svg viewBox="0 0 24 24">' + ICONS[spec.icon] + "</svg>";
    title.prepend(tile);
  }

  // Bar rows: colour, tooltip, zero state, count-up
  function rows(card, spec) {
    card.querySelectorAll(".ov-funnel-row, .hbar, .rp-attr-row, .mk-lead-row").forEach(function (row, i) {
      if (row.dataset.pz) return;
      row.dataset.pz = "1";
      row.classList.add("pz-row");
      row.style.setProperty("--i", i);
      const label = row.querySelector(".ov-funnel-label, .hbar-label, .rp-attr-label, .mk-lead-label");
      const value = row.querySelector(".hbar-value, .rp-attr-value, .mk-lead-value");
      const bar = row.querySelector(".ov-funnel-bar");
      const name = label ? label.textContent.trim() : "";
      row.title = name + (value ? ": " + value.textContent : bar ? ": " + bar.textContent : "");
      if (label) label.removeAttribute("title"); // one tooltip for the whole row
      if (value && /^(₹0|0)(\s|$)/.test(value.textContent.trim())) row.classList.add("is-zero");
      if (spec.key === "country" || spec.key === "service" || spec.key === "channel" || spec.key === "attribution") row.style.setProperty("--row", colourOf(name));
      if (spec.key === "stage") {
        // Deeper to lighter as the stage moves on
        row.style.setProperty("--row", ["#3730A3", "#4338CA", "#4F46E5", "#6366F1", "#7C83EE"][i] || "#8D9FC9");
        // The stage % as a badge (same text, wrapped)
        const first = label && label.firstChild;
        if (first && first.nodeType === 3 && /^\s*\d+%/.test(first.nodeValue)) {
          const badge = document.createElement("span");
          badge.className = "pz-badge";
          badge.textContent = first.nodeValue.trim();
          label.replaceChild(badge, first);
          badge.after(" ");
        }
      }
      if (spec.key === "leads" && value) {
        // "2 · 1 to deals": the deal count in a small green chip (same text, wrapped)
        const parts = value.textContent.split(" · ");
        if (parts.length === 2) {
          value.textContent = parts[0] + " · ";
          const chip = document.createElement("span");
          chip.className = "pz-chip";
          chip.textContent = parts[1];
          value.appendChild(chip);
        }
      }
      if (value && !row.classList.contains("rp-attr-total") && spec.key !== "leads") countUp(value);
    });
  }

  // Deals won vs lost: tinted Won / Lost / Win rate boxes, bar colours and zero markers
  function wonLost(card) {
    card.querySelectorAll(".nc-stat").forEach(function (box, i) {
      if (box.dataset.pz) return;
      box.dataset.pz = "1";
      box.classList.add("pz-stat", ["is-won", "is-lost", "is-rate"][i] || "");
      const strong = box.querySelector("strong");
      if (strong) countUp(strong);
    });
    card.querySelectorAll(".ov-chart-bar").forEach(function (bar, i) {
      if (bar.dataset.pz) return;
      bar.dataset.pz = "1";
      const style = bar.getAttribute("style") || "";
      bar.classList.add(/--pink/.test(style) ? "is-lost" : /--blue/.test(style) ? "is-revenue" : "is-won");
      if (/height:\s*0%/.test(style)) bar.classList.add("is-empty");
      bar.style.setProperty("--i", i);
    });
  }

  // Recent activity: the time part of each line sits in a small chip (same text, wrapped)
  function activity(card) {
    card.querySelectorAll(".ov-activity").forEach(function (row, i) {
      if (row.dataset.pz) return;
      row.dataset.pz = "1";
      row.style.setProperty("--i", i);
      const detail = row.querySelector(".ov-activity-detail");
      if (!detail) return;
      const text = detail.textContent, at = text.lastIndexOf(" · ");
      if (at === -1) return;
      detail.textContent = text.slice(0, at + 3);
      const chip = document.createElement("span");
      chip.className = "pz-time";
      chip.textContent = text.slice(at + 3);
      detail.appendChild(chip);
    });
  }

  // Sales by owner: initials beside each name (drawn by CSS, so the text is unchanged)
  function owners(card) {
    card.querySelectorAll(".rp-owner").forEach(function (row, i) {
      if (row.dataset.pz) return;
      row.dataset.pz = "1";
      row.style.setProperty("--i", i);
      const name = row.querySelector(".rp-owner-name"), bar = row.querySelector(".rp-owner-bar");
      if (name) { name.dataset.initials = initials(name.textContent); name.title = name.textContent; }
      if (bar) row.title = bar.title;
      const won = row.querySelector(".rp-owner-value b");
      if (won) countUp(won);
    });
  }

  function dress(panel) {
    panel.querySelectorAll(".card").forEach(function (card) {
      const title = card.querySelector(".card-title");
      if (!title) return;
      if (!card.dataset.pzKey) {
        const text = (title.firstChild && title.firstChild.nodeType === 3 ? title.firstChild.nodeValue : title.textContent).trim();
        if (!CARDS[text]) return;
        card.dataset.pzKey = text;
        head(card, CARDS[text]);
      }
      const spec = CARDS[card.dataset.pzKey];
      icon(card, spec);
      if (spec.key === "wonlost") wonLost(card);
      else if (spec.key === "activity") activity(card);
      else if (spec.key === "owner") owners(card);
      else rows(card, spec);
    });
  }

  /* ---------- Revenue trend chart: thicker line, last point with a pulsing ring, hover guide line ---------- */
  if (window.Chart && Chart.register) {
    Chart.register({
      id: "pzRevenue",
      beforeInit: function (chart) {
        if (!chart.canvas.closest(".rp-line")) return;
        const ds = chart.data.datasets[0];
        if (!ds) return;
        ds.borderWidth = 3;
        ds.pointRadius = function (c) { return c.dataIndex === c.dataset.data.length - 1 ? 5 : 0; };
        ds.pointHoverRadius = 6;
        chart.options.animation = quiet() ? false : { duration: 900, easing: "easeOutCubic" };
      },
      afterDraw: function (chart) {
        const box = chart.canvas.closest(".rp-line");
        if (!box) return;
        const area = chart.chartArea, active = chart.tooltip && chart.tooltip.getActiveElements ? chart.tooltip.getActiveElements() : [];
        if (active.length) { // dashed guide at the point under the pointer
          const ctx = chart.ctx, x = active[0].element.x;
          ctx.save();
          ctx.setLineDash([4, 4]);
          ctx.strokeStyle = "rgba(37, 99, 235, .45)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, area.top);
          ctx.lineTo(x, area.bottom);
          ctx.stroke();
          ctx.restore();
        }
        const meta = chart.getDatasetMeta(0), last = meta && meta.data[meta.data.length - 1];
        if (!last) return;
        let ring = box.querySelector(".pz-ring");
        if (!ring) { ring = document.createElement("i"); ring.className = "pz-ring"; box.appendChild(ring); }
        ring.style.left = last.x + "px";
        ring.style.top = last.y + "px";
      }
    });
  }

  document.querySelectorAll(".content > .panel").forEach(function (panel) {
    new MutationObserver(function () { dress(panel); }).observe(panel, { childList: true, subtree: true });
    dress(panel);
  });
})();
