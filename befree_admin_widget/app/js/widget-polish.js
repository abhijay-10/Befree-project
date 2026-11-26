/*
 * Visual polish for five Admin widgets. It only dresses what the other files have already drawn: adds classes,
 * colours, an icon, tooltips and motion. It reads no data, changes no text and calculates nothing.
 */
(function () {
  "use strict";

  const ICONS = {
    funnel: '<path d="M4 5h16l-6 7v5l-4 2v-7z"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z"/>',
    briefcase: '<rect x="3" y="7.5" width="18" height="12.5" rx="2"/><path d="M8.5 7.5V5a1.5 1.5 0 0 1 1.5-1.5h4A1.5 1.5 0 0 1 15.5 5v2.5M3 13h18"/>',
    share: '<circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="6" r="2.6"/><circle cx="18" cy="18" r="2.6"/><path d="m8.4 10.8 7.2-3.6M8.4 13.2l7.2 3.6"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.3-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 4.8a3.5 3.5 0 0 1 0 6.4M18.5 14.8c1.6.8 2.6 2.6 3 5.2"/>'
  };
  // Card title -> its accent and icon
  const CARDS = {
    "Unconfirmed deals by stage": { key: "stage", accent: "#4F46E5", icon: "funnel" },
    "Amount by country": { key: "country", accent: "#0D9488", icon: "globe" },
    "Amount by service": { key: "service", accent: "#7C3AED", icon: "briefcase" },
    "Channel contribution": { key: "channel", accent: "#2563EB", icon: "share" },
    "Leads by channel": { key: "leads", accent: "#DB2777", icon: "users" }
  };
  const PALETTE = ["#4F46E5", "#7C3AED", "#0D9488", "#D97706", "#E11D48", "#0284C7"]; // indigo, violet, teal, amber, rose, sky
  // The same country or service always gets the same colour
  const FIXED = {
    US: 0, UK: 4, AU: 2,
    "Accounting Services": 0, "Bookkeeping Services": 1, "Payroll Services": 2, "Tax Services": 3,
    "Audit Support Services": 4, "Paraplanning Services": 5, "Mortgage Services": 1, "Virtual Admin Services": 3
  };
  const colourOf = function (name) {
    const i = name in FIXED ? FIXED[name] : [...name].reduce(function (h, c) { return (h * 31 + c.charCodeAt(0)) % 997; }, 7);
    return PALETTE[i % PALETTE.length];
  };
  const quiet = function () { return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; };

  // Shows 0 → the value already on screen, then puts back that exact text.
  function countUp(node) {
    const final = node.textContent;
    const m = /^(\D*?)(\d[\d,]*(?:\.\d+)?)(.*)$/.exec(final);
    if (quiet()) return;
    if (!m || !parseFloat(m[2].replace(/,/g, ""))) { node.classList.add("pz-fade"); return; }
    const target = parseFloat(m[2].replace(/,/g, "")), decimals = (m[2].split(".")[1] || "").length, grouped = m[2].indexOf(",") !== -1;
    const start = performance.now();
    const step = function (now) {
      if (!node.isConnected || node.dataset.pzDone) return;
      const t = Math.max(0, Math.min(1, (now - start) / 700)), v = target * (1 - Math.pow(1 - t, 3));
      node.textContent = t < 1 ? m[1] + (grouped ? v.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : v.toFixed(decimals)) + m[3] : final;
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    setTimeout(function () { node.dataset.pzDone = "1"; node.textContent = final; }, 850); // the true value, with or without animation
  }

  function head(card, spec) {
    card.classList.add("pz-card", "pz-" + spec.key);
    card.style.setProperty("--accent", spec.accent);
    const title = card.querySelector(".card-title");
    const tile = document.createElement("span");
    tile.className = "pz-icon";
    tile.setAttribute("aria-hidden", "true");
    tile.innerHTML = '<svg viewBox="0 0 24 24">' + ICONS[spec.icon] + "</svg>";
    title.prepend(tile);
  }

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
      if (spec.key === "country" || spec.key === "service") row.style.setProperty("--row", colourOf(name));
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
      if (value && !row.classList.contains("rp-attr-total")) countUp(value);
    });
  }

  function dress(panel) {
    panel.querySelectorAll(".card").forEach(function (card) {
      const title = card.querySelector(".card-title");
      if (!title) return;
      const spec = CARDS[(title.firstChild && title.firstChild.nodeType === 3 ? title.firstChild.nodeValue : title.textContent).trim()] ||
        CARDS[card.dataset.pzKey];
      if (!card.dataset.pzKey) {
        if (!spec) return;
        card.dataset.pzKey = title.textContent.trim();
        head(card, spec);
      }
      rows(card, CARDS[card.dataset.pzKey]);
    });
  }

  document.querySelectorAll(".content > .panel").forEach(function (panel) {
    new MutationObserver(function () { dress(panel); }).observe(panel, { childList: true, subtree: true });
    dress(panel);
  });
})();
