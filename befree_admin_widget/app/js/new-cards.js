/*
 * Forecast vs target, At-risk deals, Stage conversion, Lead response and Channel trend.
 * Each function takes (data, state) from the shared data layer and returns a card.
 * Cards with a Chart.js chart expose card.draw(), called once the card is in the document.
 */
window.Cards = (function () {
  "use strict";

  const el = App.el;
  const BLUES = ["#2352E5", "#4069E8", "#5D80EB", "#7996EF", "#96ADF2", "#B3C3F5"];
  const CHANNEL_COLORS = ["#2352E5", "#5B7FE8", "#93A9F0", "#16A06B", "#E8890C", "#D64545", "#8D9FC9", "#7C5CE0", "#C4C9D4"];
  const RISK_ROWS = 5;

  // Card choices survive re-renders.
  const ui = {
    threshold: 14, riskAll: false, responseBy: "owner",
    trendKind: "sourced", trendStyle: "stacked", hidden: new Set()
  };
  const charts = {};

  /* ---------- Shared pieces ---------- */

  function button(className, text) {
    const b = el("button", className, text);
    b.type = "button";
    return b;
  }

  function svgIcon(path) { // constant markup only
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "icon");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = path;
    return svg;
  }

  function info(text) {
    const i = el("span", "nc-info", "ⓘ");
    i.title = text;
    i.tabIndex = 0;
    i.setAttribute("role", "img");
    i.setAttribute("aria-label", text);
    return i;
  }

  // Returns { card, body, actions, titleRow }.
  function shell(id, title, subtitle, help) {
    const card = el("article", "card nc");
    card.dataset.card = id;
    const header = el("header", "card-header ov-card-header");
    const heading = el("div");
    const titleRow = el("div", "nc-title");
    titleRow.append(el("h2", "card-title", title), info(help));
    heading.append(titleRow, el("p", "card-subtitle", subtitle));
    const actions = el("div", "nc-actions");
    header.append(heading, actions);
    const body = el("div", "card-body");
    card.append(header, body);
    return { card: card, body: body, actions: actions, titleRow: titleRow };
  }

  function emptyState(state) {
    return el("p", "nc-empty", "No data for " + countryLabel(state) + " in this period");
  }

  function toggle(options, current, onPick) {
    const box = el("div", "ov-toggle");
    options.forEach(function (o) {
      const b = button("", o[1]);
      b.setAttribute("aria-pressed", String(o[0] === current));
      b.addEventListener("click", function () {
        Array.from(box.children).forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
        onPick(o[0]);
      });
      box.appendChild(b);
    });
    return box;
  }

  function csvCell(v) {
    let s = v === null || v === undefined ? "" : String(v);
    // Stop spreadsheet apps reading CRM text as a formula.
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function exportButton(filename, getRows) {
    const b = button("btn-icon nc-export");
    b.title = "Export CSV";
    b.setAttribute("aria-label", "Export CSV");
    b.appendChild(svgIcon('<path d="M12 4v11m-5-5 5 5 5-5M5 20h14"/>'));
    b.addEventListener("click", function () {
      const text = "﻿" + getRows().map(function (r) { return r.map(csvCell).join(","); }).join("\r\n");
      const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
      const a = el("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    });
    return b;
  }

  function fileName(name, state) { return name + "-" + state.country + "-" + state.range + ".csv"; }

  function stack(parts, total) {
    const bar = el("div", "nc-stack");
    parts.forEach(function (p) {
      const piece = el("div");
      piece.style.width = (total ? p.value / total * 100 : 0) + "%";
      piece.style.background = p.color;
      piece.title = p.label + ": " + App.formatINR(p.value);
      bar.appendChild(piece);
    });
    return bar;
  }

  function makeChart(key, canvas, config) {
    if (charts[key]) charts[key].destroy();
    charts[key] = new Chart(canvas, config);
    return charts[key];
  }

  function chartBox(className, label) {
    const box = el("div", className);
    const canvas = el("canvas");
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", label);
    box.appendChild(canvas);
    return { box: box, canvas: canvas };
  }

  const noChart = function () { return el("p", "nc-empty", "The chart library could not be loaded."); };

  /* ---------- 1. Forecast vs target ---------- */

  const attainColor = function (pct) { return pct >= 90 ? "var(--green)" : pct >= 60 ? "var(--orange)" : "var(--red)"; };

  function gauge(pct, color, targetText) {
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "nc-gauge");
    svg.setAttribute("viewBox", "0 0 200 112");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Attainment " + App.formatPct(pct) + " of " + targetText);
    const arc = function (stroke, share) {
      const p = document.createElementNS(NS, "path");
      p.setAttribute("d", "M 20 100 A 80 80 0 0 1 180 100");
      p.setAttribute("pathLength", "100");
      p.style.fill = "none";
      p.style.stroke = stroke;
      p.style.strokeWidth = "18";
      p.style.strokeLinecap = "round";
      p.style.strokeDasharray = Math.max(0.01, Math.min(100, share)) + " 200";
      svg.appendChild(p);
    };
    arc("#EEF1F6", 100);
    if (pct > 0) arc(color, pct);
    [[App.formatPct(pct), 82, "nc-gauge-pct"], ["of " + targetText + " target", 102, "nc-gauge-sub"]].forEach(function (t) {
      const text = document.createElementNS(NS, "text");
      text.setAttribute("x", "100");
      text.setAttribute("y", t[1]);
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("class", t[2]);
      text.textContent = t[0];
      svg.appendChild(text);
    });
    return svg;
  }

  function forecast(data, state) {
    const f = data.forecastVsTarget;
    const s = shell("forecast", "Forecast vs target", "Quarter to date · " + countryLabel(state),
      "Attainment = confirmed (Closed-won) amount with a closing date this quarter ÷ target. Open deals are not added.");
    if (!f.target) {
      s.body.appendChild(f.target === null ? el("p", "nc-empty", "Could not load sales targets") : emptyState(state));
      return s.card;
    }
    const parts = [
      { label: "Confirmed", value: f.closedWon, color: "var(--green)" },
      { label: "Gap to target", value: f.gap, color: "#EEF1F6" }
    ];
    const scale = Math.max(f.target, f.closedWon);

    const legend = el("div", "nc-legend");
    parts.forEach(function (p, i) {
      const item = el("span", "rp-legend-item");
      const dot = el("span", "rp-dot");
      dot.style.background = i === 1 ? "#DDE1E9" : p.color;
      const value = el("strong", "", App.formatINR(p.value));
      item.append(dot, p.label + " ", value);
      legend.appendChild(item);
    });

    s.body.append(
      gauge(f.pct, attainColor(f.pct), App.formatINR(f.target)),
      stack(parts, scale),
      legend,
      el("p", "nc-gap", f.gap > 0 ? "Gap: " + App.formatINR(f.gap) + " to reach target" : "Target reached")
    );

    if (state.country === "ALL") {
      const list = el("div", "nc-countries");
      f.byCountry.filter(function (c) { return Data.CODES.indexOf(c.country) !== -1; }).forEach(function (c) {
        const other = Data.CODES.indexOf(c.country) === -1; // "Country not set" has no filter of its own
        const row = button("nc-country");
        row.title = other ? "Deals with no US, UK or AU country" : "Show " + c.country + " only";
        const pct = el("strong", "", App.formatPct(c.pct));
        pct.style.color = attainColor(c.pct);
        row.append(el("span", "", other ? "Not set" : c.country), stack([
          { label: "Confirmed", value: c.closedWon, color: "var(--green)" }
        ], Math.max(c.target || 0, c.closedWon)), pct);
        if (other) row.disabled = true;
        else row.addEventListener("click", function () { Store.setCountry(c.country); });
        list.appendChild(row);
      });
      s.body.appendChild(list);
    }
    return s.card;
  }

  /* ---------- 2. At-risk deals ---------- */

  const RISK_COLUMNS = ["Deal", "Account", "Owner", "Value", "Stage", "Risk reason", "Days idle", "Close date"];

  function openDeal(id) {
    if (id && App.isEmbedded) ZOHO.CRM.UI.Record.open({ Entity: "Deals", RecordID: id }); // no record to open outside CRM
  }

  function atRisk(data, state) {
    const s = shell("at-risk", "At-risk deals", "Unconfirmed deals needing attention · " + countryLabel(state),
      "Unconfirmed deals only (open, 10% to 90%). At risk if any is true: no logged activity for more than the selected days; " +
      "close date passed while open; same stage for more than 30 days. Each deal is listed once, with its most severe reason " +
      "first (Overdue, then Stuck, then No activity). % of unconfirmed amount = at-risk amount ÷ all unconfirmed amount. Dates are your local dates.");
    const badge = el("span", "pill pill-red");
    s.titleRow.appendChild(badge);

    const select = el("select");
    select.setAttribute("aria-label", "Inactivity threshold");
    [7, 14, 30].forEach(function (d) {
      const option = el("option", "", "No activity > " + d + " days");
      option.value = d;
      select.appendChild(option);
    });
    select.value = ui.threshold;
    const wrap = el("div", "select");
    const chevron = svgIcon('<path d="m6 9 6 6 6-6"/>');
    chevron.classList.add("select-chevron");
    wrap.append(select, chevron);

    let result;
    s.actions.append(wrap, exportButton(fileName("at-risk-deals", state), function () {
      return [["Deal", "Account", "Owner", "Value (INR)", "Stage", "Risk reason", "Days idle", "Close date"]].concat(
        result.rows.map(function (r) {
          const d = r.deal;
          return [d.name, d.account, d.owner, d.amount, d.stage, r.label, r.idle, d.close];
        }));
    }));

    const strip = el("div", "nc-stats");
    const stats = ["Deals at risk", "Value at risk", "% of unconfirmed amount"].map(function (label) {
      const box = el("div", "nc-stat");
      const value = el("strong");
      box.append(el("span", "", label), value);
      strip.appendChild(box);
      return value;
    });

    const scroller = el("div", "ov-table-wrap");
    const table = el("table", "ov-table nc-table");
    const head = el("tr");
    RISK_COLUMNS.forEach(function (c) {
      const th = el("th", "", c);
      th.scope = "col";
      head.appendChild(th);
    });
    const thead = el("thead");
    thead.appendChild(head);
    const tbody = el("tbody");
    table.append(thead, tbody);
    scroller.appendChild(table);
    const viewAll = button("btn-outline nc-viewall");
    const note = el("p", "nc-summary");

    function draw() {
      result = Data.atRisk(data.deals, ui.threshold, data.asOf);
      s.card.dataset.riskCount = result.count;
      s.card.dataset.riskValue = result.value;
      badge.textContent = result.count + " at risk";
      stats[0].textContent = App.formatCount(result.count);
      stats[1].textContent = App.formatINR(result.value);
      stats[2].textContent = App.formatPct(result.pct);

      const shown = ui.riskAll ? result.rows : result.rows.slice(0, RISK_ROWS);
      tbody.replaceChildren.apply(tbody, shown.map(function (r) {
        const d = r.deal;
        const tr = el("tr");
        tr.tabIndex = 0;
        tr.addEventListener("click", function () { openDeal(d.id); });
        tr.addEventListener("keydown", function (e) { if (e.key === "Enter") openDeal(d.id); });
        const reason = App.pill(r.label, r.type);
        reason.title = r.detail;
        [el("span", "ov-deal-name", d.name), d.account || "—", d.owner || "—", App.formatINRFull(d.amount),
         App.pill(d.stage, "blue"), reason, r.idle === null ? "—" : String(r.idle), d.close || "—"].forEach(function (content) {
          const td = el("td");
          td.append(content);
          tr.appendChild(td);
        });
        return tr;
      }));
      if (!shown.length) {
        const td = el("td", "ov-empty", result.openCount ? "No deals are at risk under these rules."
          : "No data for " + countryLabel(state) + " in this period");
        td.colSpan = RISK_COLUMNS.length;
        const tr = el("tr");
        tr.appendChild(td);
        tbody.appendChild(tr);
      }
      viewAll.textContent = ui.riskAll ? "Show less" : "View all";
      viewAll.hidden = result.count <= RISK_ROWS;
      note.textContent = result.openCount && !result.stageDatesKnown
        ? "The \"stuck in stage\" rule could not be checked: CRM gave no stage date for these deals." : "";
      if (s.card.isConnected) Checks.atRisk(data);
    }

    select.addEventListener("change", function () { ui.threshold = Number(select.value); draw(); });
    viewAll.addEventListener("click", function () { ui.riskAll = !ui.riskAll; draw(); });
    s.body.append(strip, scroller, viewAll, note);
    draw();
    return s.card;
  }

  /* ---------- 3. Stage-to-stage conversion ---------- */

  const days = function (v) { return v === null ? "—" : Math.round(v) + " d"; };
  const conversionClass = function (v) { return v >= 60 ? "is-good" : v >= 30 ? "is-mid" : "is-bad"; };

  function stages(data, state) {
    const c = data.stageConversion;
    const s = shell("stages", "Stage-to-stage conversion", "Where deals drop off · " + countryLabel(state),
      "Conversion % = deals reaching a stage ÷ deals reaching the stage before it. " +
      "Avg days in stage is weighted by deal count across countries.");
    s.actions.appendChild(exportButton(fileName("stage-conversion", state), function () {
      return [["Stage", "Deals", "Conversion from previous %", "Average days in stage"]].concat(c.steps.map(function (x) {
        return [x.stage, x.count, x.conversion === null ? null : x.conversion.toFixed(1), x.avgDays === null ? null : x.avgDays.toFixed(1)];
      }));
    }));
    if (!c.steps[0].count) {
      s.body.appendChild(emptyState(state));
      return s.card;
    }
    const max = Math.max.apply(null, c.steps.map(function (x) { return x.count; }).concat(1));
    const row = el("div", "nc-flow");
    c.steps.forEach(function (x, i) {
      if (i) {
        const link = el("div", "nc-link");
        const value = el("span", "nc-conv " + (x.conversion === null ? "" : conversionClass(x.conversion)),
          x.conversion === null ? "—" : App.formatPct(x.conversion, 0));
        link.append(value, el("span", "nc-arrow", "→"));
        if (x.stage === c.biggestDrop) link.appendChild(el("span", "nc-drop", "Biggest drop"));
        row.appendChild(link);
      }
      const col = el("div", "nc-stage");
      const track = el("div", "nc-stage-track");
      const count = el("strong", "", String(x.count));
      count.dataset.check = "stage-count";
      const bar = el("div", "nc-stage-bar");
      bar.style.height = (x.count / max * 100) + "%";
      bar.style.background = BLUES[Math.min(i, BLUES.length - 1)];
      track.appendChild(bar);
      col.append(el("span", "nc-stage-name", x.stage), count, track, el("span", "nc-stage-days", "Avg " + days(x.avgDays)));
      row.appendChild(col);
    });
    const summary = el("p", "nc-summary");
    summary.textContent = "Overall conversion Qualified → Closed-won: " + App.formatPct(c.overall) +
      (c.slowest ? " · Slowest stage: " + c.slowest.stage + " (" + Math.round(c.slowest.avgDays) + " days)" : "");
    s.body.append(row, summary);
    return s.card;
  }

  /* ---------- 4. Lead response time ---------- */

  function formatDuration(mins) {
    if (mins === null || mins === undefined) return "—";
    const m = Math.round(mins);
    if (m < 60) return m + " min";
    if (m < 1440) return Math.floor(m / 60) + " h" + (m % 60 ? " " + (m % 60) + " min" : "");
    const h = Math.round((m % 1440) / 60);
    return Math.floor(m / 1440) + " d" + (h ? " " + h + " h" : "");
  }

  // Dashed vertical or horizontal line at the SLA.
  function slaLine(value, axis) {
    return {
      id: "slaLine",
      afterDatasetsDraw: function (chart) {
        const area = chart.chartArea, ctx = chart.ctx;
        const at = chart.scales[axis].getPixelForValue(value);
        ctx.save();
        ctx.strokeStyle = "#D64545";
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        if (axis === "x") { ctx.moveTo(at, area.top); ctx.lineTo(at, area.bottom); }
        else { ctx.moveTo(area.left, at); ctx.lineTo(area.right, at); }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "#6B7280";
        ctx.font = "11px Inter, system-ui";
        if (axis === "x") ctx.fillText("SLA " + value + " min", at + 4, area.top + 10);
        else {
          ctx.textAlign = "right";
          ctx.fillText("SLA " + value + " min", area.right - 4, at - 6);
        }
        ctx.restore();
      }
    };
  }

  function response(data, state) {
    const r = data.response;
    const s = shell("response", "Lead response time", "Time to first contact · " + countryLabel(state),
      "Response time = first call, email or task time minus lead created time. Median of all responded leads; " +
      "% within SLA = responded within " + r.sla + " min ÷ responded leads.");
    s.actions.appendChild(exportButton(fileName("lead-response", state), function () {
      return [["Owner", "Source", "Response minutes"]].concat(r.rows.map(function (l) {
        return [l.owner, l.source, l.responseMinutes === null ? "Awaiting" : Math.round(l.responseMinutes)];
      }));
    }));
    s.card.draw = function () {};
    if (!r.leadCount) {
      s.body.appendChild(emptyState(state));
      return s.card;
    }

    const strip = el("div", "nc-stats nc-stats-4");
    [
      ["Median response time", formatDuration(r.median)],
      ["Responded within SLA", App.formatPct(r.withinSla, 0)],
      ["Awaiting first response", App.formatCount(r.awaiting), r.awaiting > 0],
      ["Slowest owner", r.slowest ? r.slowest.label + " · " + formatDuration(r.slowest.median) : "—"]
    ].forEach(function (k) {
      const box = el("div", "nc-stat");
      box.append(el("span", "", k[0]), el("strong", k[2] ? "is-bad" : "", k[1]));
      strip.appendChild(box);
    });
    s.body.appendChild(strip);
    if (!window.Chart) {
      s.body.appendChild(noChart());
      return s.card;
    }

    const split = el("div", "nc-split");
    const left = el("div");
    const leftHead = el("div", "nc-subhead");
    const barsTitle = el("h3", "", "");
    leftHead.append(barsTitle, toggle([["owner", "By owner"], ["source", "By source"]], ui.responseBy,
      function (id) { ui.responseBy = id; drawBars(); }));
    const bars = chartBox("nc-chart", "Median response minutes");
    left.append(leftHead, bars.box);
    const right = el("div");
    const rightHead = el("div", "nc-subhead");
    rightHead.appendChild(el("h3", "", "Trend"));
    const line = chartBox("nc-chart", "Median response minutes by month: " +
      r.trend.map(function (t) { return t.label + " " + formatDuration(t.median); }).join(", "));
    right.append(rightHead, line.box);
    split.append(left, right);
    s.body.appendChild(split);

    function drawBars() {
      const list = ui.responseBy === "owner" ? r.byOwner : r.bySource;
      barsTitle.textContent = ui.responseBy === "owner" ? "By owner" : "By source";
      bars.canvas.setAttribute("aria-label", list.map(function (x) { return x.label + " " + formatDuration(x.median); }).join(", "));
      makeChart("responseBars", bars.canvas, {
        type: "bar",
        data: {
          labels: list.map(function (x) { return x.label; }),
          datasets: [{
            data: list.map(function (x) { return x.median; }),
            backgroundColor: list.map(function (x) { return x.median <= r.sla ? "#16A06B" : "#D64545"; }),
            borderRadius: 6,
            maxBarThickness: 14
          }]
        },
        options: {
          indexAxis: "y",
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { displayColors: false, callbacks: { label: function (i) { return "Median " + formatDuration(i.parsed.x); } } }
          },
          scales: {
            x: { min: 0, suggestedMax: r.sla * 1.3, grid: { display: false }, border: { display: false } },
            y: { grid: { display: false }, border: { display: false } }
          }
        },
        plugins: [slaLine(r.sla, "x")]
      });
    }

    s.card.draw = function () {
      drawBars();
      const values = r.trend.map(function (t) { return t.median; });
      makeChart("responseTrend", line.canvas, {
        type: "line",
        data: {
          labels: r.trend.map(function (t) { return t.label; }),
          datasets: [{
            data: values,
            borderColor: "#2352E5",
            borderWidth: 2,
            cubicInterpolationMode: "monotone",
            pointBackgroundColor: "#fff",
            pointBorderColor: "#2352E5",
            pointBorderWidth: 2,
            pointRadius: 4,
            fill: "start",
            backgroundColor: "rgba(35, 82, 229, .08)"
          }]
        },
        options: {
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: { displayColors: false, callbacks: { label: function (i) { return formatDuration(i.parsed.y); } } }
          },
          scales: {
            x: { grid: { display: false }, border: { display: false } },
            y: { min: 0, suggestedMax: Math.max.apply(null, values.concat(r.sla)) * 1.2,
                 ticks: { display: false, maxTicksLimit: 4 }, border: { display: false }, grid: { color: "#EEF1F6", drawTicks: false } }
          }
        },
        plugins: [slaLine(r.sla, "y")]
      });
    };
    return s.card;
  }

  /* ---------- 5. Channel trend ---------- */

  function trendInsight(t, kind) {
    const last = t.labels.length - 1;
    const series = t[kind];
    const total = series.reduce(function (n, row) { return n + row[last]; }, 0);
    if (!total) return "No " + kind + " revenue in " + t.labels[last] + ".";
    let top = 0;
    series.forEach(function (row, i) { if (row[last] > series[top][last]) top = i; });
    let text = t.channels[top] + " is the top " + kind + " channel (" + App.formatPct(series[top][last] / total * 100) +
      " of " + t.labels[last] + " revenue)";
    let best = null;
    series.forEach(function (row, i) {
      if (!row[last - 1]) return;
      const growth = (row[last] / row[last - 1] - 1) * 100;
      if (!best || growth > best.growth) best = { name: t.channels[i], growth: growth };
    });
    if (best) {
      text += " · " + best.name + (best.growth >= 0 ? " grew " : " fell ") + App.formatPct(Math.abs(best.growth), 0) +
        " vs " + t.labels[last - 1];
    }
    return text;
  }

  function channelTrend(data, state) {
    // "Other / not set" is not drawn
    const full = data.channelTrend;
    const keep = full.channels.map(function (name) { return name !== "Other / not set"; });
    const only = function (list) { return list.filter(function (_, i) { return keep[i]; }); };
    const t = { channels: only(full.channels), labels: full.labels, sourced: only(full.sourced), influenced: only(full.influenced) };
    const s = shell("trend", "Channel trend over time", "Monthly confirmed amount by channel, by closing date · " + countryLabel(state),
      "Confirmed (Closed-won) deals only. Channel share = the channel's value ÷ the total of all channels in that month. " +
      "Sourced: each deal counts once, under its source. Deals with no matching channel are not drawn. " +
      "Influenced: a deal counts under every channel its contact engaged with, so these are never added together.");
    s.card.draw = function () {};
    const empty = !t.sourced.concat(t.influenced).some(function (row) { return row.some(function (v) { return v > 0; }); });
    if (empty) {
      s.body.appendChild(emptyState(state));
      return s.card;
    }
    s.actions.append(
      toggle([["sourced", "Sourced"], ["influenced", "Influenced"]], ui.trendKind, function (id) { ui.trendKind = id; s.card.draw(); }),
      toggle([["stacked", "Stacked"], ["lines", "Lines"]], ui.trendStyle, function (id) { ui.trendStyle = id; s.card.draw(); })
    );

    // Latest month per channel, read by the reconciliation check.
    const latest = function () {
      s.card.dataset.latest = JSON.stringify([t.sourced, t.influenced].map(function (series) {
        return series.map(function (row) { return row[row.length - 1]; });
      }));
    };
    latest();

    const plot = chartBox("nc-trend", "Monthly revenue by channel");
    const legend = el("div", "nc-legend nc-legend-center");
    const insight = el("p", "nc-summary");
    t.channels.forEach(function (name, i) {
      const b = button("nc-key");
      const dot = el("span", "rp-dot");
      dot.style.background = CHANNEL_COLORS[i];
      b.append(dot, name);
      b.setAttribute("aria-pressed", String(!ui.hidden.has(name)));
      b.addEventListener("click", function () {
        if (ui.hidden.has(name)) ui.hidden.delete(name);
        else ui.hidden.add(name);
        b.setAttribute("aria-pressed", String(!ui.hidden.has(name)));
        s.card.draw();
      });
      legend.appendChild(b);
    });
    s.body.append(window.Chart ? plot.box : noChart(), legend, insight);

    s.card.draw = function () {
      insight.textContent = trendInsight(t, ui.trendKind);
      if (!window.Chart) return;
      const series = t[ui.trendKind];
      const stacked = ui.trendStyle === "stacked";
      const totals = t.labels.map(function (_, m) { return series.reduce(function (n, row) { return n + row[m]; }, 0); });
      makeChart("trend", plot.canvas, {
        type: stacked ? "bar" : "line",
        data: {
          labels: t.labels,
          datasets: t.channels.map(function (name, i) {
            return {
              label: name,
              data: series[i],
              hidden: ui.hidden.has(name),
              backgroundColor: stacked ? CHANNEL_COLORS[i] : "#fff",
              borderColor: CHANNEL_COLORS[i],
              borderWidth: stacked ? 0 : 2,
              cubicInterpolationMode: "monotone",
              pointBackgroundColor: "#fff",
              pointBorderColor: CHANNEL_COLORS[i],
              pointBorderWidth: 2,
              pointRadius: 3,
              maxBarThickness: 46
            };
          })
        },
        options: {
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: function (item) {
                  const share = totals[item.dataIndex] ? item.raw / totals[item.dataIndex] * 100 : 0;
                  return item.dataset.label + " · " + App.formatINR(item.raw) + " · " + App.formatPct(share);
                }
              }
            }
          },
          scales: {
            x: { stacked: stacked, grid: { display: false }, border: { display: false } },
            y: { stacked: stacked, beginAtZero: true, border: { display: false }, grid: { color: "#EEF1F6", drawTicks: false },
                 ticks: { maxTicksLimit: 5, callback: function (v) { return App.formatINR(v); } } }
          }
        }
      });
    };
    return s.card;
  }

  // Placeholders for a tab that has nothing rendered yet.
  const BY_TAB = { overview: 2, reports: 0, marketing: 1 };
  function skeletons(tabId) {
    const box = el("div", "panel nc-skeletons");
    for (let i = 0; i < BY_TAB[tabId]; i++) box.appendChild(el("article", "card nc is-loading"));
    return box;
  }

  // Same flag as the other cards when a live fetch inside CRM has failed.
  function flagged(build) {
    return function (data, state) {
      const card = build(data, state);
      if (data.unavailable) card.querySelector(".nc-title").appendChild(App.pill("CRM data unavailable", "orange"));
      return card;
    };
  }

  return {
    forecast: flagged(forecast),
    atRisk: flagged(atRisk),
    stages: flagged(stages),
    response: flagged(response),
    channelTrend: flagged(channelTrend),
    formatDuration: formatDuration,
    skeletons: skeletons
  };
})();
