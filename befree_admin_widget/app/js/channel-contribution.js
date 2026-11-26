/*
 * Channel Contribution trend (Admin Overview). Read-only: it draws what the dashboard already loaded,
 * limited to the header country.
 *   Leads: data.channelLeads [{ created, source }] by Created Time.
 *   Won Revenue: Closed-won deals in data.deals, by Closing Date, amount per source channel.
 * One line per channel: the 5 largest in the range, the rest together as "Other".
 */
window.ChannelContribution = (function () {
  "use strict";

  const RANGES = [["1M", "1M"], ["3M", "3M"], ["6M", "6M"], ["1Y", "1Y"]];
  const COLOURS = ["#7C5CE0", "#0EA5B7", "#16A06B", "#E8890C", "#1F2937"]; // purple, cyan, green, orange, near-black
  const OTHER = "Other", GREY = "#9CA3AF";
  const NS = "http://www.w3.org/2000/svg";
  const view = { range: "3M", metric: "leads", hidden: new Set() };

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

  /* ---------- numbers ---------- */

  // [from, to) of each bucket, oldest first, the last one ending today.
  function buckets(range, now) {
    const at = function (daysAgo) { return new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo); };
    if (range === "1Y") {
      return Array.from({ length: 12 }, function (_, i) {
        return { from: new Date(now.getFullYear(), now.getMonth() - 11 + i, 1), to: new Date(now.getFullYear(), now.getMonth() - 10 + i, 1) };
      });
    }
    const step = range === "1M" ? 1 : 7, count = range === "1M" ? 30 : range === "3M" ? 13 : 26;
    return Array.from({ length: count }, function (_, i) {
      const end = (count - 1 - i) * step;
      return { from: at(end + step - 1), to: at(end - 1) };
    });
  }

  // The records of a metric as { date, source, value }.
  function records(data, metric) {
    if (metric === "revenue") {
      return data.deals.filter(function (d) { return d.group === "confirmed" && d.closedOn; }).map(function (d) {
        const named = d.source && d.source !== "Other / not set" ? d.source : d.leadSource;
        const p = d.closedOn.split("-");
        return { date: new Date(+p[0], p[1] - 1, +p[2]), source: named && named !== "-None-" ? named : null, value: d.amount };
      });
    }
    return (data.channelLeads || []).map(function (l) { return { date: l.created, source: l.source, value: 1 }; });
  }

  // Series per channel over the buckets. Records with no source are not drawn; their total is returned as "unnamed".
  function build(data, range, metric, now) {
    const slots = buckets(range, now || new Date());
    const by = new Map();
    let unnamed = 0;
    records(data, metric).forEach(function (r) {
      if (!r.date) return;
      const i = slots.findIndex(function (s) { return r.date >= s.from && r.date < s.to; });
      if (i === -1) return;
      if (!r.source) { unnamed += r.value; return; }
      if (!by.has(r.source)) by.set(r.source, slots.map(function () { return 0; }));
      by.get(r.source)[i] += r.value;
    });
    const total = function (v) { return v.reduce(function (t, x) { return t + x; }, 0); };
    const all = Array.from(by, function (e) { return { name: e[0], values: e[1], total: total(e[1]) }; })
      .sort(function (a, b) { return b.total - a.total || a.name.localeCompare(b.name); });
    const series = all.slice(0, 5).map(function (s, i) { return Object.assign(s, { colour: COLOURS[i] }); });
    if (all.length > 5) {
      const rest = slots.map(function (_, i) { return all.slice(5).reduce(function (t, s) { return t + s.values[i]; }, 0); });
      series.push({ name: OTHER, values: rest, total: total(rest), colour: GREY });
    }
    return { slots: slots, series: series, unnamed: unnamed };
  }

  function niceTop(max, whole) {
    if (max <= 0) return { top: whole ? 4 : 1000, step: whole ? 1 : 250 };
    const rough = max / 4, base = Math.pow(10, Math.floor(Math.log10(rough)));
    let step = [1, 2, 2.5, 5, 10].map(function (m) { return m * base; }).find(function (s) { return s >= rough; });
    if (whole) step = Math.max(1, Math.ceil(step));
    return { top: step * Math.ceil(max / step), step: step };
  }

  /* ---------- smooth monotone curve (never dips below the data) ---------- */
  function curve(points) {
    const n = points.length;
    if (!n) return "";
    if (n === 1) return "M" + points[0][0] + " " + points[0][1];
    const dx = [], m = [], t = [];
    for (let i = 0; i < n - 1; i++) { dx.push(points[i + 1][0] - points[i][0]); m.push((points[i + 1][1] - points[i][1]) / dx[i]); }
    t.push(m[0]);
    for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
    t.push(m[n - 2]);
    for (let i = 0; i < n - 1; i++) {
      if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
      const a = t[i] / m[i], b = t[i + 1] / m[i], h = a * a + b * b;
      if (h > 9) { const k = 3 / Math.sqrt(h); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
    }
    let d = "M" + points[0][0].toFixed(1) + " " + points[0][1].toFixed(1);
    for (let i = 0; i < n - 1; i++) {
      const c = dx[i] / 3;
      d += " C" + (points[i][0] + c).toFixed(1) + " " + (points[i][1] + t[i] * c).toFixed(1) + " " +
        (points[i + 1][0] - c).toFixed(1) + " " + (points[i + 1][1] - t[i + 1] * c).toFixed(1) + " " +
        points[i + 1][0].toFixed(1) + " " + points[i + 1][1].toFixed(1);
    }
    return d;
  }
  // A line sampled at n places, so two ranges with different bucket counts can be blended.
  function sample(values, n) {
    return Array.from({ length: n }, function (_, i) {
      const x = values.length > 1 ? i / (n - 1) * (values.length - 1) : 0, k = Math.floor(x), f = x - k;
      return values[k] * (1 - f) + (values[Math.min(k + 1, values.length - 1)] || 0) * f;
    });
  }

  /* ---------- card ---------- */
  function render(data, state) {
    const card = el("article", "card cc-card");
    card.dataset.card = "channel-contribution";
    const header = el("header", "cc-header");
    const titleRow = el("div", "cc-title");
    const menu = el("button", "cc-menu", "···");
    menu.type = "button";
    menu.setAttribute("aria-label", "Chart options");
    menu.setAttribute("aria-expanded", "false");
    const pop = el("div", "cc-pop");
    pop.hidden = true;
    const showAll = el("button", "", "Show all channels");
    showAll.type = "button";
    pop.appendChild(showAll);
    titleRow.append(el("h2", "card-title", "Channel Contribution"), menu, pop);

    function pills(options, current, label, onPick) {
      const box = el("div", "cc-pills");
      box.setAttribute("role", "group");
      box.setAttribute("aria-label", label);
      box.style.setProperty("--n", options.length);
      box.appendChild(el("i", "cc-slide"));
      options.forEach(function (o) {
        const b = el("button", "", o[1]);
        b.type = "button";
        b.dataset.value = o[0];
        box.appendChild(b);
      });
      const mark = function () {
        box.style.setProperty("--at", options.findIndex(function (o) { return o[0] === current(); }));
        box.querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.value === current())); });
      };
      box.addEventListener("click", function (e) {
        const b = e.target.closest("button");
        if (!b || b.dataset.value === current()) return;
        onPick(b.dataset.value);
        mark();
        update(true);
      });
      mark();
      return box;
    }

    const controls = el("div", "cc-controls");
    const hasRevenue = records(data, "revenue").some(function (r) { return r.source && r.value > 0; });
    if (!hasRevenue) view.metric = "leads";
    if (hasRevenue) controls.appendChild(pills([["leads", "Leads"], ["revenue", "Won Revenue"]], function () { return view.metric; }, "Metric", function (v) { view.metric = v; }));
    controls.appendChild(pills(RANGES, function () { return view.range; }, "Range", function (v) { view.range = v; }));
    header.append(titleRow, controls);

    const legend = el("div", "cc-legend");
    const caption = el("p", "cc-caption");
    const plot = el("div", "cc-plot");
    const note = el("p", "cc-note");
    const body = el("div", "card-body");
    body.append(legend, caption, plot, note);
    card.append(header, body);

    let current = null, drawn = null, lastWidth = 0, frame = 0, finish = 0, first = true;

    const money = function (v) { return window.App.formatINR(v); };
    const count = function (v) { return v >= 1000 ? (v / 1000).toFixed(v % 1000 ? 1 : 0) + "K" : String(v); };
    const format = function (v) { return view.metric === "revenue" ? money(v) : count(v); };
    const label = function (slot) {
      return view.range === "1Y" ? slot.from.toLocaleDateString("en-GB", { month: "short", year: "2-digit" })
        : slot.from.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    };

    // Draws (or redraws) the chart at the card's width. morph: blend from the lines now on screen.
    function paint(morph) {
      const width = plot.clientWidth;
      if (!width || !current) return;
      lastWidth = width;
      const height = width < 560 ? 220 : 300, left = 52, right = 12, top = 10, bottom = 28;
      const shown = current.series.filter(function (s) { return !view.hidden.has(s.name); });
      const scale = niceTop(Math.max.apply(null, [0].concat(shown.map(function (s) { return Math.max.apply(null, s.values); }))), view.metric === "leads");
      const slots = current.slots;
      const x = function (i) { return left + (slots.length > 1 ? i / (slots.length - 1) : .5) * (width - left - right); };
      const y = function (v) { return top + (1 - v / scale.top) * (height - top - bottom); };

      const chart = svg("svg", { width: width, height: height, class: "cc-svg", role: "img",
        "aria-label": caption.textContent + ": " + current.series.map(function (s) { return s.name + " " + format(s.total); }).join(", ") });
      for (let v = 0; v <= scale.top + 1e-9; v += scale.step) {
        chart.appendChild(svg("line", { class: "cc-grid", x1: left, x2: width - right, y1: y(v), y2: y(v) }));
        const t = svg("text", { class: "cc-axis", x: left - 8, y: y(v) + 4, "text-anchor": "end" });
        t.textContent = format(Math.round(v));
        chart.appendChild(t);
      }
      const every = Math.max(1, Math.ceil(slots.length / Math.max(2, Math.floor((width - left) / 74))));
      slots.forEach(function (s, i) {
        if ((slots.length - 1 - i) % every) return;
        const t = svg("text", { class: "cc-axis", x: x(i), y: height - 8, "text-anchor": i === slots.length - 1 ? "end" : "middle" });
        t.textContent = label(s);
        chart.appendChild(t);
      });
      const guide = svg("line", { class: "cc-guide", y1: top, y2: height - bottom, x1: 0, x2: 0 });
      chart.appendChild(guide);

      const lines = [];
      current.series.forEach(function (s, k) {
        const points = s.values.map(function (v, i) { return [x(i), y(v)]; });
        const path = svg("path", { class: "cc-line" + (s.name === OTHER ? " is-other" : ""), d: curve(points), stroke: s.colour, pathLength: 1, "data-name": s.name });
        if (view.hidden.has(s.name)) path.classList.add("is-hidden");
        if (first && !quiet()) { path.classList.add("is-drawing"); path.style.animationDelay = (k * 90) + "ms"; }
        chart.appendChild(path);
        lines.push({ path: path, series: s, points: points });
      });
      const dots = lines.map(function (l) {
        const c = svg("circle", { class: "cc-dot", r: 4.5, stroke: l.series.colour, cx: 0, cy: 0 });
        chart.appendChild(c);
        return c;
      });

      const tip = el("div", "cc-tip");
      const hover = function (event) {
        const box = chart.getBoundingClientRect();
        const px = event.clientX - box.left;
        const i = Math.max(0, Math.min(slots.length - 1, Math.round((px - left) / (width - left - right) * (slots.length - 1))));
        guide.setAttribute("x1", x(i));
        guide.setAttribute("x2", x(i));
        const rows = [];
        lines.forEach(function (l, k) {
          const on = !view.hidden.has(l.series.name);
          dots[k].style.display = on ? "" : "none";
          dots[k].setAttribute("cx", x(i));
          dots[k].setAttribute("cy", y(l.series.values[i]));
          if (on) rows.push(l.series);
        });
        rows.sort(function (a, b) { return b.values[i] - a.values[i]; });
        const slot = slots[i], last = new Date(slot.to - 1);
        tip.replaceChildren(el("b", "", view.range === "1M" ? label(slot) : view.range === "1Y" ? label(slot) : label(slot) + " – " + label({ from: last })));
        rows.forEach(function (s) {
          const row = el("div");
          const dot = el("i");
          dot.style.background = s.colour;
          row.append(dot, el("span", "", s.name), el("strong", "", format(s.values[i])));
          tip.appendChild(row);
        });
        tip.style.left = (x(i) + 14 + 190 > width ? x(i) - 14 - 190 : x(i) + 14) + "px";
        plot.classList.add("is-hover");
      };
      chart.addEventListener("mousemove", hover);
      chart.addEventListener("mouseleave", function () { plot.classList.remove("is-hover"); });

      const before = drawn;
      plot.replaceChildren(chart, tip);
      drawn = { lines: lines.map(function (l) { return { name: l.series.name, ys: l.points.map(function (p) { return p[1]; }) }; }) };
      first = false;

      // Blend from the previous shape to the new one over 300ms
      cancelAnimationFrame(frame);
      clearTimeout(finish);
      if (!morph || !before || quiet()) return;
      const N = 48, base = y(0);
      const moves = lines.map(function (l) {
        const old = before.lines.find(function (o) { return o.name === l.series.name; });
        return { path: l.path, d: l.path.getAttribute("d"), from: old ? sample(old.ys, N) : sample([base, base], N), to: sample(l.points.map(function (p) { return p[1]; }), N) };
      });
      const set = function (t) {
        moves.forEach(function (m) {
          if (t >= 1) { m.path.setAttribute("d", m.d); return; }
          m.path.setAttribute("d", curve(m.from.map(function (v, i) { return [left + i / (N - 1) * (width - left - right), v + (m.to[i] - v) * t]; })));
        });
      };
      const start = performance.now();
      const step = function (now) {
        const t = Math.max(0, Math.min(1, (now - start) / 300));
        set(1 - Math.pow(1 - t, 3));
        if (t < 1) frame = requestAnimationFrame(step);
      };
      set(0);
      frame = requestAnimationFrame(step);
      finish = setTimeout(function () { cancelAnimationFrame(frame); set(1); }, 380); // the true shape, with or without animation
    }

    function drawLegend() {
      legend.replaceChildren.apply(legend, current.series.map(function (s) {
        const chip = el("button", "cc-chip");
        chip.type = "button";
        chip.setAttribute("aria-pressed", String(!view.hidden.has(s.name)));
        const ring = el("i");
        ring.style.borderColor = s.colour;
        chip.append(ring, document.createTextNode(s.name));
        chip.addEventListener("click", function () {
          if (view.hidden.has(s.name)) view.hidden.delete(s.name);
          else view.hidden.add(s.name);
          chip.setAttribute("aria-pressed", String(!view.hidden.has(s.name)));
          paint(true); // only the view changes, never the numbers
        });
        return chip;
      }));
    }

    function update(morph) {
      current = build(data, view.range, view.metric);
      card.dataset.series = JSON.stringify(current.series.map(function (s) { return { name: s.name, total: s.total }; }));
      card.dataset.buckets = current.slots.length;
      caption.textContent = view.metric === "revenue" ? "Won revenue per channel, by closing date" : "Leads created per channel";
      note.textContent = current.unnamed ? (view.metric === "revenue" ? money(current.unnamed) + " of won revenue has no source, not drawn." : current.unnamed + (current.unnamed === 1 ? " lead has" : " leads have") + " no Lead Source, not drawn.") : "";
      drawLegend();
      const missing = data.unavailable || (view.metric === "leads" && !data.channelLeads);
      if (missing || !current.series.length) {
        const empty = el("div", "cc-empty");
        empty.append(el("b", "", missing ? "Data could not be loaded" : "No data in this range"),
          el("p", "", missing ? "Use refresh to try again." : "Choose a longer range to see the trend."));
        plot.replaceChildren(empty);
        drawn = null;
        return;
      }
      paint(morph);
    }

    menu.addEventListener("click", function () {
      pop.hidden = !pop.hidden;
      menu.setAttribute("aria-expanded", String(!pop.hidden));
    });
    showAll.addEventListener("click", function () {
      view.hidden.clear();
      pop.hidden = true;
      menu.setAttribute("aria-expanded", "false");
      drawLegend();
      paint(true);
    });

    update(false);
    // The card is placed after this returns, so the chart is drawn once its width is known, and on resize
    setTimeout(function () { if (current.series.length) paint(false); }, 0);
    if (window.ResizeObserver) new ResizeObserver(function () { if (plot.clientWidth && Math.abs(plot.clientWidth - lastWidth) > 4 && current.series.length) paint(false); }).observe(plot);
    return card;
  }

  return { render: render, build: build };
})();
