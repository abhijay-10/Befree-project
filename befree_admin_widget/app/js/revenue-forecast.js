/*
 * Revenue Forecast section (Admin Overview). Read-only: draws the figures from RevenueForecastCalc over the deals the
 * Overview already loaded (data.deals, already limited to the header country). The look-back and look-ahead window
 * follows the header date range (7, 30, 90 days or 12 months; All time uses 30 days).
 */
window.RevenueForecastSection = (function () {
  "use strict";

  const DAYS = { "7d": 7, "30d": 30, "90d": 90, "12m": 365, all: 30 };
  const ICONS = {
    trend: '<path d="m4 16 6-6 4 4 6-7M15 7h5v5"/>',
    won: '<path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4"/>',
    pipe: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
    line: '<path d="M3 17l5-5 4 3 8-8"/><path d="M15 7h5v5"/>',
    best: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>'
  };
  const el = function (tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const tile = function (name, cls) {
    const t = el("span", cls);
    t.setAttribute("aria-hidden", "true");
    t.innerHTML = '<svg viewBox="0 0 24 24">' + ICONS[name] + "</svg>";
    return t;
  };
  const quiet = function () { return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; };
  const money = function (v) { return window.App.formatINR(v); };
  const exact = function (v) { return window.App.formatINRFull(v); };
  const monthName = function (d) { return d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }); };
  const span = function (days) { return days === 365 ? "12 months" : days + " days"; };

  // Display only: counts up to the text that is already in the node, then puts that exact text back
  function countUp(node) {
    const final = node.textContent, m = /^(\D*?)(\d[\d,]*(?:\.\d+)?)(.*)$/.exec(final);
    if (quiet() || !m || !parseFloat(m[2].replace(/,/g, ""))) return;
    const target = parseFloat(m[2].replace(/,/g, "")), decimals = (m[2].split(".")[1] || "").length, grouped = m[2].indexOf(",") !== -1;
    const start = performance.now();
    let done = false;
    const step = function (now) {
      if (done || !node.isConnected) return;
      const t = Math.min(1, (now - start) / 800), v = target * (1 - Math.pow(1 - t, 3));
      node.textContent = t < 1 ? m[1] + (grouped ? v.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : v.toFixed(decimals)) + m[3] : final;
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    setTimeout(function () { done = true; node.textContent = final; }, 950); // the true value, with or without animation
  }

  function stat(key, icon, label, value, sub, check) {
    const box = el("div", "rf-stat rf-" + key);
    const top = el("div", "rf-stat-top");
    top.append(tile(icon, "rf-stat-icon"), el("span", "rf-stat-label", label));
    const v = el("strong", "rf-value", value);
    if (check !== undefined) box.dataset.value = check;
    box.append(top, v, el("small", "rf-sub", sub));
    return box;
  }

  function chart(c) {
    const cols = c.past.map(function (m) { return { kind: "won", from: m.from, value: m.amount, count: m.count }; })
      .concat(c.future.map(function (m) { return { kind: "forecast", from: m.from, value: m.amount, best: m.best, count: m.count }; }));
    const trend = c.trend.ok ? c.trend.line : null; // 7 points: the 6 past months and this month
    const max = Math.max.apply(null, [1].concat(cols.map(function (x) { return x.value; }), trend || []));
    const box = el("div", "rf-chart");
    box.setAttribute("role", "img");
    box.setAttribute("aria-label", cols.map(function (x) { return monthName(x.from) + " " + (x.kind === "won" ? "won " : "forecast ") + money(x.value); }).join(", ") +
      (trend ? ", trend prediction " + money(c.trend.predicted) : ""));
    // Y axis: 0, half and the top value
    const axis = el("div", "rf-axis");
    [max, max / 2, 0].forEach(function (v) { axis.appendChild(el("span", "", money(v))); });
    const plot = el("div", "rf-plot");
    const tip = el("div", "rf-tip");
    tip.hidden = true;
    cols.forEach(function (x, i) {
      const col = el("div", "rf-col is-" + x.kind + (i === c.past.length ? " is-first-future" : ""));
      col.style.setProperty("--i", i);
      const bars = el("div", "rf-bars");
      const bar = el("div", "rf-bar");
      bar.style.height = (x.value / max * 100) + "%";
      if (!x.value) bar.classList.add("is-zero");
      bars.appendChild(bar);
      if (trend && i < trend.length) {
        const dot = el("i", "rf-dot" + (i === trend.length - 1 ? " is-predicted" : ""));
        dot.style.bottom = (trend[i] / max * 100) + "%";
        bars.appendChild(dot);
      }
      col.append(el("span", "rf-col-value", x.value ? money(x.value) : ""), bars, el("span", "rf-col-label", monthName(x.from)));
      col.addEventListener("mouseenter", function () {
        tip.replaceChildren(el("b", "", monthName(x.from) + (x.kind === "forecast" ? " · forecast" : "")));
        tip.appendChild(el("div", "", x.kind === "won" ? "Won " + exact(x.value) + " (" + x.count + (x.count === 1 ? " deal" : " deals") + ")"
          : "Forecast " + exact(x.value) + " · best case " + exact(x.best) + " (" + x.count + (x.count === 1 ? " deal" : " deals") + ")"));
        if (trend && i < trend.length) tip.appendChild(el("div", "rf-tip-trend", (i === trend.length - 1 ? "Trend prediction " : "Trend ") + exact(trend[i])));
        tip.style.left = Math.min(col.offsetLeft + col.offsetWidth / 2, plot.offsetWidth - 120) + "px";
        tip.hidden = false;
      });
      col.addEventListener("mouseleave", function () { tip.hidden = true; });
      plot.appendChild(col);
    });
    if (trend) { // dashed orange line through the dots (same box as the bars)
      const n = cols.length, NS = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(NS, "svg");
      svg.setAttribute("class", "rf-line");
      svg.setAttribute("viewBox", "0 0 100 100");
      svg.setAttribute("preserveAspectRatio", "none");
      svg.setAttribute("aria-hidden", "true");
      const line = document.createElementNS(NS, "polyline");
      line.setAttribute("points", trend.map(function (v, i) { return ((i + .5) / n * 100) + "," + (100 - v / max * 100); }).join(" "));
      svg.appendChild(line);
      plot.appendChild(svg);
    }
    plot.appendChild(tip);
    const marker = el("span", "rf-future-tag", "Forecast");
    marker.style.left = (c.past.length / cols.length * 100) + "%";
    plot.appendChild(marker);
    box.append(axis, plot);
    return box;
  }

  function legend(hasTrend) {
    const box = el("div", "rf-legend");
    [["won", "Won revenue"], ["forecast", "Pipeline forecast"]].concat(hasTrend ? [["trend", "Trend"]] : []).forEach(function (x) {
      const item = el("span", "rf-key is-" + x[0]);
      item.append(el("i"), x[1]);
      box.appendChild(item);
    });
    return box;
  }

  function render(data, state) {
    const C = window.RevenueForecastCalc, days = DAYS[state.range] || 30;
    const card = el("article", "card rf-card");
    card.dataset.card = "revenue-forecast-section";
    const header = el("header", "card-header rf-header");
    const title = el("h2", "card-title");
    title.append(tile("trend", "v2-icon"), "Revenue Forecast");
    header.append(title, el("p", "card-subtitle", "Next " + span(days) + " from open deals, by Closing Date · " + countryLabel(state)));
    const body = el("div", "card-body");
    card.append(header, body);

    if (data.unavailable || !data.deals) {
      body.appendChild(empty("Deals could not be loaded", "Use refresh to try again."));
      return card;
    }
    const wonNow = C.wonRevenue(data.deals, days), forecast = C.pipelineForecast(data.deals, days), best = C.bestCase(data.deals, days);
    const c = C.chartData(data.deals), t = c.trend, left = C.leftOut(data.deals);
    card.dataset.won = wonNow.amount; card.dataset.forecast = forecast.amount; card.dataset.best = best.amount;
    card.dataset.trend = t.ok ? t.predicted : "";
    if (!c.past.some(function (m) { return m.amount; }) && !c.future.some(function (m) { return m.best; }) && !wonNow.count && !best.count) {
      body.appendChild(empty("No won or open deals yet", "The forecast appears once deals are won or have a closing date ahead."));
      return card;
    }
    const thisMonth = c.future[0].from;
    const stats = el("div", "rf-stats");
    stats.append(
      stat("won", "won", "Won revenue · last " + span(days), money(wonNow.amount), wonNow.count + (wonNow.count === 1 ? " deal won" : " deals won")),
      stat("forecast", "pipe", "Pipeline forecast", money(forecast.amount), "Open deals closing in the next " + span(days) + " · amount × stage %"),
      stat("trend", "line", "Trend prediction", t.ok ? money(t.predicted) : "Not enough history",
        t.ok ? "Historical trend estimate for " + monthName(thisMonth) + ", not guaranteed" : "Needs won revenue in at least 3 of the last 6 completed months"),
      stat("best", "best", "Best case", money(best.amount), best.count + (best.count === 1 ? " eligible open deal" : " eligible open deals") + ", at full amount")
    );
    body.append(stats, chart(c), legend(t.ok));
    const notes = [];
    if (left.overdue) notes.push(left.overdue + (left.overdue === 1 ? " open deal is" : " open deals are") + " past the Closing Date and not in the forecast.");
    if (left.noDate) notes.push(left.noDate + (left.noDate === 1 ? " open deal has" : " open deals have") + " no Closing Date and is not in the forecast.");
    notes.forEach(function (n) { body.appendChild(el("p", "rf-note", n)); });
    card.querySelectorAll(".rf-value").forEach(countUp);
    return card;
  }

  function empty(title, text) {
    const box = el("div", "rf-empty");
    box.append(el("b", "", title), el("p", "", text));
    return box;
  }

  return { render: render };
})();
