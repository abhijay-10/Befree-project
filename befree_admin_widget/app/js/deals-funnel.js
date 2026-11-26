/*
 * Deals Pipeline funnel (Admin Overview). Read-only: it only counts the deals the Overview already loaded
 * (data.deals, already limited to the header country) by Stage, in the order of the CRM Stage pick list
 * (Data.STAGES, Closed-won last; lost deals are not a step). The period filters on Created Time.
 */
window.DealsFunnel = (function () {
  "use strict";

  const PERIODS = [["thisMonth", "This Month"], ["lastMonth", "Last Month"], ["last30", "Last 30 Days"], ["all", "All Time"]];
  const PALETTE = ["#7C5CE0", "#3B6FF0", "#14A89A", "#F0932B", "#E0559A"]; // purple, blue, teal, orange, pink
  const NS = "http://www.w3.org/2000/svg";
  let period = "thisMonth";

  const el = function (tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const svg = function (tag, attrs) {
    const n = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    return n;
  };
  const quiet = function () { return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; };

  // Colours for any number of stages: the five palette colours, blended in between when there are more.
  function mix(a, b, t) {
    return "#" + [1, 3, 5].map(function (i) {
      return Math.round(parseInt(a.substr(i, 2), 16) * (1 - t) + parseInt(b.substr(i, 2), 16) * t).toString(16).padStart(2, "0");
    }).join("");
  }
  function colours(n) {
    if (n <= PALETTE.length) return PALETTE.slice(0, n);
    return Array.from({ length: n }, function (_, i) {
      const x = i / (n - 1) * (PALETTE.length - 1), k = Math.min(Math.floor(x), PALETTE.length - 2);
      return mix(PALETTE[k], PALETTE[k + 1], x - k);
    });
  }

  // [from, to) of a period, in local time; from = null means all time.
  function range(key, now) {
    const month = function (offset) { return new Date(now.getFullYear(), now.getMonth() + offset, 1); };
    if (key === "thisMonth") return [month(0), month(1)];
    if (key === "lastMonth") return [month(-1), month(0)];
    if (key === "last30") return [new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29), null];
    return [null, null];
  }

  // Number of deals per stage, in pipeline order.
  function count(deals, stages, key, now) {
    const r = range(key, now || new Date());
    const inPeriod = deals.filter(function (d) { return !r[0] || (d.created && d.created >= r[0] && (!r[1] || d.created < r[1])); });
    return stages.map(function (s) {
      return { name: s.name, count: inPeriod.filter(function (d) { return d.stage === s.name; }).length };
    });
  }

  const percent = function (a, b) { return b ? (a / b * 100).toFixed(1) + "%" : "—"; };

  function countUp(node, target) {
    if (quiet() || !target) { node.textContent = String(target); return; }
    const start = performance.now();
    const step = function (now) {
      if (!node.isConnected) return;
      const t = Math.min(1, (now - start) / 700);
      node.textContent = String(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) requestAnimationFrame(step);
    };
    node.textContent = "0";
    requestAnimationFrame(step);
    setTimeout(function () { node.textContent = String(target); }, 900); // the true value, with or without animation
  }

  /*
   * A classic funnel: one cone that narrows evenly from a wide top to a narrow neck, cut into one band per stage.
   * The shape is fixed (it does not follow the counts), so it always reads as a funnel; each band shows its count.
   */
  function funnel(rows, colour) {
    const W = 320, mid = W / 2, topW = 304, neckW = 62, band = 46, gap = 3, rim = 11;
    const H = rows.length * band, height = rim + H + 4;
    const widthAt = function (y) { return topW - (topW - neckW) * (y / H); };
    const root = svg("svg", { viewBox: "0 0 " + W + " " + height, class: "df-svg", role: "img",
      "aria-label": rows.map(function (r) { return r.name + " " + r.count; }).join(", ") });
    const defs = svg("defs");
    root.appendChild(defs);
    rows.forEach(function (r, i) {
      const y0 = i * band, y1 = y0 + band - gap, w0 = widthAt(y0), w1 = widthAt(y1);
      const top = rim + y0, bottom = rim + y1;
      const grad = svg("linearGradient", { id: "df-grad-" + i, x1: "0", x2: "1", y1: "0", y2: "0" });
      grad.append(svg("stop", { offset: "0", "stop-color": mix(colour[i], "#ffffff", .14) }),
        svg("stop", { offset: ".5", "stop-color": colour[i] }), svg("stop", { offset: "1", "stop-color": mix(colour[i], "#000000", .16) }));
      defs.appendChild(grad);
      const g = svg("g", { class: "df-seg", "data-i": i });
      g.style.animationDelay = (i * 70) + "ms";
      g.appendChild(svg("path", { fill: "url(#df-grad-" + i + ")", d: "M" + (mid - w0 / 2) + " " + top + " L" + (mid + w0 / 2) + " " + top +
        " L" + (mid + w1 / 2) + " " + bottom + " L" + (mid - w1 / 2) + " " + bottom + " Z" }));
      // Only the mouth of the funnel gets an oval rim
      if (i === 0) g.appendChild(svg("ellipse", { cx: mid, cy: top, rx: w0 / 2, ry: rim - 2, fill: mix(colour[0], "#ffffff", .45) }));
      const label = svg("text", { x: mid, y: (top + bottom) / 2 + (i === 0 ? 4 : 0), class: "df-count", "text-anchor": "middle", "dominant-baseline": "central" });
      label.textContent = String(r.count);
      g.appendChild(label);
      root.appendChild(g);
    });
    return root;
  }

  function render(data, state) {
    const card = el("article", "card df-card");
    card.dataset.card = "deals-funnel";
    const header = el("header", "card-header df-header");
    const heading = el("div");
    heading.append(el("h2", "card-title", "Deals Pipeline"),
      el("p", "card-subtitle", "Deals by current stage, by created date · " + countryLabel(state)));
    const select = el("select", "df-period");
    select.setAttribute("aria-label", "Pipeline period");
    PERIODS.forEach(function (p) {
      const o = el("option", "", p[1]);
      o.value = p[0];
      select.appendChild(o);
    });
    select.value = period;
    header.append(heading, select);
    const body = el("div", "card-body");
    card.append(header, body);

    function draw() {
      const rows = count(data.deals, Data.STAGES, period);
      const total = rows.reduce(function (t, r) { return t + r.count; }, 0);
      card.dataset.total = total;
      body.replaceChildren();
      if (data.unavailable || !total) {
        const empty = el("div", "df-empty");
        empty.append(el("b", "", data.unavailable ? "Deals could not be loaded" : "No deals in this period"),
          el("p", "", data.unavailable ? "Use refresh to try again." : "Choose another period to see the pipeline."));
        body.appendChild(empty);
        return;
      }
      const colour = colours(rows.length);
      const main = el("div", "df-main");
      const shape = el("div", "df-shape");
      shape.appendChild(funnel(rows, colour));
      const legend = el("ul", "df-legend");
      const tip = el("div", "df-tip");
      tip.hidden = true;
      rows.forEach(function (r, i) {
        const li = el("li");
        li.dataset.i = i;
        li.tabIndex = 0;
        const dot = el("i");
        dot.style.background = colour[i];
        const number = el("b", "", "0");
        li.append(dot, el("span", "", r.name), number);
        legend.appendChild(li);
        countUp(number, r.count);
      });
      // Hover or focus on a segment or its legend row: highlight it, dim the rest, show a tooltip
      const light = function (i, event) {
        main.classList.toggle("has-focus", i !== null);
        main.querySelectorAll("[data-i]").forEach(function (n) { n.classList.toggle("is-on", i !== null && Number(n.getAttribute("data-i")) === i); });
        tip.hidden = i === null;
        if (i === null) return;
        tip.textContent = rows[i].name + " · " + rows[i].count + (rows[i].count === 1 ? " deal" : " deals") + " · " + percent(rows[i].count, total) + " of total";
        const box = main.getBoundingClientRect(), at = event.type === "focusin" ? event.target.getBoundingClientRect() : null;
        tip.style.left = Math.max(8, Math.min(box.width - 220, (at ? at.left : event.clientX) - box.left + 12)) + "px";
        tip.style.top = ((at ? at.top : event.clientY) - box.top - 34) + "px";
      };
      const index = function (event) { const n = event.target.closest("[data-i]"); return n ? Number(n.getAttribute("data-i")) : null; };
      main.addEventListener("mousemove", function (e) { light(index(e), e); });
      main.addEventListener("mouseleave", function (e) { light(null, e); });
      legend.addEventListener("focusin", function (e) { light(index(e), e); });
      legend.addEventListener("focusout", function (e) { light(null, e); });
      main.append(shape, legend, tip);
      body.append(main);
    }

    select.addEventListener("change", function () { period = select.value; draw(); });
    draw();
    return card;
  }

  return { render: render, count: count };
})();
