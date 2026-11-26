/* Tab 3: Marketing. Every KPI is worked out from Deals and Leads (Lead Source, Stage, Closing Date, Created Time),
   and each card names the CRM fields it comes from. Cards that need Campaign data appear only when that data exists. */
(function () {
  "use strict";

  const el = App.el;
  const OTHER = "Other / not set";
  const pct = function (a, b) { return b ? a / b * 100 : null; };
  const ratioText = function (v) { return v === null || v === undefined ? "—" : v.toFixed(1) + "x"; };
  const STATUS_TYPES = { Active: "green", Paused: "grey", Ended: "blue" };
  const FROM_DEALS = "Deals · Lead Source, Stage, Closing Date";
  const FROM_LEADS = "Leads · Lead Source, Created Time";

  // Each switch card keeps its own choice.
  const choice = { sourced: "won", influenced: "won" };
  let root = null;
  const table = { sortKey: "confirmed", sortDir: -1, showAll: false };

  function icon(paths) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "icon");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = paths;
    return svg;
  }
  const ICONS = {
    revenue: '<path d="M12 3v18M17 7.5c0-1.9-2.2-3-5-3s-5 1.1-5 3 2.2 2.6 5 3.2 5 1.4 5 3.3-2.2 3-5 3-5-1.1-5-3"/>',
    pipeline: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
    leads: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.3-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 4.8a3.5 3.5 0 0 1 0 6.4M18.5 14.8c1.6.8 2.6 2.6 3 5.2"/>',
    convert: '<path d="M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5"/>',
    web: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z"/>',
    win: '<path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4"/>',
    average: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    megaphone: '<path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1zM15 8a5 5 0 0 1 0 8M18 5a9 9 0 0 1 0 14"/>',
    calendar: '<rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
    up: '<path d="m4 16 6-6 4 4 6-7M15 7h5v5"/>',
    down: '<path d="m4 8 6 6 4-4 6 7M15 17h5v-5"/>'
  };

  function trend(delta) {
    const falling = delta.charAt(0) === "-";
    const pill = el("span", "ov-delta" + (falling ? " is-down" : ""));
    pill.append(icon(falling ? ICONS.down : ICONS.up), delta);
    pill.title = "vs the period before";
    return pill;
  }

  /*
   * One KPI card. k = { title, icon, tone, value, sub, from, delta, check, total, option }
   * A card with a switch always keeps the same rows (the Won / Open / Total line is reserved, not added),
   * so clicking the switch never moves the page.
   */
  function kpi(k) {
    const card = el("article", "card mk-kpi mk-tone-" + (k.tone || "blue"));
    const top = el("div", "mk-kpi-top");
    const badge = el("span", "mk-kpi-icon");
    badge.appendChild(icon(ICONS[k.icon]));
    top.append(badge, el("h2", "mk-kpi-title", k.title));
    if (k.delta) top.appendChild(trend(k.delta));
    const value = el("div", "mk-kpi-value", k.value);
    if (k.check) value.dataset.check = k.check;
    card.append(top, value, el("p", "mk-kpi-sub", k.sub || " "));
    if (k.option) card.appendChild(k.option);
    card.appendChild(el("p", "mk-kpi-from", "From " + k.from));
    return card;
  }

  // A KPI with the Won only / Won + Open switch. field: "sourced" or "influenced" in data.options.
  function switchKpi(data, state, base, field, deltaWon) {
    const holder = el("div", "mk-kpi-slot");
    function draw() {
      const o = choice[field];
      const won = data.options.won[field], open = data.options.open[field];
      const value = o === "won" ? won : data.options.wonOpen[field];
      const optionBox = el("div", "mk-kpi-option");
      const split = App.splitLine(won, open);
      if (o === "won") split.classList.add("is-reserved"); // keeps its space, so nothing moves
      optionBox.append(split, App.optionSwitch(o, function (next) { choice[field] = next; draw(); }));
      const card = kpi(Object.assign({}, base, {
        value: App.formatINR(value),
        sub: o === "won" ? "Won deals, closing date in " + App.periodText(state.range) : "Won in " + App.periodText(state.range) + ", plus deals open today",
        delta: o === "won" ? deltaWon : undefined,
        option: optionBox
      }));
      card.dataset.check = "switch-" + field;
      card.dataset.option = o;
      card.dataset.total = value === null ? "" : value;
      if (holder.firstChild) card.classList.add("no-anim"); // only the first drawing fades in
      holder.replaceChildren(card);
    }
    draw();
    return holder;
  }

  function renderKpis(data, state) {
    const m = data.mkt, period = App.periodText(state.range);
    const marketingLeadShare = pct(m.mktLeads, m.leads);
    const conversion = pct(m.mktMoved, m.mktLeads);
    const winRate = pct(m.wonCount, m.wonCount + m.lostCount);
    const channels = m.byChannel.filter(function (c) { return c.channel !== OTHER && c.won > 0; }).sort(function (a, b) { return b.won - a.won; });
    const top = channels[0];
    const count = App.formatCount, money = App.formatINR;
    const grid = el("div", "mk-kpis");
    grid.append(
      switchKpi(data, state, { title: "Marketing-sourced revenue", icon: "revenue", tone: "blue", from: FROM_DEALS }, "sourced", m.delta.wonAmount),
      kpi({ title: "Marketing pipeline", icon: "pipeline", tone: "violet", value: money(m.openAmount),
            sub: count(m.openCount) + (m.openCount === 1 ? " open deal" : " open deals") + " from marketing channels, today", from: "Deals · Lead Source, Stage" }),
      kpi({ title: "Marketing leads", icon: "leads", tone: "teal", value: m.mktLeads === null ? "—" : count(m.mktLeads), delta: m.delta.mktLeads,
            sub: m.leads === null ? "Leads could not be read" : "of " + count(m.leads) + " new leads in " + period + (marketingLeadShare === null ? "" : " (" + App.formatPct(marketingLeadShare, 0) + ")"), from: FROM_LEADS }),
      kpi({ title: "Lead to deal conversion", icon: "convert", tone: "green", value: App.formatPct(conversion, 1),
            sub: m.mktLeads === null ? "Leads could not be read" : count(m.mktMoved) + " of " + count(m.mktLeads) + " marketing leads moved to a deal", from: "Leads · Lead Source, converted to a deal" }),
      kpi({ title: "Website enquiries", icon: "web", tone: "sky", value: m.webLeads === null ? "—" : count(m.webLeads), delta: m.delta.webLeads,
            sub: "New leads from the website form in " + period, from: "Leads · Lead Source = Website or Web Form" }),
      kpi({ title: "Marketing win rate", icon: "win", tone: "amber", value: App.formatPct(winRate, 1),
            sub: count(m.wonCount) + " won · " + count(m.lostCount) + " lost, closed in " + period, from: FROM_DEALS }),
      kpi({ title: "Average won deal", icon: "average", tone: "pink", value: m.wonCount ? money(m.wonAmount / m.wonCount) : "—",
            sub: m.wonCount ? "Across " + count(m.wonCount) + " marketing-sourced won " + (m.wonCount === 1 ? "deal" : "deals") : "No marketing-sourced deal won in " + period, from: "Deals · Amount, Lead Source" }),
      kpi({ title: "Top channel", icon: "star", tone: "indigo", value: top ? top.channel : "—",
            sub: top ? money(top.won) + " won · " + App.formatPct(pct(top.won, m.wonAmount), 0) + " of marketing revenue" : "No marketing-sourced deal won in " + period, from: FROM_DEALS })
    );
    // Only with real data behind them: contact engagement, or Campaign records with these figures
    const k = data.marketingKpis, extra = [];
    if (data.options.won.influenced !== null) extra.push(switchKpi(data, state, { title: "Marketing influenced", icon: "megaphone", tone: "green", from: "Deals and Contacts · contact engaged within 180 days", check: "influenced" }, "influenced", k.delta.influenced));
    if (k.spend) extra.push(kpi({ title: "Marketing ROI", icon: "revenue", tone: "amber", value: ratioText(k.roi), sub: "Won marketing revenue ÷ campaign spend " + money(k.spend), from: "Deals and Campaigns · Actual Cost" }));
    [["webinar", "Webinar attendance", "Campaigns · Attendees"], ["events", "Event participants", "Campaigns · Participants"], ["linkedin", "LinkedIn engagements", "Campaigns · Engagements"]].forEach(function (x) {
      if (k[x[0]] !== null && k[x[0]] !== undefined && k[x[0]] > 0) extra.push(kpi({ title: x[1], icon: "calendar", tone: "violet", value: count(k[x[0]]), sub: "Campaigns started in " + period, from: x[2] }));
    });
    if (!extra.length) return [grid];
    const more = el("div", "mk-kpis mk-kpis-extra");
    extra.forEach(function (c) { more.appendChild(c); });
    return [grid, more];
  }

  function renderChannels(data, state) {
    const card = App.card("Channel contribution", "Confirmed amount sourced by each channel · " + countryLabel(state));
    if (data.unavailable) card.querySelector(".card-title").append(" ", App.pill("CRM data unavailable", "orange"));
    card.body.appendChild(App.attributionBars(data, "mk-legend"));
    return card;
  }

  // New leads per channel in the period, and how many of them became deals
  function renderLeadChannels(data, state) {
    const m = data.mkt;
    const card = App.card("Leads by channel", "New leads in " + App.periodText(state.range) + " · " + countryLabel(state));
    if (m.leads === null) { card.body.appendChild(el("p", "ov-muted", "Leads could not be read from CRM.")); return card; }
    const rows = m.byChannel.filter(function (c) { return c.channel !== OTHER && c.leads > 0; }).sort(function (a, b) { return b.leads - a.leads; });
    const max = Math.max.apply(null, [1].concat(rows.map(function (r) { return r.leads; })));
    rows.forEach(function (r) {
      const row = el("div", "mk-lead-row");
      const bar = el("div", "mk-lead-bar");
      const fill = el("span", "");
      fill.style.width = (r.leads / max * 100) + "%";
      const moved = el("span", "mk-lead-moved");
      moved.style.width = (r.moved / max * 100) + "%";
      bar.append(fill, moved);
      row.append(el("span", "mk-lead-label", r.channel), bar,
        el("span", "mk-lead-value", App.formatCount(r.leads) + (r.moved ? " · " + App.formatCount(r.moved) + " to deals" : "")));
      card.body.appendChild(row);
    });
    if (!rows.length) card.body.appendChild(el("p", "ov-muted", "No leads from marketing channels in this period."));
    const other = m.byChannel.find(function (c) { return c.channel === OTHER; });
    if (other && other.leads) card.body.appendChild(el("p", "ov-muted mk-note", App.formatCount(other.leads) + (other.leads === 1 ? " lead has" : " leads have") + " no marketing source (for example Cold Call or no Lead Source)."));
    card.body.appendChild(App.legend([{ label: "Leads", color: "#93A9F0" }, { label: "Moved to a deal", color: "var(--green)" }], "rp-legend mk-legend"));
    return card;
  }

  function button(className, text) {
    const b = el("button", className, text);
    b.type = "button";
    return b;
  }

  // Shown only when Campaign records exist
  function renderCampaigns(data, state) {
    const COLUMNS = [
      { key: "name", label: "Campaign" }, { key: "channel", label: "Channel" },
      { key: "spend", label: "Spend", format: App.formatINR, number: true }, { key: "leads", label: "Leads", format: App.formatCount, number: true },
      { key: "confirmed", label: "Confirmed", format: App.formatINR, number: true }, { key: "roi", label: "ROI", format: ratioText, number: true },
      { key: "status", label: "Status" }
    ];
    const card = el("article", "card");
    const header = el("header", "card-header ov-card-header");
    const heading = el("div");
    heading.append(el("h2", "card-title", "Top campaigns"), el("p", "card-subtitle", "Spend, leads and return · " + countryLabel(state)));
    const viewAll = button("btn-outline");
    header.append(heading, viewAll);
    const wrap = el("div", "ov-table-wrap");
    const node = el("table", "ov-table mk-table");
    const headRow = el("tr"), thead = el("thead"), tbody = el("tbody");
    thead.appendChild(headRow);
    node.append(thead, tbody);
    wrap.appendChild(node);
    COLUMNS.forEach(function (col) {
      const th = el("th");
      th.scope = "col";
      const b = button("ov-sort", col.label);
      b.addEventListener("click", function () {
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
        const order = col.number ? (a[col.key] === null ? -1 : a[col.key]) - (b[col.key] === null ? -1 : b[col.key]) : String(a[col.key]).localeCompare(String(b[col.key]));
        return order * table.sortDir;
      });
      tbody.replaceChildren.apply(tbody, rows.slice(0, table.showAll ? rows.length : 5).map(function (c) {
        const tr = el("tr");
        COLUMNS.forEach(function (column) {
          const td = el("td", column.key === "name" ? "ov-deal-name" : "");
          if (column.key === "status") td.appendChild(App.pill(c.status, STATUS_TYPES[c.status]));
          else td.textContent = column.format ? column.format(c[column.key]) : c[column.key];
          tr.appendChild(td);
        });
        return tr;
      }));
      Array.from(headRow.children).forEach(function (th, i) {
        const active = COLUMNS[i].key === table.sortKey;
        th.firstChild.textContent = COLUMNS[i].label + (active ? (table.sortDir === 1 ? " ↑" : " ↓") : "");
        if (active) th.setAttribute("aria-sort", table.sortDir === 1 ? "ascending" : "descending");
        else th.removeAttribute("aria-sort");
      });
      viewAll.textContent = table.showAll ? "Show less" : "View all";
      viewAll.hidden = rows.length <= 5;
    }
    viewAll.addEventListener("click", function () { table.showAll = !table.showAll; draw(); });
    card.append(header, wrap);
    draw();
    return card;
  }

  function mount(node) { root = node; }

  function render(data, state) {
    const split = el("div", "mk-split");
    split.append(renderChannels(data, state), renderLeadChannels(data, state));
    const trendCard = Cards.channelTrend(data, state);
    const parts = renderKpis(data, state).concat(split);
    if (data.campaigns && data.campaigns.length) parts.push(renderCampaigns(data, state));
    parts.push(trendCard);
    root.replaceChildren.apply(root, parts);
    trendCard.draw();
  }

  App.registerTab("marketing", { mount: mount, render: render });
})();
