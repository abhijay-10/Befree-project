/* Tab 1: Admin Overview */
(function () {
  "use strict";

  const PAGE_SIZE = 6;

  // Funnel colours, darkest to lightest.
  const STAGE_COLORS = ["#2352E5", "#4069E8", "#5D80EB", "#7996EF", "#96ADF2", "#B3C3F5"];
  const GREY = "#DDE1E9"; // deselected chart segments

  // Constant SVG markup only (Lucide-style).
  const ICONS = {
    wallet: '<path d="M4 7a2 2 0 0 1 2-2h11v4"/><rect x="4" y="8" width="17" height="12" rx="2"/><path d="M16 14h2"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    handshake: '<path d="m11 17 2 2a1.5 1.5 0 0 0 2-2"/><path d="m14 15 2.500 2.500a1.5 1.5 0 0 0 2-2L15 12l-3 2a1.8 1.8 0 0 1-2-3l3-3h3l5 3v5h-2"/><path d="M3 11l5-3 4 1M3 11v5h3l4 3.500a1.5 1.5 0 0 0 2-2"/>',
    percent: '<path d="M18 6 6 18"/><circle cx="7.500" cy="7.500" r="2.500"/><circle cx="16.500" cy="16.500" r="2.500"/>',
    building: '<path d="M5 21V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v17M15 9h3a1 1 0 0 1 1 1v11M3 21h18M8 7h4M8 11h4M8 15h4"/>',
    megaphone: '<path d="M3 10v4a1 1 0 0 0 1 1h3l9 5V4L7 9H4a1 1 0 0 0-1 1z"/><path d="M19 9a4 4 0 0 1 0 6M7 15l1 5h3"/>',
    download: '<path d="M12 4v11m-5-5 5 5 5-5M5 20h14"/>',
    click: '<path d="m10 10 10 4-4.500 1.500L14 20z"/><path d="M10 3v3M3 10h3M5 5l2 2M15 5l-2 2M5 15l2-2"/>',
    calendar: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4M16 3v4M4 10h16M9 15l2 2 4-4"/>',
    docCheck: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 15l2 2 4-4"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.500 2.500 3.800 5.500 3.800 9S14.500 18.500 12 21c-2.500-2.500-3.800-5.500-3.800-9S9.500 5.500 12 3z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.500-3.500"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    up: '<path d="m4 16 6-6 4 4 6-7M15 7h5v5"/>',
    down: '<path d="m4 8 6 6 4-4 6 7M15 17h5v-5"/>',
    // Service tiles
    accounting: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M16 14v4M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M8 19h.01M12 19h.01"/>',
    bookkeeping: '<path d="M4 19.500v-15A2.500 2.500 0 0 1 6.500 2H20v20H6.500a2.500 2.500 0 0 1 0-5H20"/><path d="m9 9.500 2 2 4-4"/>',
    payroll: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
    tax: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M14 2v4a2 2 0 0 0 2 2h4M15 12l-6 6M9.500 12.500h.01M14.500 17.500h.01"/>',
    audit: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4M16 4h2a2 2 0 0 1 2 2v4"/><circle cx="16" cy="17" r="3"/><path d="m21 22-2.800-2.800"/>',
    paraplanning: '<path d="M22 7 13.500 15.500l-5-5L2 17M16 7h6v6"/>',
    mortgage: '<path d="M3 10a2 2 0 0 1 .700-1.500l7-6a2 2 0 0 1 2.600 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/>',
    virtualadmin: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="m9 10 2 2 4-4M12 17v4M8 21h8"/>',
    other: '<circle cx="12" cy="12" r="9"/><path d="M8 12h.01M12 12h.01M16 12h.01"/>'
  };

  const el = App.el;

  let root = null;
  let chart = null;
  // Table, chart and service-card choices survive re-renders.
  const ui = {
    chart: "count", search: "", stage: "", country: "", sortKey: "close", sortDir: 1, page: 1, showAll: false,
    forCountry: null, services: new Set(), serviceMode: "value", serviceView: "overall"
  };
  let onSelection = []; // redraws the service card and table when the selected services change

  /* ================= Helpers ================= */

  function icon(name) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "icon");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = ICONS[name];
    return svg;
  }

  function button(className, text) {
    const b = el("button", className, text);
    b.type = "button";
    return b;
  }

  const unique = function (list) { return Array.from(new Set(list.filter(Boolean))); };
  const plural = function (n, word) { return n + " " + word + (n === 1 ? "" : "s"); };
  const selectionChanged = function () { onSelection.forEach(function (fn) { fn(); }); };

  /* ================= Banner, KPIs ================= */

  function renderBanner(data, state) {
    const card = el("article", "card ov-banner");
    const badge = el("div", "ov-badge", state.country);

    const text = el("div", "ov-banner-text");
    const title = el("h2", "ov-banner-title", state.country === "ALL" ? "All countries overview" : countryLabel(state) + " overview");
    if (data.unavailable) title.append(" ", App.pill("CRM data unavailable", "orange"));
    const team = data.team || {};
    const parts = [
      team.bdm && "BDM " + team.bdm,
      team.bde && "BDE " + team.bde,
      plural(data.accounts, "account"),
      plural(data.dealCount, "deal")
    ];
    text.append(title, el("p", "ov-muted", parts.filter(Boolean).join(" · ")));

    const all = button("btn-outline");
    all.append(icon("globe"), "All countries");
    all.addEventListener("click", function () { Store.setCountry("ALL"); });

    card.append(badge, text, all);
    return card;
  }

  function renderKpis(data) {
    const k = data.kpis;
    const row = el("div", "ov-kpis");
    [
      { key: "pipeline", icon: "wallet", tone: "blue", value: App.formatINR(k.pipelineValue), label: "Total pipeline value", sub: "Open deals, amounts in ₹" },
      { key: "forecast", icon: "target", tone: "green", value: App.formatINR(k.forecast), label: "Weighted forecast", sub: "Value × stage probability", check: "forecast" },
      { key: "openDeals", icon: "handshake", tone: "blue", value: App.formatCount(k.openDeals), label: "Open deals", sub: "Stages 10% to 90%" },
      { key: "winRate", icon: "percent", tone: "orange", value: App.formatPct(k.winRate), label: "Win rate", sub: "Won ÷ closed, last 6 months" },
      { key: "newAccounts", icon: "building", tone: "blue", value: App.formatCount(k.newAccounts), label: "New accounts", sub: "Created in this period" },
      { key: "influenced", icon: "megaphone", tone: "green", value: App.formatINR(k.influenced), label: "Marketing influenced", sub: "Contact engaged within 180 days", check: "influenced" }
    ].forEach(function (item) {
      const card = el("article", "card ov-kpi");
      const delta = k.delta[item.key];
      const falling = !!delta && delta.charAt(0) === "-";

      const top = el("div", "ov-kpi-top");
      const tile = el("div", "ov-tile ov-tile-" + item.tone);
      tile.appendChild(icon(item.icon));
      top.appendChild(tile);
      if (delta) {
        const d = el("span", "ov-delta" + (falling ? " is-down" : ""));
        d.append(icon(falling ? "down" : "up"), delta);
        top.appendChild(d);
      }

      const value = el("div", "ov-kpi-value", item.value);
      if (item.check) value.dataset.check = item.check;
      card.append(top, value, el("div", "ov-kpi-label", item.label), el("div", "ov-kpi-sub", item.sub));
      const points = k.spark[item.key];
      if (points && points.length > 1) card.appendChild(App.sparkline(points, falling ? "var(--red)" : "var(--green)"));
      row.appendChild(card);
    });
    return row;
  }

  /* ================= Funnel and stages ================= */

  function renderFunnel(data, state) {
    const card = App.card("Sales funnel", "Deals reaching each stage · " + countryLabel(state));
    const max = Math.max.apply(null, data.funnel.concat(1));
    Data.STAGES.forEach(function (stage, i) {
      const row = el("div", "ov-funnel-row");
      const label = el("span", "ov-funnel-label", stage.name + " ");
      label.appendChild(el("span", "ov-muted", stage.prob + "%"));
      const track = el("div");
      const bar = el("div", "ov-funnel-bar", String(data.funnel[i]));
      bar.style.width = (data.funnel[i] / max * 100) + "%";
      bar.style.background = STAGE_COLORS[i];
      track.appendChild(bar);
      row.append(label, track);
      card.body.appendChild(row);
    });
    return card;
  }

  function renderStages(data) {
    const card = App.card("Pipeline by stage", "Open value · weighted forecast " + App.formatINR(data.kpis.forecast));
    card.classList.add("ov-stage-card");
    const rows = Data.STAGES.filter(function (s) { return data.pipelineByStage[s.name] > 0; });
    const max = Math.max.apply(null, rows.map(function (s) { return data.pipelineByStage[s.name]; }).concat(1));
    rows.forEach(function (s) {
      const value = data.pipelineByStage[s.name];
      card.body.appendChild(App.horizontalBarRow(s.name, App.formatINR(value), value / max * 100, "var(--blue)"));
    });
    if (!rows.length) card.body.appendChild(el("p", "ov-muted", "No open deals."));
    return card;
  }

  /* ================= Service contribution ================= */

  function toggle(options, current, onPick) {
    const box = el("div", "ov-toggle");
    options.forEach(function (o) {
      const b = button("", o.label);
      b.setAttribute("aria-pressed", String(o.id === current));
      b.disabled = !!o.disabled;
      if (o.disabled) b.title = "Available when the country filter is All countries";
      b.addEventListener("click", function () { onPick(o.id); });
      box.appendChild(b);
    });
    return box;
  }

  function insightLine(data, state, rows, percents) {
    const ranked = rows.map(function (r, i) { return { label: r.label, pct: percents[i] }; })
      .filter(function (r) { return r.pct > 0; })
      .sort(function (a, b) { return b.pct - a.pct; });
    if (!ranked.length) return "No open pipeline to analyse.";
    const top = ranked.slice(0, 3);
    const covered = top.reduce(function (t, r) { return t + r.pct; }, 0);
    const where = state.country === "ALL" ? "all-country" : state.country;
    return "Top service: " + top[0].label + " (" + App.formatPct(top[0].pct) + ") · " +
      plural(top.length, "service") + (top.length === 1 ? " drives " : " drive ") + App.formatPct(covered) +
      " of " + where + (ui.serviceMode === "value" ? " pipeline" : " deals");
  }

  // Returns the card; card.draw() renders the chart once the card is in the document.
  function renderServices(data, state) {
    const card = el("article", "card sv-card");
    const header = el("header", "card-header ov-card-header");
    const heading = el("div");
    heading.append(el("h2", "card-title", "Service contribution"),
      el("p", "card-subtitle", "Share of pipeline by service · " + countryLabel(state)));
    const controls = el("div", "sv-controls");
    header.append(heading, controls);

    const body = el("div", "sv-body");
    const grid = el("div", "sv-grid");
    const side = el("div", "sv-side");
    body.append(grid, side);
    card.append(header, body);

    const mode = function () { return ui.serviceMode === "value" ? "value" : "deals"; };
    const byCountry = function () { return state.country === "ALL" && ui.serviceView === "country"; };
    const colorOf = function (s) { return ui.services.size && !ui.services.has(s.key) ? GREY : s.color; };
    const tooltipText = function (s, pct) {
      return s.label + " · " + (mode() === "value" ? App.formatINR(s.value) : plural(s.deals, "deal")) + " · " + App.formatPct(pct);
    };

    function drawControls() {
      const count = el("span", "sv-count", ui.services.size + " selected");
      const clear = button("sv-clear", "Clear");
      clear.addEventListener("click", function () { ui.services.clear(); selectionChanged(); });
      controls.replaceChildren(
        count, clear,
        toggle([{ id: "value", label: "Value" }, { id: "deals", label: "Deals" }], ui.serviceMode,
          function (id) { ui.serviceMode = id; draw(); }),
        toggle([{ id: "overall", label: "Overall" }, { id: "country", label: "By country", disabled: state.country !== "ALL" }],
          byCountry() ? "country" : "overall",
          function (id) { ui.serviceView = id; draw(); })
      );
    }

    function drawTiles(percents) {
      grid.replaceChildren.apply(grid, data.services.map(function (s, i) {
        const tile = button("sv-tile" + (s[mode()] ? "" : " is-zero"));
        tile.setAttribute("aria-pressed", String(ui.services.has(s.key)));
        const box = el("span", "sv-icon");
        box.appendChild(icon(s.key));
        const dot = el("span", "sv-dot");
        dot.style.background = s.color;
        const figures = el("span", "sv-figures");
        const pct = el("span", "sv-pct");
        pct.append(dot, App.formatPct(percents[i]));
        figures.append(pct, el("span", "sv-value", App.formatINR(s.value)));
        tile.append(box, el("span", "sv-label", s.label), figures);
        tile.addEventListener("click", function () {
          if (ui.services.has(s.key)) ui.services.delete(s.key);
          else ui.services.add(s.key);
          selectionChanged();
          const again = grid.children[i];
          if (again) again.focus();
        });
        return tile;
      }));
    }

    function destroyChart() {
      if (chart) {
        chart.destroy();
        chart = null;
      }
    }

    function chartBox(className) {
      const box = el("div", className);
      const canvas = el("canvas");
      canvas.setAttribute("role", "img");
      box.appendChild(canvas);
      return { box: box, canvas: canvas };
    }

    function drawDonut(percents) {
      const parts = chartBox("sv-donut");
      parts.canvas.setAttribute("aria-label", data.services.map(function (s, i) { return tooltipText(s, percents[i]); })
        .filter(function (_, i) { return percents[i] > 0; }).join("; "));
      const total = data.services.reduce(function (t, s) { return t + s[mode()]; }, 0);
      const center = el("div", "sv-center");
      center.append(
        el("strong", "", mode() === "value" ? App.formatINR(total) : App.formatCount(total)),
        el("span", "", mode() === "value" ? "total pipeline" : "deals")
      );
      parts.box.appendChild(center);
      side.appendChild(parts.box);
      if (!window.Chart) return;
      chart = new Chart(parts.canvas, {
        type: "doughnut",
        data: {
          labels: data.services.map(function (s) { return s.label; }),
          datasets: [{
            data: data.services.map(function (s) { return s[mode()]; }),
            backgroundColor: data.services.map(colorOf),
            borderColor: "#fff",
            borderWidth: 2,
            hoverOffset: 0
          }]
        },
        options: {
          cutout: "68%",
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              displayColors: false,
              callbacks: {
                title: function () { return ""; },
                label: function (item) { return tooltipText(data.services[item.dataIndex], percents[item.dataIndex]); }
              }
            }
          }
        }
      });
    }

    function drawByCountry() {
      const countries = data.servicesByCountry;
      const percents = countries.map(function (c) {
        return Data.shares(c.services.map(function (s) { return s[mode()]; }));
      });
      const totals = countries.map(function (c) {
        const n = c.services.reduce(function (t, s) { return t + s[mode()]; }, 0);
        return mode() === "value" ? App.formatINR(n) : plural(n, "deal");
      });
      const parts = chartBox("sv-bars");
      parts.canvas.setAttribute("aria-label", countries.map(function (c, i) { return c.country + " " + totals[i]; }).join("; "));
      side.append(parts.box, el("p", "sv-caption", "Each bar adds up to 100% of that country's " +
        (mode() === "value" ? "pipeline." : "deals.")));
      if (!window.Chart) return;
      chart = new Chart(parts.canvas, {
        type: "bar",
        data: {
          labels: countries.map(function (c) { return c.country; }),
          datasets: data.services.map(function (s, j) {
            return { label: s.label, data: countries.map(function (_, i) { return percents[i][j] || 0; }),
                     backgroundColor: colorOf(s), barThickness: 28 };
          })
        },
        options: {
          indexAxis: "y",
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              displayColors: false,
              callbacks: {
                title: function (items) { return items[0].label; },
                label: function (item) {
                  return tooltipText(countries[item.dataIndex].services[item.datasetIndex], percents[item.dataIndex][item.datasetIndex]);
                }
              }
            }
          },
          scales: {
            x: { stacked: true, display: false, max: 100 },
            y: { stacked: true, grid: { display: false }, border: { display: false } },
            // Country totals, right-aligned.
            total: { type: "category", axis: "y", position: "right", labels: totals, offset: true,
                     grid: { display: false }, border: { display: false }, ticks: { color: "#111827" } }
          }
        }
      });
    }

    function draw() {
      destroyChart();
      const percents = Data.shares(data.services.map(function (s) { return s[mode()]; }));
      drawControls();
      drawTiles(percents);
      side.replaceChildren();
      const total = data.services.reduce(function (t, s) { return t + s[mode()]; }, 0);
      if (!total) side.appendChild(el("p", "ov-muted", "No open pipeline."));
      else if (byCountry()) drawByCountry();
      else drawDonut(percents);
      if (!window.Chart) side.appendChild(el("p", "ov-muted", "The chart library could not be loaded."));
      side.appendChild(el("p", "sv-insight", insightLine(data, state, data.services, percents)));
    }

    card.draw = draw;
    onSelection.push(draw);
    return card;
  }

  /* ================= Won vs lost, activity ================= */

  function renderWonLost(data, state) {
    const card = App.card("Deals won vs lost", "Last 6 months · " + countryLabel(state));
    const header = card.querySelector(".card-header");
    header.classList.add("ov-card-header");
    const heading = el("div");
    heading.append.apply(heading, Array.from(header.childNodes));
    const switcher = el("div", "ov-toggle");
    header.append(heading, switcher);

    const views = [{ id: "revenue", label: "Revenue" }, { id: "count", label: "Won vs lost" }];

    function draw() {
      switcher.querySelectorAll("button").forEach(function (b) {
        b.setAttribute("aria-pressed", String(b.dataset.view === ui.chart));
      });
      header.querySelector(".card-title").textContent = ui.chart === "revenue" ? "Revenue won" : "Deals won vs lost";

      const revenue = ui.chart === "revenue";
      const months = revenue ? data.revenueTrend : data.wonLost;
      const series = revenue
        ? [{ key: "revenue", name: "Revenue", color: "var(--blue)", format: App.formatINR }]
        : [{ key: "won", name: "Won", color: "var(--green)", format: App.formatCount },
           { key: "lost", name: "Lost", color: "var(--pink)", format: App.formatCount }];
      const max = Math.max.apply(null, [1].concat(...months.map(function (m) {
        return series.map(function (s) { return m[s.key]; });
      })));

      const plot = el("div", "ov-chart");
      months.forEach(function (m) {
        const col = el("div", "ov-chart-col");
        const bars = el("div", "ov-chart-bars");
        series.forEach(function (s) {
          const bar = el("div", "ov-chart-bar");
          bar.style.height = (m[s.key] / max * 100) + "%";
          bar.style.background = s.color;
          bar.title = m.label + " · " + s.name + ": " + s.format(m[s.key]);
          bar.setAttribute("role", "img");
          bar.setAttribute("aria-label", bar.title);
          bars.appendChild(bar);
        });
        col.append(bars, el("div", "ov-chart-month", m.label));
        plot.appendChild(col);
      });

      card.body.replaceChildren(plot, App.legend(series.map(function (s) {
        return { label: s.name, color: s.color };
      }), "ov-legend"));
    }

    views.forEach(function (v) {
      const b = button("", v.label);
      b.dataset.view = v.id;
      b.addEventListener("click", function () { ui.chart = v.id; draw(); });
      switcher.appendChild(b);
    });
    draw();
    return card;
  }

  function renderActivity(data, state) {
    const card = App.card("Recent activity", "Contacts, accounts and deals · " + countryLabel(state));
    data.recentActivity.forEach(function (a) {
      const row = el("div", "ov-activity");
      const tile = el("div", "ov-tile ov-tile-blue");
      tile.appendChild(icon(a.icon));
      const text = el("div", "ov-activity-text");
      text.append(el("div", "ov-activity-title", a.title), el("div", "ov-activity-detail", a.detail));
      row.append(tile, text);
      if (a.pill) row.appendChild(App.pill(a.pill, a.pillType));
      card.body.appendChild(row);
    });
    if (!data.recentActivity.length) card.body.appendChild(el("p", "ov-muted", "No recent activity."));
    return card;
  }

  /* ================= Sales pipeline table ================= */

  const COLUMNS = [
    { key: "name", label: "Deal" },
    { key: "account", label: "Account" },
    { key: "contact", label: "Contact" },
    { key: "country", label: "Country" },
    { key: "service", label: "Service line" },
    { key: "amount", label: "Value" },
    { key: "stage", label: "Stage" },
    { key: "probability", label: "Prob." },
    { key: "owner", label: "Owner" },
    { key: "close", label: "Close" }
  ];

  function stageOrder(name) {
    const i = Data.STAGES.findIndex(function (s) { return s.name === name; });
    return i === -1 ? Data.STAGES.length : i;
  }

  function compare(a, b) {
    const key = ui.sortKey;
    if (key === "amount" || key === "probability") return a[key] - b[key];
    if (key === "stage") return stageOrder(a.stage) - stageOrder(b.stage);
    return String(a[key]).localeCompare(String(b[key]));
  }

  function openRecord(entity, id) {
    if (!id || !App.isEmbedded) return; // no record to open outside CRM
    ZOHO.CRM.UI.Record.open({ Entity: entity, RecordID: id });
  }

  function dealRow(d) {
    const tr = el("tr");
    tr.tabIndex = 0;
    tr.addEventListener("click", function () { openRecord("Deals", d.id); });
    tr.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && e.target === tr) openRecord("Deals", d.id);
    });

    const account = button("ov-link", d.account || "—");
    account.addEventListener("click", function (e) {
      e.stopPropagation();
      openRecord("Accounts", d.accountId);
    });
    const stageType = d.stage === "Closed-won" ? "green" : d.stage === "Closed-lost" ? "red" : "blue";

    [
      el("td", "ov-deal-name", d.name),
      account,
      d.contact || "—",
      d.country || "—",
      d.service || "—",
      App.formatINRFull(d.amount),
      App.pill(d.stage || "—", stageType),
      d.probability + "%",
      d.owner || "—",
      d.close || "—"
    ].forEach(function (content) {
      if (content.tagName === "TD") { tr.appendChild(content); return; }
      const td = el("td");
      td.append(content);
      tr.appendChild(td);
    });
    return tr;
  }

  // options = [[value, label]]
  function selectBox(label, options, value, onChange) {
    const wrap = el("div", "select");
    const select = el("select");
    select.setAttribute("aria-label", label);
    options.forEach(function (o) {
      const option = el("option", "", o[1]);
      option.value = o[0];
      select.appendChild(option);
    });
    select.value = value;
    select.addEventListener("change", function () { onChange(select.value); });
    const chevron = icon("chevron");
    chevron.classList.add("select-chevron");
    wrap.append(select, chevron);
    return wrap;
  }

  // Kept in step with the service tiles. Several tiles show as "N services selected".
  function serviceSelect(data) {
    const picked = Array.from(ui.services);
    const options = [["", "All services"]].concat(data.services.map(function (s) { return [s.key, s.label]; }));
    if (picked.length > 1) options.push(["multi", picked.length + " services selected"]);
    return selectBox("Service line", options, picked.length > 1 ? "multi" : picked[0] || "", function (v) {
      if (v === "multi") return;
      ui.services = new Set(v ? [v] : []);
      selectionChanged();
    });
  }

  function renderTable(data, state) {
    const card = el("article", "card");

    const header = el("header", "card-header ov-card-header");
    const heading = el("div");
    heading.append(el("h2", "card-title", "Sales pipeline"), el("p", "card-subtitle", "Click a row to open the deal · " + countryLabel(state)));
    const viewAll = button("btn-outline");
    header.append(heading, viewAll);

    const toolbar = el("div", "ov-toolbar");
    const search = el("label", "search");
    const input = el("input");
    input.type = "search";
    input.placeholder = "Search deals";
    input.setAttribute("aria-label", "Search deals");
    input.value = ui.search;
    search.append(icon("search"), input);

    const stageNames = unique(Data.STAGES.map(function (s) { return s.name; }).concat(data.deals.map(function (d) { return d.stage; })));
    if (stageNames.indexOf(ui.stage) === -1) ui.stage = "";
    toolbar.append(search, selectBox("Stage", [["", "All stages"]].concat(stageNames.map(function (s) { return [s, s]; })),
      ui.stage, function (v) { ui.stage = v; refresh(true); }));

    // Only offered when the header filter is "All countries".
    if (state.country === "ALL") {
      const countries = unique(data.deals.map(function (d) { return d.country; })).sort();
      if (countries.indexOf(ui.country) === -1) ui.country = "";
      toolbar.appendChild(selectBox("Country", [["", "All countries"]].concat(countries.map(function (c) { return [c, c]; })),
        ui.country, function (v) { ui.country = v; refresh(true); }));
    } else {
      ui.country = "";
    }
    let services = serviceSelect(data);
    toolbar.appendChild(services);

    const scroller = el("div", "ov-table-wrap");
    const table = el("table", "ov-table");
    const headRow = el("tr");
    const thead = el("thead");
    thead.appendChild(headRow);
    const tbody = el("tbody");
    tbody.dataset.check = "deal-rows";
    table.append(thead, tbody);
    scroller.appendChild(table);

    COLUMNS.forEach(function (col) {
      const th = el("th");
      th.scope = "col";
      const b = button("ov-sort", col.label);
      b.addEventListener("click", function () {
        ui.sortDir = ui.sortKey === col.key ? -ui.sortDir : 1;
        ui.sortKey = col.key;
        refresh(true);
      });
      th.appendChild(b);
      headRow.appendChild(th);
    });

    const footer = el("footer", "ov-table-footer");
    const count = el("span", "ov-muted");
    count.dataset.check = "deal-count";
    const pager = el("div", "ov-pager");
    const prev = button("btn-icon", "‹");
    const next = button("btn-icon", "›");
    prev.setAttribute("aria-label", "Previous page");
    next.setAttribute("aria-label", "Next page");
    const position = el("span");
    pager.append(prev, position, next);
    footer.append(count, pager);
    prev.addEventListener("click", function () { ui.page--; refresh(); });
    next.addEventListener("click", function () { ui.page++; refresh(); });

    function refresh(resetPage) {
      if (resetPage) ui.page = 1;
      const q = ui.search.trim().toLowerCase();
      const rows = data.deals.filter(function (d) {
        return (!ui.stage || d.stage === ui.stage) &&
          (!ui.country || d.country === ui.country) &&
          (!ui.services.size || ui.services.has(Data.serviceKey(d.service))) &&
          (!q || [d.name, d.account, d.contact, d.service, d.owner].join(" ").toLowerCase().indexOf(q) !== -1);
      }).sort(function (a, b) { return compare(a, b) * ui.sortDir; });

      const pages = ui.showAll ? 1 : Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
      ui.page = Math.min(Math.max(1, ui.page), pages);
      const visible = ui.showAll ? rows : rows.slice((ui.page - 1) * PAGE_SIZE, ui.page * PAGE_SIZE);

      tbody.replaceChildren.apply(tbody, visible.map(dealRow));
      if (!visible.length) {
        const td = el("td", "ov-empty", "No deals match these filters.");
        td.colSpan = COLUMNS.length;
        const tr = el("tr");
        tr.appendChild(td);
        tbody.appendChild(tr);
      }

      Array.from(headRow.children).forEach(function (th, i) {
        const col = COLUMNS[i];
        const active = col.key === ui.sortKey;
        th.firstChild.textContent = col.label + (active ? (ui.sortDir === 1 ? " ↑" : " ↓") : "");
        if (active) th.setAttribute("aria-sort", ui.sortDir === 1 ? "ascending" : "descending");
        else th.removeAttribute("aria-sort");
      });

      // Rows across all pages, and whether any table filter is narrowing them.
      tbody.dataset.count = rows.length;
      tbody.dataset.filtered = String(!!(q || ui.stage || ui.country || ui.services.size));
      count.textContent = plural(rows.length, "deal");
      position.textContent = ui.page + " / " + pages;
      prev.disabled = ui.page <= 1;
      next.disabled = ui.page >= pages;
      viewAll.textContent = ui.showAll ? "Show less" : "View all";
      if (card.isConnected) Checks.table(data);
    }

    input.addEventListener("input", function () { ui.search = input.value; refresh(true); });
    viewAll.addEventListener("click", function () { ui.showAll = !ui.showAll; refresh(true); });
    onSelection.push(function () {
      const fresh = serviceSelect(data);
      services.replaceWith(fresh);
      services = fresh;
      refresh(true);
    });

    card.append(header, toolbar, scroller, footer);
    refresh();
    return card;
  }

  /* ================= Tab ================= */

  function mount(node) { root = node; }

  function render(data, state) {
    if (ui.forCountry !== state.country) {
      ui.forCountry = state.country;
      ui.country = "";
      ui.page = 1;
    }
    if (chart) {
      chart.destroy();
      chart = null;
    }
    onSelection = [];

    const half = el("div", "ov-split");
    half.append(renderFunnel(data, state), renderStages(data));
    const services = renderServices(data, state);
    const thirds = el("div", "ov-split ov-split-wide");
    thirds.append(renderWonLost(data, state), renderActivity(data, state));
    const risk = el("div", "nc-row");
    risk.append(Cards.forecast(data, state), Cards.atRisk(data, state));
    root.replaceChildren(renderBanner(data, state), renderKpis(data), half, services, risk, thirds, renderTable(data, state));
    services.draw();
  }

  App.registerTab("overview", { mount: mount, render: render });
})();
