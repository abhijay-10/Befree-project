/* Reconciliation checks. They run after every render and console.warn on any mismatch. */
window.Checks = (function () {
  "use strict";

  const influencedSeen = {}; // "country|range" -> { tabId: displayed text }
  const results = {};        // check name -> { ok: true | false | null, detail }

  const sum = function (list) { return list.reduce(function (t, v) { return t + v; }, 0); };
  const same = function (a, b) { return Math.abs(a - b) < 1; };

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
    report("deals table rows = footer count", rows === shown && (!unfiltered || rows === data.dealCount),
      "rows " + rows + ", footer " + shown + (unfiltered ? ", data " + data.dealCount : " (filtered)"));
  }

  function atRisk(data) {
    const card = document.querySelector("#panel-overview [data-card='at-risk']");
    if (!card) return;
    const value = Number(card.dataset.riskValue), count = Number(card.dataset.riskCount);
    report("at-risk value <= total open pipeline", value <= data.kpis.pipelineValue,
      "at risk " + value + " vs pipeline " + data.kpis.pipelineValue);
    report("at-risk count <= open deals", count <= data.kpis.openDeals,
      "at risk " + count + " vs open " + data.kpis.openDeals);
  }

  // Checks for the added cards, comparing what they display.
  function newCards(tabId, data, state) {
    const panel = document.getElementById("panel-" + tabId);
    const where = state.country + " " + state.range + ": ";

    const card = panel.querySelector("[data-check='fc-forecast']");
    const kpi = panel.querySelector("[data-check='forecast']");
    if (card && kpi) {
      report("forecast card = Weighted forecast KPI", card.textContent === kpi.textContent,
        where + card.textContent + " vs " + kpi.textContent);
    }

    const counts = Array.from(panel.querySelectorAll("[data-check='stage-count']"), function (n) { return Number(n.textContent); });
    if (counts.length) {
      report("stage conversion counts = Sales funnel counts", counts.join() === data.funnel.join(),
        where + counts.join(",") + " vs " + data.funnel.join(","));
    }

    const fvt = data.forecastVsTarget;
    if (state.country === "ALL" && fvt.target !== null) {
      const targets = sum(fvt.byCountry.map(function (c) { return c.target || 0; }));
      report("sum of country targets = ALL target", same(targets, fvt.target), where + targets + " vs " + fvt.target);
    }

    if (tabId === "overview") atRisk(data);
  }

  function run(tabId, data, state) {
    newCards(tabId, data, state);
    const k = data.kpis;
    const where = state.country + " " + state.range + ": ";

    const services = sum(data.services.map(function (s) { return s.value; }));
    report("sum(services) = total pipeline", same(services, k.pipelineValue),
      where + services + " vs " + k.pipelineValue);

    const stages = sum(Object.keys(data.pipelineByStage).map(function (s) { return data.pipelineByStage[s]; }));
    report("sum(pipelineByStage) = total pipeline", same(stages, k.pipelineValue),
      where + stages + " vs " + k.pipelineValue);

    // Needs every country, so it only runs when the filter is All countries.
    let countries = null, all = null;
    if (state.country === "ALL") {
      countries = sum(data.pipelineByCountry.map(function (c) { return c.value; }));
      all = k.pipelineValue;
    }
    report("sum of country pipelines = ALL pipeline", countries === null ? null : same(countries, all),
      where + countries + " vs " + all);

    // Compares what Tab 1 and Tab 3 actually displayed for the same filters.
    const shown = document.querySelector("#panel-" + tabId + " [data-check='influenced']");
    if (shown) {
      const key = state.country + "|" + state.range;
      const seen = influencedSeen[key] = influencedSeen[key] || {};
      seen[tabId] = shown.textContent;
      const both = seen.overview !== undefined && seen.marketing !== undefined;
      report("influenced pipeline: Tab 1 KPI = Tab 3 KPI", both ? seen.overview === seen.marketing : null,
        where + (seen.overview || "not opened") + " vs " + (seen.marketing || "not opened"));
    }

    const funnelOpen = data.funnel[0] - data.funnel[data.funnel.length - 1];
    report("funnel open deals = Open deals KPI", funnelOpen === k.openDeals,
      where + "funnel " + funnelOpen + " vs KPI " + k.openDeals);

    if (tabId === "overview") table(data);
  }

  return { run: run, table: table, atRisk: atRisk, results: results };
})();
