/*
 * Revenue Forecast calculations. Pure functions over the deals the dashboard already loaded (Data's deal objects):
 *   amount  - Amount in ₹ (missing = 0)
 *   group   - "confirmed" (Won), "unconfirmed" (Open) or "lost" (Lost), decided by Stage
 *   bucket  - the stage % of an open deal (10, 25, 50, 75, 90), or null for a stage that is not mapped
 *   close   - Closing Date (YYYY-MM-DD); closedOn - the day a won or lost deal counts as closed
 * Dates use the browser's own time zone. Nothing is rounded here; rounding happens only when shown.
 */
(function (root) {
  "use strict";

  const day = function (d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
  const addDays = function (d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); };
  function parseDay(v) {
    if (!v) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    const d = new Date(v);
    return isNaN(d) ? null : day(d);
  }
  const amountOf = function (d) { const n = Number(d.amount); return Number.isFinite(n) ? n : 0; };
  // Each deal once (by id)
  function once(deals) {
    const seen = new Set();
    return (deals || []).filter(function (d) { if (!d || seen.has(d.id)) return false; seen.add(d.id); return true; });
  }
  const wonDay = function (d) { return parseDay(d.closedOn || d.close); };
  const won = function (deals) { return once(deals).filter(function (d) { return d.group === "confirmed" && wonDay(d); }); };
  const open = function (deals) { return once(deals).filter(function (d) { return d.group === "unconfirmed" && parseDay(d.close); }); };
  const sumOf = function (list, f) { return list.reduce(function (t, d) { return t + f(d); }, 0); };
  const weighted = function (d) { return d.bucket === null || d.bucket === undefined ? 0 : amountOf(d) * Number(d.bucket) / 100; };

  // 1. Won revenue: won deals whose closing day is in the last `days` days, today included
  function wonRevenue(deals, days, now) {
    const today = day(now || new Date()), from = addDays(today, 1 - days), to = addDays(today, 1);
    const list = won(deals).filter(function (d) { const w = wonDay(d); return w >= from && w < to; });
    return { amount: sumOf(list, amountOf), count: list.length };
  }

  // Open deals closing from today through the next `days` days (the same window as the Overview's other forecast)
  function eligibleOpen(deals, days, now) {
    const today = day(now || new Date()), to = addDays(today, days);
    return open(deals).filter(function (d) { const c = parseDay(d.close); return c >= today && c < to; });
  }
  // 2. Pipeline forecast: amount × stage % / 100 (a stage that is not mapped adds nothing)
  function pipelineForecast(deals, days, now) {
    const list = eligibleOpen(deals, days, now);
    return { amount: sumOf(list, weighted), count: list.length };
  }
  // 4. Best case: the same open deals at their full amount
  function bestCase(deals, days, now) {
    const list = eligibleOpen(deals, days, now);
    return { amount: sumOf(list, amountOf), count: list.length };
  }

  // Won revenue in each of the last 6 completed months, oldest first
  function wonByMonth(deals, now) {
    const t = now || new Date(), all = won(deals);
    return [6, 5, 4, 3, 2, 1].map(function (k) {
      const from = new Date(t.getFullYear(), t.getMonth() - k, 1), to = new Date(t.getFullYear(), t.getMonth() - k + 1, 1);
      const list = all.filter(function (d) { const w = wonDay(d); return w >= from && w < to; });
      return { from: from, amount: sumOf(list, amountOf), count: list.length };
    });
  }
  // 3. Trend prediction: least squares on x = 1..6 (monthly won revenue), predicted at x = 7, never below 0.
  //    Fewer than 3 months with revenue: no prediction.
  function trendPrediction(deals, now) {
    const months = wonByMonth(deals, now), n = months.length;
    const xs = months.map(function (_, i) { return i + 1; }), ys = months.map(function (m) { return m.amount; });
    const withRevenue = ys.filter(function (y) { return y > 0; }).length;
    if (withRevenue < 3) return { ok: false, months: months, withRevenue: withRevenue };
    const sx = xs.reduce(function (a, b) { return a + b; }, 0), sy = ys.reduce(function (a, b) { return a + b; }, 0);
    const sxy = xs.reduce(function (a, x, i) { return a + x * ys[i]; }, 0), sxx = xs.reduce(function (a, x) { return a + x * x; }, 0);
    const m = (n * sxy - sx * sy) / (n * sxx - sx * sx), b = (sy - m * sx) / n;
    return { ok: true, months: months, withRevenue: withRevenue, slope: m, intercept: b, predicted: Math.max(0, m * 7 + b),
             line: xs.concat(7).map(function (x) { return Math.max(0, m * x + b); }) };
  }

  // Chart: 6 completed months of won revenue, then this month and the next two with the pipeline forecast of open deals
  // closing in each (from today on). The two series are kept apart.
  function chartData(deals, now) {
    const t = now || new Date(), today = day(t), list = open(deals);
    const past = wonByMonth(deals, t);
    const future = [0, 1, 2].map(function (k) {
      const from = new Date(t.getFullYear(), t.getMonth() + k, 1), to = new Date(t.getFullYear(), t.getMonth() + k + 1, 1);
      const inMonth = list.filter(function (d) { const c = parseDay(d.close); return c >= (k ? from : today) && c < to; });
      return { from: from, amount: sumOf(inMonth, weighted), best: sumOf(inMonth, amountOf), count: inMonth.length };
    });
    return { past: past, future: future, trend: trendPrediction(deals, t) };
  }

  // Open deals whose closing date has passed, and open deals with no closing date: not in any forecast
  function leftOut(deals, now) {
    const today = day(now || new Date());
    const all = once(deals).filter(function (d) { return d.group === "unconfirmed"; });
    return {
      overdue: all.filter(function (d) { const c = parseDay(d.close); return c && c < today; }).length,
      noDate: all.filter(function (d) { return !parseDay(d.close); }).length
    };
  }

  const api = { wonRevenue: wonRevenue, pipelineForecast: pipelineForecast, bestCase: bestCase, trendPrediction: trendPrediction,
                wonByMonth: wonByMonth, chartData: chartData, leftOut: leftOut, parseDay: parseDay };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.RevenueForecastCalc = api;
})(this);
