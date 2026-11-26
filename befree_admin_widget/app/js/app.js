/* Shell, Zoho wiring, shared formatters and renderers. Tab files register via App.registerTab(). */
window.App = (function () {
  "use strict";

  const BRAND = "Befree × Race2Cloud";
  const PAGE_NAMES = {
    overview: "Overview",
    reports: "Reports & Analytics",
    marketing: "Marketing Activities"
  };
  const ZOHO_TIMEOUT_MS = 10000;

  let activeTab = "overview";
  const tabs = {};
  const renderTokens = {};
  const stale = new Set(Object.keys(PAGE_NAMES));

  /* ---------- Zoho ---------- */

  // Resolves once the SDK has connected to CRM; rejects outside Zoho so cards show no data.
  let zohoReady;
  const isEmbedded = window.parent !== window;

  function initZoho() {
    zohoReady = new Promise(function (resolve, reject) {
      // Widgets always run in an iframe, so a top-level page is a local preview.
      if (!window.ZOHO || !ZOHO.embeddedApp || !isEmbedded) {
        reject(new Error("Not running inside Zoho CRM"));
        return;
      }
      const timer = setTimeout(function () {
        reject(new Error("Not running inside Zoho CRM"));
      }, ZOHO_TIMEOUT_MS);

      const connected = function () {
        clearTimeout(timer);
        resolve();
      };
      ZOHO.embeddedApp.on("PageLoad", connected);
      const started = ZOHO.embeddedApp.init();
      if (started && started.then) started.then(connected, reject);
    });
    zohoReady.catch(function (err) { console.warn("[widget]", err.message); });
    // The signed-in user's initials in the header
    zohoReady.then(function () { return ZOHO.CRM.CONFIG.getCurrentUser(); }).then(function (r) {
      const u = r && r.users && r.users[0], name = u && (u.full_name || u.email);
      if (!name) return;
      const box = document.getElementById("user-avatar");
      box.textContent = name.split(/\s+/).map(function (w) { return w.charAt(0); }).join("").slice(0, 2).toUpperCase();
      box.title = name;
      box.setAttribute("aria-label", "Signed in as " + name);
      box.hidden = false;
    }).catch(function () { /* the header works without it */ });
  }

  function withTimeout(promise) {
    return new Promise(function (resolve, reject) {
      const timer = setTimeout(function () { reject(new Error("Zoho request timed out")); }, ZOHO_TIMEOUT_MS * 3);
      promise.then(
        function (v) { clearTimeout(timer); resolve(v); },
        function (e) { clearTimeout(timer); reject(e); }
      );
    });
  }

  // The SDK can resolve with an error body, and resolves with no `data` when there are no records.
  function readRows(response) {
    if (response && Array.isArray(response.data)) return response.data;
    if (response && (response.status === 204 || response.statusText === "nocontent")) return [];
    if (response === "" || response == null) return [];
    throw new Error((response && (response.message || response.code)) || "Unexpected Zoho response");
  }

  async function coql(query) {
    await zohoReady;
    return readRows(await withTimeout(ZOHO.CRM.API.coql({ select_query: query })));
  }

  // Every record of a module, with all its fields. Reads until CRM says there are no more; if CRM refuses
  // a page (it may above 2,000 records), the error is passed on instead of returning a short list.
  async function allRecords(entity, params) {
    await zohoReady;
    let rows = [];
    for (let page = 1; ; page++) {
      const res = await withTimeout(ZOHO.CRM.API.getAllRecords(Object.assign({
        Entity: entity, sort_order: "desc", per_page: 200, page: page
      }, params)));
      rows = rows.concat(readRows(res));
      if (!res || !res.info || !res.info.more_records) break;
    }
    // A record moved between pages while reading is returned twice; keep it once.
    const seen = new Set();
    return rows.filter(function (r) {
      if (!r || !r.id) return true;
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });
  }

  // The Deals stages as set up in CRM, in order.
  async function stageValues() {
    await zohoReady;
    const res = await withTimeout(ZOHO.CRM.META.getFields({ Entity: "Deals" }));
    const stage = ((res && res.fields) || []).find(function (f) { return f.api_name === "Stage"; });
    return ((stage && stage.pick_list_values) || []).filter(function (p) { return p.type !== "unused"; })
      .map(function (p) { return p.actual_value || p.display_value; })
      .filter(function (v) { return v && v !== "-None-"; });
  }

  // One page of a related list, as { rows, more }.
  async function getRelatedRecords(entity, id, list, page) {
    await zohoReady;
    const res = await withTimeout(ZOHO.CRM.API.getRelatedRecords({
      Entity: entity, RecordID: id, RelatedList: list, page: page, per_page: 200
    }));
    return { rows: readRows(res), more: !!(res && res.info && res.info.more_records) };
  }

  // Run a real fetch; on any failure return the fallback.
  async function fetchWithFallback(fetcher, fallback) {
    try {
      return await fetcher();
    } catch (err) {
      console.warn("[widget] Fetch failed:", (err && err.message) || err);
      return fallback;
    }
  }

  /* ---------- Formatting (null and non-numbers show as "—") ---------- */

  const missing = function (v) { return v === null || v === undefined || !Number.isFinite(Number(v)); };

  // ₹X.XX Cr / ₹X.X L / ₹ with Indian grouping.
  function formatINR(n) {
    if (missing(n)) return "—";
    const sign = n < 0 ? "-" : "";
    const abs = Math.abs(n);
    if (abs >= 1e7) return sign + "₹" + (abs / 1e7).toFixed(2) + " Cr";
    if (abs >= 1e5) return sign + "₹" + (abs / 1e5).toFixed(1) + " L";
    return sign + "₹" + Math.round(abs).toLocaleString("en-IN");
  }

  // Full amount with Indian grouping, e.g. ₹24,00,000.
  function formatINRFull(n) {
    if (missing(n)) return "—";
    return (n < 0 ? "-" : "") + "₹" + Math.round(Math.abs(n)).toLocaleString("en-IN");
  }

  function formatPct(v, decimals) {
    return missing(v) ? "—" : Number(v).toFixed(decimals === undefined ? 1 : decimals) + "%";
  }

  function formatCount(v) {
    return missing(v) ? "—" : Math.round(v).toLocaleString("en-IN");
  }

  /* ---------- Renderers (return DOM nodes; text is never parsed as HTML) ---------- */

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  // Returns the card element; append content to the returned node's `.body`.
  function card(title, subtitle) {
    const root = el("article", "card");
    if (title || subtitle) {
      const header = el("header", "card-header");
      if (title) header.appendChild(el("h2", "card-title", title));
      if (subtitle) header.appendChild(el("p", "card-subtitle", subtitle));
      root.appendChild(header);
    }
    root.body = root.appendChild(el("div", "card-body"));
    return root;
  }

  // pct is 0–100; color is any CSS color, e.g. "var(--blue)".
  function horizontalBarRow(label, value, pct, color) {
    const row = el("div", "hbar");
    const name = el("span", "hbar-label", label);
    name.title = label;
    const track = el("div", "hbar-track");
    const fill = el("div", "hbar-fill");
    fill.style.width = Math.max(0, Math.min(100, Number(pct) || 0)) + "%";
    fill.style.background = color || "var(--blue)";
    track.appendChild(fill);
    row.append(name, track, el("span", "hbar-value", value));
    return row;
  }

  // type: blue | green | red | orange | grey | cold
  function pill(text, type) {
    return el("span", "pill pill-" + (type || "grey"), text);
  }

  function sparkline(points, color) {
    const NS = "http://www.w3.org/2000/svg";
    const W = 100, H = 32, PAD = 2;
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "sparkline");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("aria-hidden", "true");

    const values = (points || []).map(Number).filter(Number.isFinite);
    if (!values.length) return svg;
    if (values.length === 1) values.push(values[0]);

    const min = Math.min.apply(null, values);
    const range = Math.max.apply(null, values) - min;
    const pts = values.map(function (v, i) {
      const x = (i / (values.length - 1)) * W;
      const y = range ? H - PAD - ((v - min) / range) * (H - PAD * 2) : H / 2;
      return [Number(x.toFixed(2)), Number(y.toFixed(2))];
    });

    // Smooth curve: cubic segments with flat tangents at each point, so it never overshoots.
    let d = "M" + pts[0].join(",");
    for (let i = 1; i < pts.length; i++) {
      const mid = ((pts[i - 1][0] + pts[i][0]) / 2).toFixed(2);
      d += " C" + mid + "," + pts[i - 1][1] + " " + mid + "," + pts[i][1] + " " + pts[i][0] + "," + pts[i][1];
    }
    const line = document.createElementNS(NS, "path");
    line.setAttribute("d", d);
    line.style.fill = "none";
    line.style.stroke = color || "var(--blue)";
    line.style.strokeWidth = "1.5";
    line.style.strokeLinecap = "round";
    line.style.strokeLinejoin = "round";
    line.setAttribute("vector-effect", "non-scaling-stroke");
    svg.appendChild(line);
    return svg;
  }

  /* ---------- Period and Won / Won + Open wording, shared by every card ---------- */

  const PERIOD_TEXT = { "7d": "the last 7 days", "30d": "the last 30 days", "90d": "the last 90 days", "12m": "the last 12 months", all: "all time" };
  function periodText(range) { return PERIOD_TEXT[range]; }

  // Names the selected option and the dates it covers.
  function optionText(option, range) {
    return option === "won"
      ? "Won only · closing date in " + periodText(range)
      : "Won + Open · won in " + periodText(range) + ", plus deals open today";
  }

  // "Won only" / "Won + Open" switch. Each card keeps its own choice.
  function optionSwitch(current, onPick) {
    const box = el("div", "ov-toggle opt-switch");
    box.setAttribute("role", "group");
    box.setAttribute("aria-label", "Deals included");
    [["won", "Won only"], ["wonOpen", "Won + Open"]].forEach(function (o) {
      const b = el("button", "", o[1]);
      b.type = "button";
      b.setAttribute("aria-pressed", String(o[0] === current));
      b.addEventListener("click", function () { if (o[0] !== current) onPick(o[0]); });
      box.appendChild(b);
    });
    return box;
  }

  // "Won ₹X · Open ₹Y · Total ₹Z", shown in Won + Open.
  function splitLine(won, open, format) {
    const f = format || formatINR;
    const line = el("p", "opt-split");
    [["won", "Won", won], ["open", "Open", open], ["total", "Total", won === null || open === null ? null : won + open]].forEach(function (x) {
      const chip = el("span", "opt-chip is-" + x[0]);
      chip.append(el("span", "", x[1] + " "), el("b", "", f(x[2])));
      line.appendChild(chip);
    });
    return line;
  }

  // items = [{label, color}]
  function legend(items, className) {
    const box = el("div", className);
    items.forEach(function (i) {
      const item = el("span", "rp-legend-item");
      const dot = el("span", "rp-dot");
      dot.style.background = i.color;
      item.append(dot, i.label);
      box.appendChild(item);
    });
    return box;
  }

  // One bar per channel: confirmed amount sourced by it. Shared by Reports and Marketing.
  // Every confirmed deal is under exactly one channel ("Other / not set" if none), so the rows add up to the total.
  function attributionBars(data, legendClass) {
    const rows = data.attribution;
    const max = Math.max.apply(null, [1].concat(rows.map(function (r) { return r.sourced; })));
    const fragment = document.createDocumentFragment();
    rows.filter(function (r) { return r.channel !== "Other / not set"; }).forEach(function (r) {
      const row = el("div", "rp-attr-row");
      const bars = el("div", "rp-attr-bars");
      bars.setAttribute("role", "img");
      bars.setAttribute("aria-label", r.channel + ": " + formatINR(r.sourced));
      if (r.sourced > 0) {
        const bar = el("div", "rp-attr-bar");
        bar.style.width = (r.sourced / max * 100) + "%";
        bar.style.background = "var(--blue)";
        bars.appendChild(bar);
      }
      row.append(el("span", "rp-attr-label", r.channel), bars, el("span", "rp-attr-value", formatINR(r.sourced)));
      fragment.appendChild(row);
    });
    const total = rows.reduce(function (t, r) { return t + r.sourced; }, 0);
    const sumRow = el("div", "rp-attr-row rp-attr-total");
    sumRow.dataset.check = "channel-total";
    sumRow.dataset.total = total;
    sumRow.append(el("span", "rp-attr-label", "Total"), el("div", "rp-attr-bars"), el("span", "rp-attr-value", formatINR(total)));
    fragment.appendChild(sumRow);
    const unmatched = rows.filter(function (r) { return r.channel === "Other / not set"; }).reduce(function (t, r) { return t + r.sourced; }, 0);
    if (unmatched) fragment.appendChild(el("p", "ov-muted", "The total includes " + formatINR(unmatched) + " with no matching channel, which is not listed."));
    fragment.appendChild(legend([{ label: "Confirmed amount, by source channel", color: "var(--blue)" }],
      "rp-legend" + (legendClass ? " " + legendClass : "")));
    return fragment;
  }

  /* ---------- Tabs ---------- */

  // tab = { mount(el), render(data, state) }
  function registerTab(id, tab) {
    tabs[id] = tab;
  }

  function updateHeading() {
    const page = PAGE_NAMES[activeTab];
    document.getElementById("page-title").textContent = page;
    document.getElementById("breadcrumb").textContent = [BRAND, page, countryLabel(Store.state)].join(" / ");
  }

  // Animates each KPI number from 0 to the text already shown, then puts back that exact text.
  // Only the display changes. Values that are not numbers (for example "Email") just fade in.
  function countUp(panel) {
    const quiet = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    panel.querySelectorAll(".mk-kpi-value, .ov-kpi-value").forEach(function (node) {
      const final = node.textContent;
      const m = /^(\D*?)(\d[\d,]*(?:\.\d+)?)(.*)$/.exec(final);
      if (quiet) return;
      if (!m) { node.classList.add("kpi-fade"); return; }
      const target = parseFloat(m[2].replace(/,/g, "")), decimals = (m[2].split(".")[1] || "").length, grouped = m[2].indexOf(",") !== -1;
      const show = function (v) {
        const text = grouped ? v.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : v.toFixed(decimals);
        node.textContent = m[1] + text + m[3];
      };
      const start = performance.now();
      const step = function (now) {
        if (!node.isConnected) return;
        const t = Math.min(1, (now - start) / 800), eased = 1 - Math.pow(1 - t, 3);
        if (t < 1) { show(target * eased); requestAnimationFrame(step); } else node.textContent = final;
      };
      show(0);
      requestAnimationFrame(step);
      setTimeout(function () { node.textContent = final; }, 1000); // the true value, with or without animation
    });
  }

  async function renderTab(id) {
    const tab = tabs[id];
    if (!tab) return;
    const panel = document.getElementById("panel-" + id);
    const state = Object.assign({}, Store.state);
    const token = (renderTokens[id] || 0) + 1;
    renderTokens[id] = token;
    stale.delete(id);
    panel.setAttribute("aria-busy", "true");
    // Skeleton loaders for the added cards.
    if (!panel.children.length) panel.appendChild(Cards.skeletons(id));
    panel.querySelectorAll(".nc").forEach(function (card) { card.classList.add("is-loading"); });
    try {
      const data = await Data.loadData(state);
      if (renderTokens[id] !== token) return; // a newer filter change superseded this one
      if (data.failed) {
        // A failed read is never shown as zero.
        stale.add(id);
        const box = el("div", "placeholder", "Could not load CRM data. Every figure is hidden until it loads. Use refresh to try again.");
        if (data.reason) box.appendChild(el("p", "ov-muted", "Reason: " + data.reason));
        panel.replaceChildren(box);
        return;
      }
      tab.render(data, state);
      Checks.run(id, data, state);
      countUp(panel);
      document.getElementById("last-updated").textContent =
        "Last updated " + new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
    } catch (err) {
      console.error("[widget] Failed to render " + id, err);
      if (renderTokens[id] === token) {
        stale.add(id);
        panel.replaceChildren(el("div", "placeholder", "This tab could not be displayed."));
      }
    } finally {
      if (renderTokens[id] === token) panel.removeAttribute("aria-busy");
    }
  }

  // Returns a promise that settles once the tab is up to date.
  function switchTab(id) {
    if (!PAGE_NAMES[id]) return Promise.resolve();
    activeTab = id;
    document.querySelectorAll(".tab").forEach(function (button) {
      const active = button.dataset.tab === id;
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
      document.getElementById("panel-" + button.dataset.tab).hidden = !active;
    });
    updateHeading();
    return stale.has(id) ? renderTab(id) : Promise.resolve();
  }

  /* ---------- Create new ---------- */

  function bindCreateMenu() {
    const trigger = document.getElementById("create-btn");
    const wrap = el("div", "create");
    trigger.replaceWith(wrap);
    const menu = el("div", "create-menu");
    menu.hidden = true;
    const note = el("p", "create-note");
    note.setAttribute("role", "status");
    trigger.setAttribute("aria-expanded", "false");

    function show(open) {
      menu.hidden = !open;
      note.textContent = "";
      trigger.setAttribute("aria-expanded", String(open));
    }

    // [label, module API name]
    [["Deal", "Deals"], ["Account", "Accounts"], ["Contact", "Contacts"], ["Lead", "Leads"], ["Campaign", "Campaigns"]].forEach(function (item) {
      const option = el("button", "create-item", "New " + item[0].toLowerCase());
      option.type = "button";
      option.addEventListener("click", async function () {
        try {
          await zohoReady;
          await ZOHO.CRM.UI.Record.create({ Entity: item[1] });
          show(false);
        } catch (err) {
          console.warn("[widget] Create failed:", (err && err.message) || err);
          note.textContent = isEmbedded
            ? "Couldn't open the create form."
            : "Creating records works only inside Zoho CRM.";
        }
      });
      menu.appendChild(option);
    });
    menu.appendChild(note);
    wrap.append(trigger, menu);

    trigger.addEventListener("click", function () { show(menu.hidden); });
    document.addEventListener("click", function (e) { if (!wrap.contains(e.target)) show(false); });
    wrap.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { show(false); trigger.focus(); }
    });
  }

  /* ---------- Events ---------- */

  function bindEvents() {
    const buttons = Array.from(document.querySelectorAll(".tab"));
    buttons.forEach(function (button, i) {
      button.addEventListener("click", function () { switchTab(button.dataset.tab); });
      button.addEventListener("keydown", function (e) {
        const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        if (!step) return;
        const next = buttons[(i + step + buttons.length) % buttons.length];
        next.focus();
        switchTab(next.dataset.tab);
      });
    });

    const country = document.getElementById("country-select");
    const range = document.getElementById("date-select");
    country.value = Store.state.country;
    range.value = Store.state.range;
    country.addEventListener("change", function () { Store.setCountry(country.value); });
    range.addEventListener("change", function () { Store.setRange(range.value); });

    window.addEventListener("filters:changed", function () {
      // Keep the header selects in step when something else changed the filters.
      country.value = Store.state.country;
      range.value = Store.state.range;
      Object.keys(PAGE_NAMES).forEach(function (id) { stale.add(id); });
      updateHeading();
      renderTab(activeTab);
    });
    document.getElementById("refresh-btn").addEventListener("click", function () {
      Data.reset();
      Object.keys(PAGE_NAMES).forEach(function (id) { stale.add(id); });
      renderTab(activeTab);
    });
    bindCreateMenu();
    // TODO: actions for #global-search and #notifications-btn
  }

  // One look for every chart: dashed gridlines and a dark rounded tooltip. Data and datasets are untouched.
  function styleCharts() {
    if (!window.Chart || !Chart.defaults) return;
    Chart.defaults.set("scale", { grid: { color: "#E8EBF3" }, border: { dash: [4, 4] } });
    Chart.defaults.set("plugins.tooltip", { backgroundColor: "#111827", titleColor: "#fff", bodyColor: "#fff", cornerRadius: 10, padding: 10 });
  }

  // Runs after all tab scripts have registered.
  document.addEventListener("DOMContentLoaded", function () {
    styleCharts();
    initZoho();
    bindEvents();
    Object.keys(tabs).forEach(function (id) { tabs[id].mount(document.getElementById("panel-" + id)); });
    switchTab(activeTab);
  });

  return {
    registerTab: registerTab,
    switchTab: switchTab,
    coql: coql,
    getRelatedRecords: getRelatedRecords,
    allRecords: allRecords,
    stageValues: stageValues,
    fetchWithFallback: fetchWithFallback,
    formatINR: formatINR,
    formatINRFull: formatINRFull,
    formatPct: formatPct,
    formatCount: formatCount,
    isEmbedded: isEmbedded,
    el: el,
    card: card,
    horizontalBarRow: horizontalBarRow,
    pill: pill,
    sparkline: sparkline,
    legend: legend,
    attributionBars: attributionBars,
    periodText: periodText,
    optionText: optionText,
    optionSwitch: optionSwitch,
    splitLine: splitLine
  };
})();
