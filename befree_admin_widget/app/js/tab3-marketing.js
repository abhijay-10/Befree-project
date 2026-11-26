/* Tab 3: Marketing Activities */
(function () {
  "use strict";

  const el = App.el;
  const ratioText = function (v) { return v === null || v === undefined ? "—" : v.toFixed(1) + "x"; };

  // `option`: the card has a Won only / Won + Open switch, and reads that field of data.options.
  const KPI_ROW_1 = [
    { key: "influenced", title: "Marketing influenced", format: App.formatINR, tone: "green", check: "influenced", option: "influenced" },
    { key: "sourcedRevenue", title: "Marketing-sourced revenue", format: App.formatINR, option: "sourced" },
    { key: "webinar", title: "Webinar attendance", format: App.formatCount },
    { key: "events", title: "Event participants", format: App.formatCount },
    { key: "linkedin", title: "LinkedIn engagements", format: App.formatCount },
    { key: "enquiries", title: "Website enquiries", format: App.formatCount }
  ];
  const KPI_ROW_2 = [
    { key: "leads", title: "Leads generated", format: App.formatCount },
    { key: "roi", title: "Marketing ROI", format: ratioText, option: "sourced", roi: true }
  ];
  // Each switch card keeps its own choice.
  const choice = { influenced: "won", sourcedRevenue: "won", roi: "won" };
  // TODO: replace once the rule for matching open deals to campaign spend is approved.
  const POTENTIAL_ROI_RULE = null;

  const FUNNEL_COLORS = ["#2352E5", "#4069E8", "#5D80EB", "#7996EF", "#96ADF2"];
  const STATUS_TYPES = { Active: "green", Paused: "grey", Ended: "blue" };
  const COLUMNS = [
    { key: "name", label: "Campaign" },
    { key: "channel", label: "Channel" },
    { key: "spend", label: "Spend", format: App.formatINR, number: true },
    { key: "leads", label: "Leads", format: App.formatCount, number: true },
    { key: "confirmed", label: "Confirmed", format: App.formatINR, number: true },
    { key: "roi", label: "ROI", format: ratioText, number: true },
    { key: "status", label: "Status" }
  ];
  const ROWS = 5;

  let root = null;
  const table = { sortKey: "confirmed", sortDir: -1, showAll: false };

  function button(className, text) {
    const b = el("button", className, text);
    b.type = "button";
    return b;
  }

  function trend(delta) {
    const falling = delta.charAt(0) === "-";
    const pill = el("span", "ov-delta" + (falling ? " is-down" : ""));
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "icon");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = falling ? '<path d="m4 8 6 6 4-4 6 7M15 17h5v-5"/>' : '<path d="m4 16 6-6 4 4 6-7M15 7h5v5"/>';
    pill.append(svg, delta);
    pill.title = "vs previous period";
    return pill;
  }

  function renderKpis(data, state, items, className) {
    const kpis = data.marketingKpis;
    const row = el("div", className);
    items.forEach(function (k) {
      const card = el("article", "card mk-kpi");
      if (!k.option) {
        fill(card, k, kpis[k.key], kpis.delta[k.key]);
        row.appendChild(card);
        return;
      }
      card.dataset.check = "switch-" + k.key;
      function draw() {
        const o = choice[k.key];
        card.replaceChildren();
        card.dataset.option = o;
        const won = data.options.won[k.option], open = data.options.open[k.option];
        if (k.roi) {
          // Won only: won revenue and spend of the same period. No spend: "Not available", never 0 or infinity.
          const value = o === "won" ? kpis.roi : POTENTIAL_ROI_RULE ? POTENTIAL_ROI_RULE(data) : null;
          fill(card, Object.assign({}, k, { title: o === "won" ? "Marketing ROI" : "Potential ROI" }),
            value, o === "won" ? kpis.delta.roi : undefined,
            o === "won" ? (kpis.spend ? null : "Not available") : (POTENTIAL_ROI_RULE ? null : "Awaiting approval"));
          card.appendChild(el("p", "mk-kpi-option", o === "won"
            ? "Won only · won revenue and campaign spend, both in " + App.periodText(state.range)
            : "Won + Open · open money is not yet earned"));
          if (o === "wonOpen") card.appendChild(App.splitLine(won, open));
          card.appendChild(el("p", "opt-split", "Spend " + (kpis.spend ? App.formatINR(kpis.spend) : "not available")));
        } else {
          const value = o === "won" ? won : data.options.wonOpen[k.option];
          card.dataset.total = value === null ? "" : value;
          fill(card, k, value, o === "won" ? kpis.delta[k.key] : undefined);
          card.appendChild(el("p", "mk-kpi-option", o === "won" ? "Won only · closing date in " + App.periodText(state.range)
            : "Won + Open · open deals as of today, not date-filtered"));
          if (o === "wonOpen") card.appendChild(App.splitLine(won, open));
        }
        card.appendChild(App.optionSwitch(o, function (next) { choice[k.key] = next; draw(); }));
      }
      draw();
      row.appendChild(card);
    });
    return row;
  }

  // Title, trend badge (only when real history exists) and value. `text` replaces the formatted value.
  function fill(card, k, value, delta, text) {
    const known = value !== null && value !== undefined;
    const top = el("div", "mk-kpi-top");
    top.appendChild(el("h2", "mk-kpi-title", k.title));
    if (delta) top.appendChild(trend(delta));
    const number = el("div", "mk-kpi-value" + (k.tone === "green" && known ? " is-green" : ""), text || k.format(value));
    if (k.check) number.dataset.check = k.check;
    card.append(top, number);
  }

  function renderChannels(data, state) {
    const card = App.card("Channel contribution", "Confirmed amount sourced by each channel · " + countryLabel(state));
    if (data.unavailable) card.querySelector(".card-title").append(" ", App.pill("CRM data unavailable", "orange"));
    card.body.appendChild(App.attributionBars(data, "mk-legend"));
    return card;
  }

  function renderExplainer() {
    const card = App.card("How attribution works");
    const box = el("p", "mk-explainer");
    box.append(
      el("strong", "", "Sourced"), ": the channel that created the deal. Only confirmed (Closed-won) deals count, by closing date. " +
      "A deal whose source matches no channel is not listed; its amount is stated under the total. ",
      el("strong", "", "Influenced"), ": a contact engaged in the 180 days before the deal was created."
    );
    card.body.append(box, el("p", "mk-note", "A deal can be sourced by one channel and influenced by several. Influenced is counted once per deal in its total."));
    return card;
  }

  // Same bar style as the Overview sales funnel.
  function renderLeadFunnel(data, state) {
    const card = App.card("Lead funnel", "Lead to closed-won · " + countryLabel(state));
    const max = Math.max.apply(null, [1].concat(data.leadFunnel.map(function (s) { return s.count || 0; })));
    data.leadFunnel.forEach(function (step, i) {
      const row = el("div", "ov-funnel-row");
      const label = el("span", "ov-funnel-label", step.label + " ");
      if (step.conversion !== null) label.appendChild(el("span", "ov-muted", App.formatPct(step.conversion)));
      const track = el("div");
      const bar = el("div", "ov-funnel-bar", App.formatCount(step.count));
      bar.style.width = ((step.count || 0) / max * 100) + "%";
      bar.style.background = FUNNEL_COLORS[i];
      track.appendChild(bar);
      row.append(label, track);
      card.body.appendChild(row);
    });
    card.body.appendChild(el("p", "mk-note", "Percentages show conversion from the step above."));
    return card;
  }

  function renderCampaigns(data, state) {
    const card = el("article", "card");
    const header = el("header", "card-header ov-card-header");
    const heading = el("div");
    heading.append(el("h2", "card-title", "Top campaigns"), el("p", "card-subtitle", "Spend, leads and return · " + countryLabel(state)));
    const viewAll = button("btn-outline");
    header.append(heading, viewAll);

    const wrap = el("div", "ov-table-wrap");
    const node = el("table", "ov-table mk-table");
    const headRow = el("tr");
    const thead = el("thead");
    thead.appendChild(headRow);
    const tbody = el("tbody");
    node.append(thead, tbody);
    wrap.appendChild(node);

    COLUMNS.forEach(function (col) {
      const th = el("th");
      th.scope = "col";
      const b = button("ov-sort", col.label);
      b.addEventListener("click", function () {
        // Numbers start largest first, text A to Z.
        table.sortDir = table.sortKey === col.key ? -table.sortDir : col.number ? -1 : 1;
        table.sortKey = col.key;
        draw();
      });
      th.appendChild(b);
      headRow.appendChild(th);
    });

    function draw() {
      const col = COLUMNS.find(function (c) { return c.key === table.sortKey; });
      const rows = data.campaigns.slice().sort(function (a, b) {
        const order = col.number
          ? (a[col.key] === null ? -1 : a[col.key]) - (b[col.key] === null ? -1 : b[col.key])
          : String(a[col.key]).localeCompare(String(b[col.key]));
        return order * table.sortDir;
      });

      tbody.replaceChildren.apply(tbody, rows.slice(0, table.showAll ? rows.length : ROWS).map(function (c) {
        const tr = el("tr");
        COLUMNS.forEach(function (column) {
          const td = el("td", column.key === "name" ? "ov-deal-name" : "");
          if (column.key === "status") td.appendChild(App.pill(c.status, STATUS_TYPES[c.status]));
          else td.textContent = column.format ? column.format(c[column.key]) : c[column.key];
          tr.appendChild(td);
        });
        return tr;
      }));
      if (!rows.length) {
        const td = el("td", "ov-empty", "No campaigns.");
        td.colSpan = COLUMNS.length;
        const tr = el("tr");
        tr.appendChild(td);
        tbody.appendChild(tr);
      }

      Array.from(headRow.children).forEach(function (th, i) {
        const active = COLUMNS[i].key === table.sortKey;
        th.firstChild.textContent = COLUMNS[i].label + (active ? (table.sortDir === 1 ? " ↑" : " ↓") : "");
        if (active) th.setAttribute("aria-sort", table.sortDir === 1 ? "ascending" : "descending");
        else th.removeAttribute("aria-sort");
      });
      viewAll.textContent = table.showAll ? "Show less" : "View all";
    }

    viewAll.addEventListener("click", function () { table.showAll = !table.showAll; draw(); });
    card.append(header, wrap);
    draw();
    return card;
  }

  function mount(node) { root = node; }

  function render(data, state) {
    const attribution = el("div", "mk-split");
    attribution.append(renderChannels(data, state), renderExplainer());
    const bottom = el("div", "ov-split");
    bottom.append(renderLeadFunnel(data, state), renderCampaigns(data, state));
    const trendCard = Cards.channelTrend(data, state);
    root.replaceChildren(
      renderKpis(data, state, KPI_ROW_1, "mk-kpis"),
      renderKpis(data, state, KPI_ROW_2, "mk-kpis mk-kpis-2"),
      attribution,
      bottom,
      trendCard
    );
    trendCard.draw();
  }

  App.registerTab("marketing", { mount: mount, render: render });
})();
