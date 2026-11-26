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
  let open = false; // drop-off list

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

  // Stacked trapezoids with a soft gradient and a lighter oval top. Width follows the count, with a minimum.
  function funnel(rows, colour) {
    const W = 300, step = 44, height = rows.length * step + 22;
    const max = Math.max.apply(null, [1].concat(rows.map(function (r) { return r.count; })));
    const root = svg("svg", { viewBox: "0 0 " + W + " " + height, class: "df-svg", role: "img",
      "aria-label": rows.map(function (r) { return r.name + " " + r.count; }).join(", ") });
    const defs = svg("defs");
    root.appendChild(defs);
    rows.forEach(function (r, i) {
      const top = 70 + (W - 82) * (r.count / max), bottom = top * 0.84, y = 12 + i * step, mid = W / 2;
      const grad = svg("linearGradient", { id: "df-grad-" + i, x1: "0", x2: "1", y1: "0", y2: "0" });
      grad.append(svg("stop", { offset: "0", "stop-color": mix(colour[i], "#ffffff", .12) }),
        svg("stop", { offset: ".55", "stop-color": colour[i] }), svg("stop", { offset: "1", "stop-color": mix(colour[i], "#000000", .18) }));
      defs.appendChild(grad);
      const g = svg("g", { class: "df-seg", "data-i": i });
      g.style.animationDelay = (i * 80) + "ms";
      g.append(
        svg("path", { fill: "url(#df-grad-" + i + ")", d: "M" + (mid - top / 2) + " " + y + " L" + (mid + top / 2) + " " + y +
          " L" + (mid + bottom / 2) + " " + (y + step - 12) + " Q" + mid + " " + (y + step - 2) + " " + (mid - bottom / 2) + " " + (y + step - 12) + " Z" }),
        svg("ellipse", { cx: mid, cy: y, rx: top / 2, ry: 7, fill: mix(colour[i], "#ffffff", .42) })
      );
      root.appendChild(g);
    });
    return root;
  }

  function conversionBar(rows) {
    const first = rows[0], last = rows[rows.length - 1];
    const box = el("div", "df-conv");
    const head = el("button", "df-conv-head");
    head.type = "button";
    head.setAttribute("aria-expanded", String(open));
    head.append(el("span", "", "Conversion Rate"), el("strong", "", first && first.count ? percent(last.count, first.count) : "—"));
    const chevron = svg("svg", { viewBox: "0 0 24 24", class: "df-chevron", "aria-hidden": "true" });
    chevron.appendChild(svg("path", { d: "m6 9 6 6 6-6" }));
    head.appendChild(chevron);
    const list = el("ul", "df-drop");
    list.hidden = !open;
    rows.slice(1).forEach(function (r, i) {
      const prev = rows[i];
      const change = prev.count ? (r.count - prev.count) / prev.count * 100 : null;
      const li = el("li");
      li.append(el("span", "", prev.name + " → " + r.name),
        el("b", !change ? "is-flat" : change < 0 ? "is-down" : "", change === null ? "—" : change < 0 ? Math.abs(change).toFixed(1) + "% drop" : change > 0 ? change.toFixed(1) + "% more" : "no change"));
      list.appendChild(li);
    });
    head.addEventListener("click", function () {
      open = !open;
      head.setAttribute("aria-expanded", String(open));
      list.hidden = !open;
    });
    box.append(head, el("p", "df-conv-note", first && last ? last.name + " ÷ " + first.name : ""), list);
    return box;
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
      body.append(main, conversionBar(rows));
    }

    select.addEventListener("change", function () { period = select.value; draw(); });
    draw();
    return card;
  }

  return { render: render, count: count };
})();
