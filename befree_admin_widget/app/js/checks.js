/* Reconciliation checks. They run after every render and console.warn on any mismatch. */
window.Checks = (function () {
  "use strict";

  const influencedSeen = {}; // "country|range" -> { tabId: displayed text }
  const results = {};        // check name -> { ok: true | false | null, detail }

  const sum = function (list) { return list.reduce(function (t, v) { return t + v; }, 0); };
  const same = function (a, b) { return Math.abs(a - b) < 0.01; }; // to the paisa

  function report(name, ok, detail) {
    results[name] = { ok: ok, detail: detail };
    if (ok === false) console.warn("[check] " + name + " mismatch: " + detail);
  }

  function table(data) {
    const body = document.querySelector("#panel-overview [data-check='deal-rows']");
    const footer = document.querySelector("#panel-overview [data-check='deal-count']");
    if (!body || !footer) return;
    const rows = Number(body.dataset.count);
    const shown = parseInt(footer.textContent, 10);
    const unfiltered = body.dataset.filtered === "false";
    report("confirmed table rows = footer count = Confirmed KPI", rows === shown && (!unfiltered || rows === data.kpis.confirmedCount),
      "rows " + rows + ", footer " + shown + (unfiltered ? ", KPI " + data.kpis.confirmedCount : " (filtered)"));
  }

  function atRisk(data) {
    const card = document.querySelector("#panel-overview [data-card='at-risk']");
    if (!card) return;
    const value = Number(card.dataset.riskValue), count = Number(card.dataset.riskCount);
    report("at-risk value <= unconfirmed amount", value <= data.kpis.unconfirmedAmount + 0.01,
      "at risk " + value + " vs unconfirmed " + data.kpis.unconfirmedAmount);
    report("at-risk count <= unconfirmed deals", count <= data.kpis.unconfirmedCount,
      "at risk " + count + " vs unconfirmed " + data.kpis.unconfirmedCount);
  }

  function run(tabId, data, state) {
    const k = data.kpis;
    const where = state.country + " " + state.range + ": ";

    const services = sum(data.services.map(function (s) { return s.value; }));
    report("sum(services) = confirmed amount", same(services, k.confirmedAmount), where + services + " vs " + k.confirmedAmount);
    const shares = sum(data.services.map(function (s) { return s.deals; }));
    report("service deal shares = confirmed deals", same(shares, k.confirmedCount), where + shares + " vs " + k.confirmedCount);

    const buckets = Object.keys(data.byBucket).map(function (b) { return data.byBucket[b]; });
    const bucketCount = sum(buckets.map(function (b) { return b.count; }));
    const bucketAmount = sum(buckets.map(function (b) { return b.amount; }));
    report("stage counts = Unconfirmed deals KPI", bucketCount === k.unconfirmedCount, where + bucketCount + " vs " + k.unconfirmedCount);
    report("stage amounts = Unconfirmed amount KPI", same(bucketAmount, k.unconfirmedAmount), where + bucketAmount + " vs " + k.unconfirmedAmount);

    // Won only + Open only = Won + Open, and the parts of each option add up to its total.
    const o = data.options;
    ["count", "amount", "sourced"].forEach(function (f) {
      report("won + open = Won + Open (" + f + ")", same(o.won[f] + o.open[f], o.wonOpen[f]),
        where + o.won[f] + " + " + o.open[f] + " vs " + o.wonOpen[f]);
    });
    if (o.wonOpen.influenced !== null) {
      report("won + open = Won + Open (influenced)", same(o.won.influenced + o.open.influenced, o.wonOpen.influenced),
        where + o.won.influenced + " + " + o.open.influenced + " vs " + o.wonOpen.influenced);
    }
    Object.keys(o).forEach(function (name) {
      const b = o[name];
      report(name + ": countries add up", same(sum(b.byCountry.map(function (c) { return c.value; })), b.amount), where + name);
      report(name + ": services add up", same(sum(b.services.map(function (s) { return s.value; })), b.amount), where + name);
    });
    report("Won only = Confirmed amount KPI", same(o.won.amount, k.confirmedAmount), where + o.won.amount + " vs " + k.confirmedAmount);
    report("Open only = Unconfirmed amount KPI", same(o.open.amount, k.unconfirmedAmount), where + o.open.amount + " vs " + k.unconfirmedAmount);
    document.querySelectorAll("#panel-" + tabId + " [data-check^='switch-'][data-rows-total]").forEach(function (card) {
      report(card.dataset.check + " bars = card total (" + card.dataset.option + ")",
        same(Number(card.dataset.rowsTotal), Number(card.dataset.total)), where + card.dataset.rowsTotal + " vs " + card.dataset.total);
    });

    if (data.mkt) {
      report("marketing revenue KPI = sourced Won only", same(data.mkt.wonAmount, o.won.sourced), where + data.mkt.wonAmount + " vs " + o.won.sourced);
      report("marketing pipeline KPI = sourced open deals", same(data.mkt.openAmount, o.open.sourced), where + data.mkt.openAmount + " vs " + o.open.sourced);
      if (data.mkt.leads !== null) {
        const byChannel = sum(data.mkt.byChannel.map(function (c) { return c.leads; }));
        report("leads by channel add up to new leads", byChannel === data.mkt.leads, where + byChannel + " vs " + data.mkt.leads);
      }
    }
    const channels = sum(data.attribution.map(function (c) { return c.sourced; }));
    report("sum(channels) = confirmed amount", same(channels, k.confirmedAmount), where + channels + " vs " + k.confirmedAmount);

    // Needs every country, so it only runs when the filter is All countries.
    let countries = null;
    if (state.country === "ALL") countries = sum(o.won.byCountry.map(function (c) { return c.value; }));
    report("sum of country confirmed amounts = ALL", countries === null ? null : same(countries, k.confirmedAmount),
      where + countries + " vs " + k.confirmedAmount);

    const fvt = data.forecastVsTarget;
    if (state.country === "ALL" && fvt.target !== null) {
      const targets = sum(fvt.byCountry.map(function (c) { return c.target || 0; }));
      report("sum of country targets = ALL target", same(targets, fvt.target), where + targets + " vs " + fvt.target);
    }

    // Compares what Tab 1 and Tab 3 actually displayed for the same filters.
    // Tab 3's card can show Won + Open; it is compared only while it shows Won only.
    const shown = document.querySelector("#panel-" + tabId + " [data-check='influenced']");
    const switched = shown && shown.closest("[data-option]");
    if (shown && (!switched || switched.dataset.option === "won")) {
      const key = state.country + "|" + state.range;
      const seen = influencedSeen[key] = influencedSeen[key] || {};
      seen[tabId] = shown.textContent;
      const both = seen.overview !== undefined && seen.marketing !== undefined;
      report("influenced: Tab 1 KPI = Tab 3 KPI", both ? seen.overview === seen.marketing : null,
        where + (seen.overview || "not opened") + " vs " + (seen.marketing || "not opened"));
    }

    const heat = document.querySelector("#panel-" + tabId + " [data-check='temperature']");
    if (heat && data.leads) {
      report("lead temperature total = open leads", Number(heat.dataset.total) === data.leads.open,
        where + heat.dataset.total + " vs " + data.leads.open);
    }

    if (tabId === "overview") {
      atRisk(data);
      table(data);
    }
  }

  return { run: run, table: table, atRisk: atRisk, results: results };
})();
