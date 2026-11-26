/*
 * The one data layer. Tabs receive its output; they never fetch or aggregate by themselves.
 * Zoho CRM data produces one raw record per country, and build() turns those into the view data,
 * so "All countries" is always a sum and every ratio is recalculated from sums.
 * There is no sample data: if CRM can't be read, every figure is empty.
 */
window.Data = (function () {
  "use strict";

  const CODES = ["US", "UK", "AU"];
  // Records without a US, UK or AU country ("Country not set"). Part of All countries, and a filter of its own.
  const OTHER_COUNTRY = "Other";
  // null = All time (no start date).
  const RANGE_DAYS = { "7d": 7, "30d": 30, "90d": 90, "12m": 365, "all": null };

  // `label` is the long tile name; `name` is the Service_Line value on a deal.
  const SERVICES = [
    { key: "accounting",   label: "Accounting Services",    name: "Accounting",       color: "#2352E5" },
    { key: "bookkeeping",  label: "Bookkeeping Services",   name: "Bookkeeping",      color: "#5B7FE8" },
    { key: "payroll",      label: "Payroll Services",       name: "Payroll",          color: "#93A9F0" },
    { key: "tax",          label: "Tax Services",           name: "Tax",              color: "#16A06B" },
    { key: "audit",        label: "Audit Support Services", name: "Audit Support",    color: "#E8890C" },
    { key: "paraplanning", label: "Paraplanning Services",  name: "Paraplanning",     color: "#D64545" },
    { key: "mortgage",     label: "Mortgage Services",      name: "Mortgage Support", color: "#8D9FC9" },
    { key: "virtualadmin", label: "Virtual Admin Services", name: "Virtual Admin",    color: "#7C5CE0" }
  ];
  const OTHER = { key: "other", label: "No service / other", name: "No service", color: "#C4C9D4" };
  // Amount of each service on a deal (Deals fields, as used by the Deals widget). Same currency as Amount.
  const SERVICE_AMOUNT_FIELDS = {
    accounting: "Accounting_Services_Amount", bookkeeping: "Bookkeeping_Services_Amount", payroll: "Payroll_Services_Amount",
    tax: "Tax_Services_Amount", audit: "Audit_Support_Services_Amount", paraplanning: "Paraplanning_Services_Amount",
    mortgage: "Mortgage_Services_Amount", virtualadmin: "Virtual_Admin_Services_Amount"
  };

  // The two choices of the cards with a Won / Won + Open switch.
  const OPTIONS = { won: "Won only", wonOpen: "Won + Open" };

  // Replaced by the Deals stages of this CRM as soon as they are read (see setStages).
  const STAGES = [
    { name: "Qualified", prob: 10 },
    { name: "Needs confirmed", prob: 25 },
    { name: "Proposal presented", prob: 50 },
    { name: "Agreement sent", prob: 75 },
    { name: "Verbal commitment", prob: 90 },
    { name: "Closed-won", prob: 100 }
  ];
  const WON = "Closed-won";
  const LOST = "Closed-lost";

  /*
   * The one deal rule, decided by stage name (never by the editable Probability field):
   * Confirmed = Closed-won. Unconfirmed = an open stage, put in one of these buckets. Lost = neither.
   * An open stage missing from STAGE_BUCKET is still unconfirmed and shows as "Not mapped".
   */
  const BUCKETS = [10, 25, 50, 75, 90];
  const BUCKET_NAMES = { 10: "Qualified", 25: "Needs confirmed", 50: "Proposal presented", 75: "Agreement sent", 90: "Verbal commitment" };
  // Keys are stage names without spaces, capitals or punctuation. TODO: confirm the bucket of each CRM stage.
  const STAGE_BUCKET = {
    qualified: 10, qualification: 10,
    needsconfirmed: 25, needsanalysis: 25,
    proposalpresented: 50, valueproposition: 50, iddecisionmakers: 50, identifydecisionmakers: 50,
    agreementsent: 75, proposalpricequote: 75,
    verbalcommitment: 90, negotiationreview: 90
  };

  // Last entry collects confirmed amounts whose source matches no channel, so the channels add up to the total.
  const OTHER_CHANNEL = "Other / not set";
  const CHANNELS = ["Email", "Webinars", "Events", "LinkedIn Organic", "LinkedIn Ads", "Google Ads", "Website", "Social Media", OTHER_CHANNEL];

  /* ================= Helpers ================= */

  // null in, null out: a figure that is unknown for one country is unknown for the total.
  function add(values) {
    return values.some(function (v) { return v === null || v === undefined; })
      ? null
      : values.reduce(function (t, v) { return t + v; }, 0);
  }
  const sum = function (list, fn) { return list.reduce(function (t, x) { return t + (fn(x) || 0); }, 0); };
  const ratio = function (a, b) { return a === null || !b ? null : a / b; };
  const unique = function (list) { return Array.from(new Set(list.filter(Boolean))); };

  function serviceKey(name) {
    const n = String(name || "").trim().toLowerCase();
    const s = SERVICES.find(function (x) {
      return x.name.toLowerCase() === n || x.label.toLowerCase() === n || x.key === n;
    });
    return s ? s.key : OTHER.key;
  }

  /*
   * The one service-line aggregation. Takes service lists ([{key, value, deals, dealCount}]) and returns
   * one row per service. `deals` is the deal share (1/n for a deal with n services), so the shares add up
   * to the number of deals; `dealCount` is how many deals include the service.
   */
  function serviceTotals(lists) {
    const rows = lists.flat();
    const catalogue = rows.some(function (r) { return r.key === OTHER.key; }) ? SERVICES.concat(OTHER) : SERVICES;
    return catalogue.map(function (s) {
      const mine = rows.filter(function (r) { return r.key === s.key; });
      return {
        key: s.key, label: s.label, name: s.name, color: s.color,
        value: sum(mine, function (r) { return r.value; }),
        deals: sum(mine, function (r) { return r.deals; }),
        dealCount: sum(mine, function (r) { return r.dealCount; })
      };
    });
  }

  // Percentages to 1 decimal that add up to exactly 100 (largest remainder).
  function shares(values) {
    const total = values.reduce(function (t, v) { return t + v; }, 0);
    if (!total) return values.map(function () { return 0; });
    const tenths = values.map(function (v) { return v / total * 1000; });
    const floors = tenths.map(Math.floor);
    let short = 1000 - floors.reduce(function (t, v) { return t + v; }, 0);
    tenths.map(function (v, i) { return [v - floors[i], i]; })
      .sort(function (a, b) { return b[0] - a[0] || a[1] - b[1]; })
      .forEach(function (r) { if (short > 0) { floors[r[1]]++; short--; } });
    return floors.map(function (v) { return v / 10; });
  }

  function signed(value, decimals, suffix) {
    return (value >= 0 ? "+" : "") + value.toFixed(decimals) + (suffix === undefined ? "%" : suffix);
  }
  // Percentage change, or undefined when there is nothing to compare with.
  function change(current, previous, decimals) {
    if (current === null || !previous) return undefined;
    return signed((current / previous - 1) * 100, decimals || 0);
  }

  const SLA_MINUTES = 60;
  const STUCK_DAYS = 30;
  const LEAD_SOURCES = ["Website", "Google Ads", "LinkedIn Ads", "Email", "Webinars", "Events"];

  /* ================= Added cards: calculations ================= */

  function median(values) {
    if (!values.length) return null;
    const v = values.slice().sort(function (a, b) { return a - b; });
    const mid = Math.floor(v.length / 2);
    return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
  }

  // Actual (confirmed this quarter) against target. Open deals are not added.
  function attainment(target, closedWon) {
    return {
      target: target,
      closedWon: closedWon,
      gap: Math.max(0, (target || 0) - closedWon),
      pct: target ? closedWon / target * 100 : null
    };
  }

  function forecastVsTarget(raws) {
    const t = function (key) { return add(raws.map(function (r) { return r[key]; })); };
    const total = attainment(t("target"), t("closedWonQuarter"));
    total.byCountry = raws.map(function (r) {
      return Object.assign({ country: r.code }, attainment(r.target, r.closedWonQuarter));
    });
    return total;
  }

  // Splits an amount into n parts, to the paisa, that add up exactly to the amount.
  function splitAmount(amount, n) {
    const paise = Math.round(amount * 100);
    const base = Math.floor(paise / n);
    const rest = paise - base * n;
    return Array.from({ length: n }, function (_, i) { return (base + (i < rest ? 1 : 0)) / 100; });
  }

  /*
   * How one deal's amount is shared between its services (worked out once per deal, in toDeal):
   * the per-service amount fields when every service has one and they add up exactly to Amount;
   * otherwise Amount split equally. Either way the parts add up exactly to the deal amount.
   */
  const paise = function (v) { return Math.round(v * 100); };
  function fitsAmount(given, rawAmount) {
    return given.every(function (v) { return v !== null; }) &&
      paise(given.reduce(function (t, v) { return t + v; }, 0)) === paise(rawAmount);
  }
  // Converts each part to ₹ to the paisa; any rounding difference goes to the largest part, so they add up to `total`.
  function convertParts(given, total, home) {
    const parts = given.map(function (v) { return paise(home(v)); });
    const diff = paise(total) - parts.reduce(function (t, v) { return t + v; }, 0);
    let big = 0;
    parts.forEach(function (v, i) { if (v > parts[big]) big = i; });
    parts[big] += diff;
    return parts.map(function (v) { return v / 100; });
  }

  // A deal's share of each service; in deal counts it is 1/n per service, so a deal counts once in total.
  function serviceParts(deals) {
    const out = [];
    deals.forEach(function (d) {
      d.serviceKeys.forEach(function (k, i) {
        out.push({ key: k, value: d.parts[i], deals: 1 / d.serviceKeys.length, dealCount: 1 });
      });
    });
    return out;
  }

  /* ================= The one selection rule ================= */

  // Start of the selected period: "last N days" = today and the N-1 days before it, from local midnight.
  // All time has no start.
  function periodStart(range, now) {
    if (!(range in RANGE_DAYS)) throw new Error("Unknown date range: " + range);
    const days = RANGE_DAYS[range];
    if (days === null) return null;
    const d = now || new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() - (days - 1));
  }

  function inCountry(deal, country) {
    if (!country || country === "ALL") return true;
    return country === OTHER_COUNTRY ? !deal.country : deal.country === country;
  }

  /*
   * Every card chooses its deals here, so the same filters always give the same numbers.
   * opts.country: ALL, US, UK, AU or Other. opts.from: period start (null = all time).
   * opts.option: "won" = Closed-won with a Closing Date in the period;
   *              "open" = open deals today (10% to 90%), never hidden by the date filter;
   *              "wonOpen" = both. Lost deals are never included, and each deal appears once.
   */
  function pickDeals(deals, opts) {
    const mine = deals.filter(function (d) { return inCountry(d, opts.country); });
    const won = mine.filter(function (d) {
      return d.group === "confirmed" && d.closedOn && (!opts.from || within(d.closedOn, opts.from));
    });
    const open = mine.filter(function (d) { return d.group === "unconfirmed"; });
    if (opts.option === "won") return won;
    if (opts.option === "open") return open;
    if (opts.option === "wonOpen") return won.concat(open);
    throw new Error("Unknown option: " + opts.option);
  }

  // Figures of one option for the switch cards: total, per country, per service, sourced and influenced.
  function optionBlock(list, codes, influenceKnown) {
    const amount = function (l) { return sum(l, function (d) { return d.amount; }); };
    return {
      count: list.length,
      amount: amount(list),
      byCountry: codes.map(function (c) {
        return { label: c, value: amount(list.filter(function (d) { return inCountry(d, c); })) };
      }),
      services: serviceTotals([serviceParts(list)]),
      // Marketing channels only; deals under "Other / not set" are not marketing-sourced.
      sourced: amount(list.filter(function (d) { return d.source !== OTHER_CHANNEL; })),
      // A deal with several engaged channels counts once.
      influenced: influenceKnown ? amount(list.filter(function (d) { return d.channels.length > 0; })) : null
    };
  }

  function stageBucket(stage) {
    const b = STAGE_BUCKET[norm(stage)];
    return b === undefined ? null : b;
  }
  function dealGroup(stage) {
    return stage === WON ? "confirmed" : stage === LOST ? "lost" : "unconfirmed";
  }

  // Unconfirmed deals per bucket; "none" holds open stages that are not mapped.
  function bucketTotals(deals) {
    const out = {};
    BUCKETS.concat("none").forEach(function (b) { out[b] = { count: 0, amount: 0, stages: [] }; });
    deals.forEach(function (d) {
      const row = out[d.bucket === null ? "none" : d.bucket];
      row.count++;
      row.amount += d.amount;
      if (row.stages.indexOf(d.stage) === -1) row.stages.push(d.stage);
    });
    return out;
  }

  // Local calendar date as YYYY-MM-DD (toISOString would give the UTC date).
  function localDay(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  // Counts come from the same funnel as the Overview; days are weighted by count.
  function stageConversion(funnel, raws) {
    const steps = STAGES.map(function (s, i) {
      let weight = 0, days = 0;
      raws.forEach(function (r) {
        if (!r.stageDays || r.stageDays[i] === null) return;
        weight += r.funnel[i];
        days += r.funnel[i] * r.stageDays[i];
      });
      return {
        stage: s.name,
        count: funnel[i],
        avgDays: weight ? days / weight : null,
        conversion: i && funnel[i - 1] ? funnel[i] / funnel[i - 1] * 100 : null
      };
    });
    const converting = steps.filter(function (s) { return s.conversion !== null; });
    const timed = steps.filter(function (s) { return s.avgDays !== null; });
    const first = converting.slice().sort(function (a, b) { return a.conversion - b.conversion; })[0];
    return {
      steps: steps,
      overall: funnel[0] ? funnel[funnel.length - 1] / funnel[0] * 100 : null,
      biggestDrop: first && first.conversion < 100 ? first.stage : null,
      slowest: timed.slice().sort(function (a, b) { return b.avgDays - a.avgDays; })[0] || null
    };
  }

  function mediansBy(leads, key, order) {
    const groups = new Map((order || []).map(function (k) { return [k, []]; }));
    leads.forEach(function (l) {
      if (l.responseMinutes === null) return;
      const k = l[key] || "Unknown";
      if (!groups.has(k)) { if (order) return; groups.set(k, []); }
      groups.get(k).push(l.responseMinutes);
    });
    return Array.from(groups, function (g) { return { label: g[0], median: median(g[1]), count: g[1].length }; })
      .filter(function (g) { return g.count; });
  }

  // Medians always come from the combined lead-level times, never from other medians.
  function responseStats(raws, labels) {
    const leads = raws.reduce(function (all, r) { return all.concat(r.leads || []); }, []);
    const times = leads.map(function (l) { return l.responseMinutes; }).filter(function (v) { return v !== null; });
    const byOwner = mediansBy(leads, "owner").sort(function (a, b) { return b.median - a.median; });
    return {
      sla: SLA_MINUTES,
      leadCount: leads.length,
      median: median(times),
      withinSla: times.length ? times.filter(function (v) { return v <= SLA_MINUTES; }).length / times.length * 100 : null,
      awaiting: leads.length - times.length,
      slowest: byOwner[0] || null,
      byOwner: byOwner,
      bySource: mediansBy(leads, "source", LEAD_SOURCES),
      trend: labels.map(function (label, i) {
        return {
          label: label,
          median: median(raws.reduce(function (all, r) {
            return all.concat((r.responseHistory && r.responseHistory[i]) || []);
          }, []))
        };
      }),
      rows: leads
    };
  }

  function channelTrend(raws, range) {
    const length = raws[0].channelHistory.sourced[0].length;
    const count = Math.min(range === "12m" ? 12 : 6, length);
    const names = raws[0].monthLabels12;
    const sumOf = function (key) {
      return CHANNELS.map(function (_, c) {
        const out = [];
        for (let m = length - count; m < length; m++) {
          out.push(raws.reduce(function (t, r) { return t + r.channelHistory[key][c][m]; }, 0));
        }
        return out;
      });
    };
    return { channels: CHANNELS, labels: names.slice(-count), sourced: sumOf("sourced"), influenced: sumOf("influenced") };
  }

  const wholeDays = function (from, to) {
    return Math.floor((new Date(to + "T00:00:00Z") - new Date(from + "T00:00:00Z")) / 864e5);
  };

  // Unconfirmed deals matching any rule, each listed once; the most severe reason leads (overdue, stuck, no activity).
  function atRisk(deals, thresholdDays, asOf) {
    const open = deals.filter(function (d) { return dealGroup(d.stage) === "unconfirmed"; });
    const rows = [];
    open.forEach(function (d) {
      const idle = d.lastActivityDate ? wholeDays(d.lastActivityDate, asOf) : null;
      const inStage = d.stageEnteredDate ? wholeDays(d.stageEnteredDate, asOf) : null;
      const late = d.close ? wholeDays(d.close, asOf) : 0;
      const reasons = [];
      if (late > 0) {
        reasons.push({ severity: 3, type: "red", label: "Overdue", detail: "Close date " + d.close + " passed " + late + " days ago and the deal is still open." });
      }
      if (inStage !== null && inStage > STUCK_DAYS) {
        reasons.push({ severity: 2, type: "orange", label: "Stuck in stage " + inStage + "d", detail: "In " + d.stage + " for " + inStage + " days (limit " + STUCK_DAYS + ")." });
      }
      if (idle !== null && idle > thresholdDays) {
        reasons.push({ severity: 1, type: "orange", label: "No activity " + idle + "d", detail: "No logged activity for " + idle + " days (limit " + thresholdDays + ")." });
      }
      if (!reasons.length) return;
      rows.push({
        deal: d,
        idle: idle,
        severity: reasons[0].severity,
        type: reasons[0].type,
        label: reasons[0].label + (reasons.length > 1 ? " +" + (reasons.length - 1) : ""),
        detail: reasons.map(function (r) { return r.detail; }).join(" ")
      });
    });
    rows.sort(function (a, b) { return b.severity - a.severity || b.deal.amount - a.deal.amount; });
    const value = sum(rows, function (r) { return r.deal.amount; });
    // Both sides of the share come from the deals list, so it cannot exceed 100%.
    const openValue = sum(open, function (d) { return d.amount; });
    return {
      rows: rows, count: rows.length, value: value, openCount: open.length, pct: openValue ? value / openValue * 100 : null,
      stageDatesKnown: open.some(function (d) { return d.stageEnteredDate; })
    };
  }

  /* ================= Leads ================= */

  function emptyLeads() {
    return {
      total: null, created: null, prevCreated: null, open: null, lost: null, moved: null, movedPeriod: null, otherConverted: null,
      movedElsewhere: null, movedMissing: null,
      byStatus: {}, months: lastMonths(6).map(function (m) { return { label: m.label, created: 0, moved: 0 }; })
    };
  }

  // Sums the per-country lead figures.
  function leadTotals(raws) {
    const t = function (key) { return add(raws.map(function (r) { return r.leadStats[key]; })); };
    const byStatus = {};
    raws.forEach(function (r) {
      Object.keys(r.leadStats.byStatus).forEach(function (k) { byStatus[k] = (byStatus[k] || 0) + r.leadStats.byStatus[k]; });
    });
    const total = t("total"), moved = t("moved"), created = t("created");
    return {
      total: total, created: created, open: t("open"), lost: t("lost"), moved: moved, movedPeriod: t("movedPeriod"), otherConverted: t("otherConverted"),
      movedElsewhere: t("movedElsewhere"), movedMissing: t("movedMissing"),
      createdDelta: change(created, t("prevCreated")),
      rate: total === null || moved === null || !total ? null : moved / total * 100,
      byStatus: Object.keys(byStatus).map(function (k) { return { label: k, count: byStatus[k] }; })
        .sort(function (a, b) { return b.count - a.count || a.label.localeCompare(b.label); }),
      months: raws[0].leadStats.months.map(function (m, i) {
        return {
          label: m.label,
          created: raws.reduce(function (x, r) { return x + r.leadStats.months[i].created; }, 0),
          moved: raws.reduce(function (x, r) { return x + r.leadStats.months[i].moved; }, 0)
        };
      })
    };
  }

  // One row of the country comparison.
  function countryRow(r) {
    const won = sum(r.months, function (m) { return m.won; }), lost = sum(r.months, function (m) { return m.lost; });
    return {
      code: r.code, created: r.leadStats.created, open: r.leadStats.open, moved: r.leadStats.moved,
      confirmedDeals: r.confirmedCount, confirmedAmount: r.confirmedAmount,
      won: won, lost: lost, winRate: won + lost ? won / (won + lost) * 100 : null
    };
  }

  /* ================= Aggregation ================= */

  // Sums per-country raw records. Flow metrics are already limited to the date range.
  function build(raws, state, source) {
    const total = function (fn) { return add(raws.map(fn)); };
    const flow = function (v) { return v === null || v === undefined ? null : Math.round(v); };
    const m = function (key) { return total(function (r) { return r.marketing[key]; }); };
    const p = function (key) { return total(function (r) { return r.previous[key]; }); };

    // The switch cards (Won only / Won + Open), all chosen by pickDeals from the deals of the selected countries.
    const deals = raws.reduce(function (all, r) { return all.concat(r.deals); }, []);
    const from = periodStart(state.range);
    const influenceKnown = raws.every(function (r) { return r.influenced !== null; });
    const codes = raws.map(function (r) { return r.code; });
    const options = {};
    ["won", "open", "wonOpen"].forEach(function (o) {
      options[o] = optionBlock(pickDeals(deals, { from: from, option: o }), codes, influenceKnown);
    });

    const influenced = options.won.influenced; // counted once per deal

    const confirmedAmount = total(function (r) { return r.confirmedAmount; });
    const confirmedCount = total(function (r) { return r.confirmedCount; });
    const unconfirmedAmount = total(function (r) { return r.unconfirmedAmount; });
    const unconfirmedCount = total(function (r) { return r.unconfirmedCount; });
    const weighted = total(function (r) { return r.weighted; });
    const newAccounts = total(function (r) { return r.newAccounts; });
    const won = total(function (r) { return r.win.won; });
    const closed = total(function (r) { return r.win.closed; });
    const winRate = closed ? won / closed * 100 : null;
    const prevWon = total(function (r) { return r.previous.win && r.previous.win.won; });
    const prevClosed = total(function (r) { return r.previous.win && r.previous.win.closed; });

    // Element-wise sum of a sparkline across countries; empty when any country lacks it.
    function series(key) {
      const lists = raws.map(function (r) { return r.spark[key]; });
      if (lists.some(function (l) { return !l || !l.length; })) return [];
      return lists[0].map(function (_, i) { return lists.reduce(function (t, l) { return t + l[i]; }, 0); });
    }
    const winLists = raws.map(function (r) { return r.spark.win || []; });
    const winSpark = winLists[0].map(function (_, i) {
      const w = winLists.reduce(function (t, l) { return t + l[i].won; }, 0);
      const c = winLists.reduce(function (t, l) { return t + l[i].closed; }, 0);
      return c ? w / c * 100 : null;
    }).filter(function (v) { return v !== null; });

    const delta = {
      winRate: winRate !== null && prevClosed ? signed(winRate - prevWon / prevClosed * 100, 1) : undefined,
      newAccounts: change(newAccounts, p("newAccounts")),
      influenced: change(influenced, p("influenced"))
    };

    const sourced = options.won.sourced;
    const leads = m("leads"), mql = m("mql"), sql = m("sql"), spend = m("spend");
    const prevLeads = p("leads"), prevMql = p("mql"), prevSql = p("sql"), prevSpend = p("spend");
    const mqlRate = ratio(sql, mql);
    const costPerLead = ratio(spend, leads);
    // Won only: marketing-sourced won revenue (Closing Date in the period) ÷ spend of campaigns started in the
    // same period. null ("Not available") when there is no spend.
    const roi = ratio(sourced, spend);

    const marketingKpis = {
      spend: spend,
      influenced: influenced,
      sourcedRevenue: sourced,
      webinar: flow(m("webinar")),
      events: flow(m("events")),
      linkedin: flow(m("linkedin")),
      enquiries: flow(m("enquiries")),
      leads: flow(leads),
      mqlRate: mqlRate === null ? null : mqlRate * 100,
      costPerLead: costPerLead,
      roi: roi,
      delta: {
        influenced: delta.influenced,
        sourcedRevenue: change(sourced, p("sourced")),
        webinar: change(m("webinar"), p("webinar")),
        events: change(m("events"), p("events")),
        linkedin: change(m("linkedin"), p("linkedin")),
        enquiries: change(m("enquiries"), p("enquiries")),
        leads: change(leads, prevLeads),
        mqlRate: mqlRate !== null && prevMql ? signed((mqlRate - prevSql / prevMql) * 100, 1) : undefined,
        costPerLead: change(costPerLead, ratio(prevSpend, prevLeads), 1),
        roi: change(roi, ratio(p("sourced"), prevSpend), 1)
      }
    };

    const steps = [["Leads", "leads"], ["MQL", "mql"], ["SQL", "sql"], ["Opportunities", "opportunities"], ["Closed-won", "won"]];
    const leadFunnel = steps.map(function (s, i) {
      const value = m(s[1]);
      const rate = i ? ratio(value, m(steps[i - 1][1])) : null;
      return { label: s[0], count: flow(value), conversion: rate === null ? null : rate * 100 };
    });

    const byBucket = {};
    raws.forEach(function (r) {
      Object.keys(r.byBucket).forEach(function (k) {
        const row = byBucket[k] = byBucket[k] || { count: 0, amount: 0, stages: [] };
        row.count += r.byBucket[k].count;
        row.amount += r.byBucket[k].amount;
        r.byBucket[k].stages.forEach(function (s) { if (row.stages.indexOf(s) === -1) row.stages.push(s); });
      });
    });

    const temperature = {};
    raws.forEach(function (r) {
      Object.keys(r.temperature || {}).forEach(function (k) { temperature[k] = (temperature[k] || 0) + r.temperature[k]; });
    });

    const services = serviceTotals(raws.map(function (r) { return r.services; }));
    const accounts = total(function (r) { return r.accounts; });

    const funnel = STAGES.map(function (s, i) { return raws.reduce(function (t, r) { return t + r.funnel[i]; }, 0); });

    return {
      source: source,
      unavailable: source === "empty" && App.isEmbedded, // flagged only inside CRM
      asOf: raws[0].asOf,
      leads: leadTotals(raws),
      forecastVsTarget: forecastVsTarget(raws),
      stageConversion: stageConversion(funnel, raws),
      response: responseStats(raws, raws[0].months.map(function (m) { return m.label; })),
      channelTrend: channelTrend(raws, state.range),
      team: state.country === "ALL" || !raws.length ? null : { bdm: raws[0].bdm, bde: raws[0].bde },
      accounts: accounts,
      kpis: {
        confirmedAmount: confirmedAmount,
        confirmedCount: confirmedCount,
        unconfirmedAmount: unconfirmedAmount,
        unconfirmedCount: unconfirmedCount,
        weighted: weighted,
        winRate: winRate,
        newAccounts: flow(newAccounts),
        influenced: influenced,
        delta: delta,
        spark: { winRate: winSpark, newAccounts: series("newAccounts") }
      },
      byBucket: byBucket,
      services: services,
      servicesByCountry: raws.map(function (r) {
        return { country: r.code, total: r.confirmedAmount, count: r.confirmedCount, services: serviceTotals([r.services]) };
      }),
      funnel: funnel,
      options: options,
      periodFrom: from,
      wonLost: raws[0].months.map(function (month, i) {
        return {
          label: month.label,
          won: raws.reduce(function (t, r) { return t + r.months[i].won; }, 0),
          lost: raws.reduce(function (t, r) { return t + r.months[i].lost; }, 0),
          lostValue: raws.reduce(function (t, r) { return t + r.months[i].lostValue; }, 0)
        };
      }),
      revenueTrend: raws[0].months.map(function (month, i) {
        return { label: month.label, revenue: raws.reduce(function (t, r) { return t + r.months[i].revenue; }, 0) };
      }),
      temperature: temperature,
      attribution: CHANNELS.map(function (c, i) {
        return {
          channel: c,
          sourced: raws.reduce(function (t, r) { return t + r.attribution[i].sourced; }, 0),
          influenced: raws.reduce(function (t, r) { return t + r.attribution[i].influenced; }, 0)
        };
      }),
      marketingKpis: marketingKpis,
      leadFunnel: leadFunnel,
      campaigns: raws.reduce(function (all, r) { return all.concat(r.campaigns); }, []).map(function (c) {
        return {
          name: c.name, channel: c.channel, status: c.status, confirmed: c.confirmed,
          spend: c.spend, leads: flow(c.leads), roi: ratio(c.confirmed, c.spend)
        };
      }),
      deals: deals, // every deal, for the at-risk rules
      confirmedDeals: raws.reduce(function (all, r) { return all.concat(r.confirmedDeals); }, []),
      recentActivity: raws.reduce(function (all, r) { return all.concat(r.activity); }, [])
        .sort(function (a, b) { return a.ageHours - b.ageHours; }).slice(0, 4)
    };
  }

  // A country with nothing in it, used when CRM data can't be read.
  function emptyRaw(code) {
    const months = lastMonths(12);
    const zeros = function (n) { return Array.from({ length: n }, function () { return 0; }); };
    const channelZeros = function () { return CHANNELS.map(function () { return zeros(12); }); };
    return {
      code: code, bdm: "", bde: "", asOf: localDay(new Date()),
      accounts: 0, confirmedAmount: 0, confirmedCount: 0, unconfirmedAmount: 0, unconfirmedCount: 0, weighted: 0,
      byBucket: bucketTotals([]), funnel: zeros(STAGES.length), services: [], confirmedDeals: [],
      win: { won: 0, closed: 0 }, newAccounts: 0, influenced: 0, target: 0, closedWonQuarter: 0,
      months: months.slice(6).map(function (m) { return { label: m.label, won: 0, lost: 0, revenue: 0, lostValue: 0 }; }),
      leadStats: emptyLeads(),
      monthLabels12: months.map(function (m) { return m.label; }),
      temperature: {},
      attribution: CHANNELS.map(function (c) { return { channel: c, sourced: 0, influenced: 0 }; }),
      marketing: { sourced: 0, webinar: 0, events: 0, linkedin: 0, enquiries: 0, leads: 0, mql: 0, sql: 0, opportunities: 0, won: 0, spend: 0 },
      previous: { win: { won: 0, closed: 0 }, newAccounts: null,
                  influenced: null, sourced: null, webinar: null, events: null, linkedin: null, enquiries: null,
                  leads: null, mql: null, sql: null, spend: null },
      spark: { win: [], newAccounts: [] },
      stageDays: STAGES.map(function () { return null; }),
      leads: [], responseHistory: [],
      channelHistory: { sourced: channelZeros(), influenced: channelZeros() },
      campaigns: [], deals: [], activity: []
    };
  }

  function getData(state) {
    const codes = state.country === "ALL" ? CODES : [state.country];
    return build(codes.map(emptyRaw), state, "empty");
  }

  /* ================= Live data (Zoho CRM) ================= */

  // Records are read whole, so a field that does not exist in this CRM is simply empty.
  const FIELDS = {
    account: { created: "Created_Time" },
    contact: { engaged: "Last_Engaged_Date", channels: "Engaged_Channels" }, // custom
    campaign: {
      name: "Campaign_Name", type: "Type", status: "Status", start: "Start_Date", spend: "Actual_Cost",
      leads: "Leads_Count", webinar: "Attendees", events: "Participants", linkedin: "Engagements" // custom
    },
    lead: { source: "Lead_Source", status: "Lead_Status", created: "Created_Time", temperature: "Lead_Temperature", optedOut: "Email_Opt_Out" }
  };
  const SERVICE_FIELD = "Services_List";
  // Lead_Status values of a lead that is closed without a deal.
  const LOST_LEAD = /junk|lost|not qualified|unqualified|dead/i;
  // Saved by the AI summary in the Leads widget. An opted-out lead is never Hot or Warm.
  const TEMPERATURES = ["Hot", "Warm", "Cold", "Not enough data"];
  function temperatureOf(lead) {
    const t = lead[FIELDS.lead.temperature];
    if (TEMPERATURES.indexOf(t) === -1) return null;
    return lead[FIELDS.lead.optedOut] === true ? "Cold" : t;
  }

  // TODO: match these to your picklist values.
  const COUNTRY_VALUES = {
    US: ["US", "USA", "U.S.", "U.S.A.", "United States", "United States of America"],
    UK: ["UK", "GB", "U.K.", "United Kingdom", "Great Britain", "England", "Scotland", "Wales", "Northern Ireland"],
    AU: ["AU", "AUS", "Australia"]
  };
  const CHANNEL_ALIASES = {
    "webinar": "Webinars", "event": "Events", "trade show": "Events", "conference": "Events",
    "linkedin": "LinkedIn Organic", "linkedin ad": "LinkedIn Ads", "google adwords": "Google Ads", "adwords": "Google Ads",
    "web site": "Website", "web download": "Website", "facebook": "Social Media", "twitter": "Social Media"
  };
  const MQL_STATUSES = ["mql", "marketing qualified", "sql", "sales qualified"]; // TODO: Lead_Status values
  const SQL_STATUSES = ["sql", "sales qualified"];

  const INFLUENCE_DAYS = 180;
  const MAX_CAMPAIGNS = 100;

  // TODO: confirm API names for the added cards.
  const TARGETS = { module: "Sales_Targets", country: "Country", period: "Period", amount: "Target_Amount" };
  const LEAD_RESPONSE = { owner: "Owner.first_name", activityModules: ["Calls", "Tasks"] }; // TODO: add emails if logged in a module

  function norm(v) { return String(v || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }

  // Closed stages always carry one name; open stages keep the name they have in CRM.
  function stageName(v) {
    const key = norm(v);
    if (/^closedwon/.test(key)) return WON;
    if (/lost/.test(key)) return LOST;
    const known = STAGES.find(function (s) { return norm(s.name) === key; });
    return known ? known.name : String(v || "").trim();
  }

  // Uses the Deals stages of this CRM, in their order, with Closed-won last. Lost stages are not steps.
  // A stage's % comes from its bucket, never from a deal's Probability field.
  function setStages(names) {
    if (!names.length) return;
    const open = names.filter(function (n) { const s = norm(n); return !/^closedwon/.test(s) && !/lost/.test(s); });
    STAGES.splice.apply(STAGES, [0, STAGES.length].concat(open.map(function (n) {
      return { name: n, prob: stageBucket(n) };
    }), { name: WON, prob: 100 }));
  }

  // Adds open stages that deals use but the stage list lacks, before Closed-won.
  function completeStages(deals) {
    deals.filter(isOpen).forEach(function (deal) {
      if (!deal.stage || STAGES.some(function (s) { return s.name === deal.stage; })) return;
      STAGES.splice(STAGES.length - 1, 0, { name: deal.stage, prob: deal.bucket });
    });
  }
  const isOpen = function (d) { return d.stage !== WON && d.stage !== LOST; };
  function channelName(v) {
    const key = String(v || "").trim().toLowerCase();
    if (!key) return null;
    return CHANNELS.find(function (c) { return c.toLowerCase() === key; }) || CHANNEL_ALIASES[key] || null;
  }
  function countryCode(v) {
    const key = String(v || "").trim().toLowerCase();
    return CODES.find(function (c) {
      return COUNTRY_VALUES[c].some(function (x) { return x.toLowerCase() === key; });
    }) || null;
  }
  function toDate(v) {
    if (!v) return null;
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    const d = dateOnly ? new Date(+dateOnly[1], +dateOnly[2] - 1, +dateOnly[3]) : new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // from null = no start (All time). A record without a date is never inside a dated period.
  function within(value, from, to) {
    const d = toDate(value);
    return !!d && (!from || d >= from) && d < (to || new Date(8.64e15));
  }
  function lastMonths(n) {
    const now = new Date();
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push({ key: d.getFullYear() + "-" + d.getMonth(), label: d.toLocaleString("en-US", { month: "short" }) });
    }
    return out;
  }
  const inMonth = function (value, month) {
    const d = toDate(value);
    return !!d && d.getFullYear() + "-" + d.getMonth() === month.key;
  };
  function timeAgo(date) {
    const mins = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
    if (mins < 60) return mins + " min ago";
    if (mins < 1440) return Math.floor(mins / 60) + " h ago";
    const days = Math.floor(mins / 1440);
    return days === 1 ? "Yesterday" : days + " days ago";
  }
  // COQL returns at most 200 rows per call. Reads every page; if CRM refuses a page, the error is
  // passed on so the figure shows as "could not be read" instead of a silently short list.
  async function query(select) {
    let rows = [];
    for (let offset = 0; ; offset += 200) {
      const page = await App.coql(select + " limit " + offset + ", 200");
      rows = rows.concat(page);
      if (page.length < 200) break;
    }
    return rows;
  }
  const optional = function (select) {
    return App.fetchWithFallback(function () { return query(select); }, null);
  };

  const text = function (v) { return v && typeof v === "object" ? v.name || "" : v || ""; };
  const idOf = function (v) { return v && typeof v === "object" ? v.id || null : v || null; };
  const day = function (v) { return v ? String(v).slice(0, 10) : null; };

  function toDeal(r) {
    const stage = stageName(r.Stage);
    const services = [].concat(r[SERVICE_FIELD] || []).map(text).filter(function (s) { return s && s !== "-None-"; });
    // Amounts are converted to the home currency (₹): Zoho's Exchange_Rate is foreign units per 1 home unit.
    // A deal in another currency without a rate is not added anywhere and is reported instead.
    const number = function (v) { return v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v); };
    const rawAmount = number(r.Amount);
    const rate = Number(r.Exchange_Rate);
    const unconverted = !!text(r.Currency) && !(rate > 0);
    const home = function (v) { return Math.round((rate > 0 ? v / rate : v) * 100) / 100; };
    const amount = rawAmount === null || unconverted ? 0 : home(rawAmount);
    const bucket = stageBucket(stage);
    const group = dealGroup(stage);
    const deal = {
      id: r.id,
      accountId: idOf(r.Account_Name),
      contactId: idOf(r.Contact_Name),
      campaignId: idOf(r.Campaign_Source),
      name: r.Deal_Name || "(unnamed deal)",
      account: text(r.Account_Name),
      contact: text(r.Contact_Name),
      country: null, // set by setCountries
      service: services.join(", "),
      serviceKeys: unique(services.map(serviceKey)),
      amount: amount,
      noAmount: rawAmount === null,
      unconverted: unconverted,
      currency: text(r.Currency),
      stage: stage,
      group: group,
      bucket: group === "unconfirmed" ? bucket : null,
      // Stage %, not the editable Probability field. null for an open stage that is not mapped.
      probability: group === "confirmed" ? 100 : group === "lost" ? 0 : bucket,
      owner: text(r.Owner),
      bde: text(r.BDE),
      leadSource: r.Lead_Source,
      close: r.Closing_Date || "",
      created: toDate(r.Created_Time),
      lastActivityDate: day(r.Last_Activity_Time || r.Modified_Time || r.Created_Time),
      stageEnteredDate: day(r.Stage_Entered_Date || r.Stage_Modified_Time)
    };
    if (!deal.serviceKeys.length) deal.serviceKeys = [OTHER.key];
    // Per-service amounts are checked against Amount in the deal's own currency, then converted like Amount.
    const given = deal.serviceKeys.map(function (k) { return SERVICE_AMOUNT_FIELDS[k] ? number(r[SERVICE_AMOUNT_FIELDS[k]]) : null; });
    const anyGiven = given.some(function (v) { return v !== null; });
    deal.serviceAmountsUsed = anyGiven && rawAmount !== null && !unconverted && fitsAmount(given, rawAmount);
    // Set but not adding up to Amount: the Deals widget shows their sum, CRM reports show Amount.
    deal.serviceMismatch = anyGiven && !deal.serviceAmountsUsed;
    deal.parts = deal.serviceAmountsUsed ? convertParts(given, amount, home) : splitAmount(amount, deal.serviceKeys.length);
    deal.source = OTHER_CHANNEL; // set by tagChannels
    deal.channels = [];
    // A closed deal is dated by its Closing Date, as CRM reports do. A closed deal whose Closing Date is
    // still in the future was closed by today, so it counts as today.
    const planned = toDate(deal.close);
    const today = localDay(new Date());
    deal.closedOn = isOpen(deal) || !planned ? null : deal.close > today ? today : deal.close;
    return deal;
  }

  // The country codes of every record. Deals have no country of their own in CRM, so it comes from
  // the account, then the contact, then the lead the deal was converted from, then its description.
  function setCountries(rows, dealRows) {
    const first = function (values) {
      for (let i = 0; i < values.length; i++) {
        const code = countryCode(values[i]);
        if (code) return code;
      }
      return null;
    };
    const byId = function (list) { return new Map((list || []).map(function (r) { return [r.id, r]; })); };
    const accounts = byId(rows.accounts), contacts = byId(rows.contacts);
    const leadOf = { deal: new Map(), account: new Map(), contact: new Map() };
    (rows.leads || []).forEach(function (l) {
      l.code = countryCode(l.Country);
      Object.keys(leadOf).forEach(function (k) { if (l.detail && l.detail[k]) leadOf[k].set(l.detail[k], l.Country); });
    });
    const written = function (v) {
      const m = /country\s*:\s*([A-Za-z. ]+?)\s*(?=[\r\n,;|]|services|phone|email|message|$)/i.exec(v || "");
      return m ? m[1] : null;
    };
    const fromAccount = function (id) {
      const a = accounts.get(id) || {};
      return [a.Billing_Country, a.Country, leadOf.account.get(id)];
    };
    const fromContact = function (id) {
      const c = contacts.get(id) || {};
      return [c.Mailing_Country, c.Country, leadOf.contact.get(id)];
    };
    const dealById = byId(dealRows);
    const accountDeals = new Map();
    rows.deals.forEach(function (deal) {
      const r = dealById.get(deal.id);
      deal.country = first([r.Country].concat(fromAccount(deal.accountId), fromContact(deal.contactId), leadOf.deal.get(deal.id), written(r.Description)));
      if (deal.accountId && deal.country && !accountDeals.has(deal.accountId)) accountDeals.set(deal.accountId, deal.country);
    });
    (rows.accounts || []).forEach(function (a) { a.code = first(fromAccount(a.id).concat(accountDeals.get(a.id))); });
    (rows.contacts || []).forEach(function (c) {
      c.code = first(fromContact(c.id).concat(fromAccount(idOf(c.Account_Name)), accountDeals.get(idOf(c.Account_Name))));
    });
    (rows.campaigns || []).forEach(function (c) { c.code = countryCode(c.Country); });
    (rows.targets || []).forEach(function (t) { t.code = countryCode(t[TARGETS.country]); });
  }

  // Contact ids on a campaign's member list.
  async function campaignMembers(id) {
    let ids = [];
    for (let page = 1; page <= 5; page++) {
      const res = await App.getRelatedRecords("Campaigns", id, "Contacts", page);
      ids = ids.concat(res.rows.map(function (r) { return r.id; }));
      if (!res.more) break;
    }
    return ids;
  }

  // contact id -> [{channel, date}], from contact activity and campaign membership.
  async function buildTouches(campaignRows, contactRows, deals) {
    const touches = new Map();
    const touch = function (id, channel, date) {
      if (!id || !channel || !date) return;
      if (!touches.has(id)) touches.set(id, []);
      touches.get(id).push({ channel: channel, date: date });
    };
    (contactRows || []).forEach(function (c) {
      const date = toDate(c[FIELDS.contact.engaged]);
      [].concat(c[FIELDS.contact.channels] || []).forEach(function (v) { touch(c.id, channelName(v), date); });
    });

    const created = deals.map(function (d) { return d.created; }).filter(Boolean);
    if (!created.length) return touches;
    const earliest = Math.min.apply(null, created) - INFLUENCE_DAYS * 864e5;
    const latest = Math.max.apply(null, created);
    // TODO: campaign start stands in for the touch date; use the member's response date if stored.
    const relevant = (campaignRows || []).map(function (c) {
      return { id: c.id, channel: channelName(c[FIELDS.campaign.type]), date: toDate(c[FIELDS.campaign.start]) };
    }).filter(function (c) {
      return c.channel && c.date && c.date >= earliest && c.date <= latest;
    }).sort(function (a, b) { return b.date - a.date; }).slice(0, MAX_CAMPAIGNS);

    for (let i = 0; i < relevant.length; i += 5) {
      await Promise.all(relevant.slice(i, i + 5).map(async function (c) {
        const ids = await App.fetchWithFallback(function () { return campaignMembers(c.id); }, []);
        ids.forEach(function (id) { touch(id, c.channel, c.date); });
      }));
    }
    return touches;
  }

  /*
   * Tags each deal once with its source channel ("Other / not set" when none matches) and the channels
   * its contact engaged with in the 180 days before the deal was created. Every card reads these tags.
   */
  function tagChannels(deals, campaigns, touches) {
    const campaignType = new Map((campaigns || []).map(function (c) { return [c.id, c[FIELDS.campaign.type]]; }));
    deals.forEach(function (d) {
      d.source = channelName(d.leadSource) || channelName(campaignType.get(d.campaignId)) || OTHER_CHANNEL;
      d.channels = Array.from(new Set((touches.get(d.contactId) || []).filter(function (t) {
        const age = (d.created - t.date) / 864e5;
        return d.created && age >= 0 && age <= INFLUENCE_DAYS;
      }).map(function (t) { return t.channel; })));
    });
  }

  // Builds one country's raw record from fetched rows.
  function liveRaw(code, range, rows) {
    const wanted = code === OTHER_COUNTRY ? null : code;
    const mine = function (list) {
      return list && list.filter(function (r) { return r.code === wanted; });
    };
    const deals = rows.deals.filter(function (d) { return inCountry(d, code); });
    const accounts = mine(rows.accounts);
    const contacts = mine(rows.contacts);
    const leads = mine(rows.leads);
    const C = FIELDS.campaign;
    const Ld = FIELDS.lead;
    const campaignRows = mine(rows.campaigns);
    // The period, and the one before it of the same length (none for All time).
    const since = periodStart(range);
    const days = RANGE_DAYS[range];
    const before = since && new Date(since.getFullYear(), since.getMonth(), since.getDate() - days);
    const confirmed = pickDeals(deals, { from: since, option: "won" });
    const confirmedAll = pickDeals(deals, { from: null, option: "won" });
    const unconfirmed = pickDeals(deals, { option: "open" });

    // The one attribution rule, for confirmed deals only. Each deal's amount goes to exactly one
    // source channel ("Other / not set" when none matches), so the channels add up to the total.
    function attributionOf(list) {
      const out = {
        rows: CHANNELS.map(function (c) { return { channel: c, sourced: 0, influenced: 0 }; }),
        sourced: 0, // marketing channels only, without "Other / not set"
        influenced: 0
      };
      list.forEach(function (d) {
        out.rows[CHANNELS.indexOf(d.source)].sourced += d.amount;
        if (d.source !== OTHER_CHANNEL) out.sourced += d.amount;
        d.channels.forEach(function (c) { out.rows[CHANNELS.indexOf(c)].influenced += d.amount; });
        if (d.channels.length) out.influenced += d.amount; // counted once per deal
      });
      return out;
    }
    const totals = attributionOf(confirmed);
    const attributionRows = totals.rows, sourced = totals.sourced, influenced = totals.influenced;
    const trendMonths = lastMonths(12);
    const byMonth = trendMonths.map(function (month) {
      return attributionOf(confirmedAll.filter(function (d) { return inMonth(d.closedOn, month); })).rows;
    });
    const history = function (key) {
      return CHANNELS.map(function (_, c) { return byMonth.map(function (rowsOfMonth) { return rowsOfMonth[c][key]; }); });
    };

    // Quarter to date.
    const now = new Date();
    const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    const quarterEnd = new Date(quarterStart.getFullYear(), quarterStart.getMonth() + 3, 1);
    const closedWonQuarter = sum(deals.filter(function (d) {
      return d.stage === WON && within(d.closedOn, quarterStart, quarterEnd);
    }), function (d) { return d.amount; });
    const targets = mine(rows.targets);
    const target = targets
      ? sum(targets.filter(function (t) { return within(t[TARGETS.period], quarterStart, quarterEnd); }),
            function (t) { return Number(t[TARGETS.amount]) || 0; })
      : null;

    // Average days the open deals have been in their current stage.
    // TODO: use the Stage History related list for time spent in every stage reached.
    const stageDays = STAGES.map(function (s) {
      const ages = deals.filter(function (d) { return d.stage === s.name && d.stageEnteredDate; })
        .map(function (d) { return (now - toDate(d.stageEnteredDate)) / 864e5; });
      return ages.length ? sum(ages, function (v) { return v; }) / ages.length : null;
    });

    // Lead response: first activity time minus lead creation time.
    const responseLeads = (leads || []).filter(function (r) { return within(r[Ld.created], new Date(now.getFullYear(), now.getMonth() - 5, 1)); })
      .map(function (r) {
        const first = rows.firstTouch.get(r.id);
        return {
          owner: text(r.Owner) || "Unassigned",
          source: channelName(r[Ld.source]),
          month: toDate(r[Ld.created]),
          responseMinutes: first ? Math.max(0, (first - toDate(r[Ld.created])) / 60000) : null
        };
      });
    const responseHistory = trendMonths.slice(6).map(function (month) {
      return responseLeads.filter(function (l) {
        return l.responseMinutes !== null && l.month.getFullYear() + "-" + l.month.getMonth() === month.key;
      }).map(function (l) { return l.responseMinutes; });
    });

    // Win rate and monthly figures from closing dates.
    const months12 = lastMonths(12);
    const monthly = months12.map(function (month) {
      const done = deals.filter(function (d) { return !isOpen(d) && inMonth(d.closedOn, month); });
      const wins = done.filter(function (d) { return d.stage === WON; });
      return { label: month.label, won: wins.length, lost: done.length - wins.length, closed: done.length,
               revenue: sum(wins, function (d) { return d.amount; }),
               lostValue: sum(done.filter(function (d) { return d.stage === LOST; }), function (d) { return d.amount; }) };
    });
    const last6 = monthly.slice(6), prev6 = monthly.slice(0, 6);
    const winOf = function (list) {
      return { won: sum(list, function (x) { return x.won; }), closed: sum(list, function (x) { return x.closed; }) };
    };

    // Counts in a window. null (shown as "—") when the module or field is unavailable.
    const fieldTotal = function (types, field, from, to) {
      if (!campaignRows || !(rows.campaigns || []).some(function (r) { return r[field] != null; })) return null;
      // By campaign Start Date; under All time a campaign without a start date counts too.
      return sum(campaignRows.filter(function (r) {
        return ((!from && !to) || within(r[C.start], from, to)) && (!types || types.indexOf(channelName(r[C.type])) !== -1);
      }), function (r) { return Number(r[field]) || 0; });
    };
    const leadCount = function (from, to, filter) {
      if (!leads) return null;
      return leads.filter(function (r) { return within(r[FIELDS.lead.created], from, to) && (!filter || filter(r)); }).length;
    };
    const status = function (list) {
      return function (r) { return list.indexOf(String(r[FIELDS.lead.status] || "").toLowerCase()) !== -1; };
    };
    const fromWeb = function (r) { return channelName(r[FIELDS.lead.source]) === "Website"; };
    const sourcedDeals = deals.filter(function (d) { return d.created && (!since || d.created >= since) && d.source !== OTHER_CHANNEL; });

    function windowMetrics(from, to) {
      return {
        webinar: fieldTotal(["Webinars"], C.webinar, from, to),
        events: fieldTotal(["Events"], C.events, from, to),
        linkedin: fieldTotal(["LinkedIn Organic", "LinkedIn Ads"], C.linkedin, from, to),
        enquiries: leadCount(from, to, fromWeb),
        leads: leadCount(from, to),
        mql: leadCount(from, to, status(MQL_STATUSES)),
        sql: leadCount(from, to, status(SQL_STATUSES)),
        spend: fieldTotal(null, C.spend, from, to)
      };
    }
    const current = windowMetrics(since);
    // All time has no earlier period to compare with.
    const earlier = since ? windowMetrics(before, since)
      : { webinar: null, events: null, linkedin: null, enquiries: null, leads: null, mql: null, sql: null, spend: null };

    const newAccounts = accounts && accounts.filter(function (a) { return within(a[FIELDS.account.created], since); }).length;
    const prevAccounts = accounts && since ? accounts.filter(function (a) { return within(a[FIELDS.account.created], before, since); }).length : null;

    const reached = deals.map(function (d) { return STAGES.findIndex(function (s) { return s.name === d.stage; }); });

    // Confirmed deals only, each split between its services as in toDeal.
    const services = serviceParts(confirmed);

    const movedLeads = leads && leads.filter(function (l) { return l.converted && l.toDeal; });
    // Moved leads whose deal is in another country, or no longer in Deals (deleted or never created).
    const dealCountry = new Map(rows.deals.map(function (d) { return [d.id, d.country]; }));
    const movedElsewhere = movedLeads && movedLeads.filter(function (l) {
      return dealCountry.has(l.detail.deal) && dealCountry.get(l.detail.deal) !== wanted;
    });
    const movedMissing = movedLeads && movedLeads.filter(function (l) { return !dealCountry.has(l.detail.deal); });
    if (movedLeads && (movedElsewhere.length || movedMissing.length)) {
      console.info("[widget] " + code + ": moved leads whose deal is not in " + code,
        movedElsewhere.concat(movedMissing).map(function (l) {
          return { lead: l.name, leadId: l.id, dealId: l.detail.deal, dealCountry: dealCountry.has(l.detail.deal) ? dealCountry.get(l.detail.deal) || "not set" : "deal not found" };
        }));
    }
    const openLeads = leads && leads.filter(function (l) { return !l.converted && !LOST_LEAD.test(l[Ld.status] || ""); });
    const temperature = {}; // open leads only, each counted once
    (openLeads || []).forEach(function (l) {
      const t = temperatureOf(l) || "Not checked yet";
      temperature[t] = (temperature[t] || 0) + 1;
    });
    const known = rows.convertedKnown;
    const leadStats = leads ? {
      total: leads.length,
      created: leads.filter(function (l) { return within(l[Ld.created], since); }).length,
      prevCreated: since ? leads.filter(function (l) { return within(l[Ld.created], before, since); }).length : null,
      open: openLeads.length,
      lost: leads.filter(function (l) { return !l.converted && LOST_LEAD.test(l[Ld.status] || ""); }).length,
      moved: known ? movedLeads.length : null,
      movedPeriod: known ? movedLeads.filter(function (l) { return within(l.convertedOn, since); }).length : null,
      otherConverted: known ? leads.filter(function (l) { return l.converted && !l.toDeal; }).length : null,
      movedElsewhere: known ? movedElsewhere.length : null,
      movedMissing: known ? movedMissing.length : null,
      byStatus: openLeads.reduce(function (all, l) {
        const s = l[Ld.status] && l[Ld.status] !== "-None-" ? l[Ld.status] : "No status";
        all[s] = (all[s] || 0) + 1;
        return all;
      }, {}),
      months: lastMonths(6).map(function (month) {
        return {
          label: month.label,
          created: leads.filter(function (l) { return inMonth(l[Ld.created], month); }).length,
          moved: movedLeads.filter(function (l) { return inMonth(l.convertedOn, month); }).length
        };
      })
    } : emptyLeads();

    return {
      code: code,
      asOf: localDay(now),
      target: target,
      closedWonQuarter: closedWonQuarter,
      stageDays: stageDays,
      leads: responseLeads,
      responseHistory: responseHistory,
      channelHistory: { sourced: history("sourced"), influenced: history("influenced") },
      monthLabels12: trendMonths.map(function (m) { return m.label; }),
      bdm: unique(deals.map(function (d) { return d.owner; })).slice(0, 3).join(", "),
      bde: unique(deals.map(function (d) { return d.bde; })).slice(0, 3).join(", "),
      accounts: accounts ? accounts.length : unique(deals.map(function (d) { return d.account; })).length,
      confirmedAmount: sum(confirmed, function (d) { return d.amount; }),
      confirmedCount: confirmed.length,
      confirmedDeals: confirmed,
      unconfirmedAmount: sum(unconfirmed, function (d) { return d.amount; }),
      unconfirmedCount: unconfirmed.length,
      // An estimate: amount × stage %. Open stages that are not mapped add nothing.
      weighted: sum(unconfirmed, function (d) { return d.bucket === null ? 0 : d.amount * d.bucket / 100; }),
      byBucket: bucketTotals(unconfirmed),
      // Not shown (the Stage conversion card is not on any tab). A deal at one stage has reached the earlier ones.
      funnel: STAGES.map(function (s, i) { return reached.filter(function (x) { return x >= i; }).length; }),
      services: services,
      leadStats: leadStats,
      win: winOf(last6),
      newAccounts: accounts ? newAccounts : null,
      influenced: rows.touches.size ? influenced : null, // unknown until contact engagement is recorded
      months: last6,
      temperature: temperature,
      attribution: attributionRows,
      marketing: Object.assign({}, current, {
        sourced: sourced,
        opportunities: sourcedDeals.length,
        won: sourcedDeals.filter(function (d) { return d.stage === WON; }).length
      }),
      // Attribution history isn't available, so no delta for those.
      previous: Object.assign({ influenced: null, sourced: null,
                                win: winOf(prev6), newAccounts: accounts ? prevAccounts : null }, earlier),
      spark: {
        win: monthly.map(function (x) { return { won: x.won, closed: x.closed }; }),
        newAccounts: accounts ? months12.map(function (month) {
          return accounts.filter(function (a) { return inMonth(a[FIELDS.account.created], month); }).length;
        }) : []
      },
      // Campaign spend is not limited to the period, so its confirmed amount is all-time too.
      campaigns: (campaignRows || []).map(function (c) {
        const linked = confirmedAll.filter(function (d) { return d.campaignId === c.id; });
        const state = String(c[C.status] || "").toLowerCase();
        return {
          name: c[C.name] || "(unnamed campaign)",
          channel: channelName(c[C.type]) || c[C.type] || "—",
          spend: c[C.spend] != null ? Number(c[C.spend]) : null,
          leads: c[C.leads] != null ? Number(c[C.leads]) : null,
          confirmed: sum(linked, function (d) { return d.amount; }),
          status: /complete|ended/.test(state) ? "Ended" : /inactive|hold|paus/.test(state) ? "Paused" : "Active"
        };
      }),
      deals: deals,
      activity: liveActivity(deals, accounts || [], contacts || [], leads || [], rows.activity)
    };
  }

  // Notes, meetings, calls and tasks linked to this country's records.
  function liveActivity(deals, accounts, contacts, leads, activity) {
    const related = new Map();
    accounts.forEach(function (a) { related.set(a.id, {}); });
    contacts.forEach(function (c) { related.set(c.id, {}); });
    leads.forEach(function (l) { related.set(l.id, { name: l.name, rating: l.converted || LOST_LEAD.test(l[FIELDS.lead.status] || "") ? null : temperatureOf(l) }); });
    deals.forEach(function (d) { related.set(d.id, { probability: d.probability, name: d.name }); });
    const ratingTypes = { Hot: "red", Warm: "orange", Cold: "cold" };

    const items = [];
    activity.forEach(function (a) {
      const link = a.links.find(function (id) { return related.has(id); });
      if (!link || !a.when) return;
      const info = related.get(link);
      const item = {
        ageHours: (Date.now() - a.when) / 36e5,
        icon: a.icon,
        title: info.name || a.title,
        detail: a.verb + (a.title ? ": " + a.title : "") + " · " + timeAgo(a.when)
      };
      if (info.probability !== undefined && info.probability !== null) {
        item.pill = info.probability + "%";
        item.pillType = "blue";
      } else if (ratingTypes[info.rating]) {
        item.pill = info.rating;
        item.pillType = ratingTypes[info.rating];
      }
      items.push(item);
    });

    // The records themselves: created, moved to a deal, won and lost.
    const record = function (when, iconName, title, verb, pill, pillType) {
      if (!when) return;
      items.push({ ageHours: (Date.now() - when) / 36e5, icon: iconName, title: title, detail: verb + " · " + timeAgo(when), pill: pill, pillType: pillType });
    };
    leads.forEach(function (l) {
      record(toDate(l[FIELDS.lead.created]), "click", l.name, "Lead created");
      if (l.converted) record(toDate(l.convertedOn), "handshake", l.name, l.toDeal ? "Lead moved to a deal" : "Lead converted without a deal");
    });
    deals.forEach(function (x) {
      record(x.created, "wallet", x.name, "Deal created", x.probability === null ? undefined : x.probability + "%", "blue");
      if (x.closedOn) record(toDate(x.closedOn), "docCheck", x.name, x.stage === WON ? "Deal won" : "Deal lost", x.stage === WON ? "Won" : "Lost", x.stage === WON ? "green" : "red");
    });
    accounts.forEach(function (a) { record(toDate(a[FIELDS.account.created]), "building", a.Account_Name || "Account", "Account created"); });
    return items;
  }

  // TODO: confirm the activity modules and fields.
  async function fetchActivity(problems) {
    const sources = [
      { module: "Notes", icon: "docCheck", verb: "Note added", title: "Note_Title", links: ["Parent_Id"] },
      { module: "Events", icon: "calendar", verb: "Meeting booked", title: "Event_Title", links: ["What_Id", "Who_Id"] },
      { module: "Calls", icon: "click", verb: "Call logged", title: "Subject", links: ["What_Id", "Who_Id"] },
      { module: "Tasks", icon: "docCheck", verb: "Task created", title: "Subject", links: ["What_Id", "Who_Id"] }
    ];
    const lists = await Promise.all(sources.map(async function (s) {
      const rows = await App.fetchWithFallback(function () {
        return App.coql("select " + [s.title].concat(s.links, "Created_Time").join(", ") + " from " + s.module +
          " where Created_Time is not null order by Created_Time desc limit 0, 50");
      }, null);
      if (!rows) {
        problems.push(s.module + " (recent activity)");
        return [];
      }
      return rows.map(function (r) {
        return {
          icon: s.icon, verb: s.verb, title: r[s.title] || "", when: toDate(r.Created_Time),
          links: s.links.map(function (f) { return r[f] && (r[f].id || r[f]); }).filter(Boolean)
        };
      });
    }));
    return lists.flat();
  }

  // Every record the dashboard needs. Deals are essential; the rest may be missing.
  async function fetchRows() {
    const problems = [];
    const records = function (module, params) {
      return App.allRecords(module, params).catch(function (err) {
        console.warn("[widget] " + module + " could not be read:", (err && err.message) || err);
        problems.push(module);
        return null;
      });
    };
    const results = await Promise.all([
      App.allRecords("Deals"),
      records("Accounts"),
      records("Contacts"),
      records("Campaigns"),
      records("Leads"),
      App.fetchWithFallback(function () { return App.allRecords("Leads", { converted: "true" }); }, null),
      fetchActivity(problems),
      optional("select " + [TARGETS.country, TARGETS.period, TARGETS.amount].join(", ") + " from " + TARGETS.module + " where id is not null"),
      Promise.all(LEAD_RESPONSE.activityModules.map(function (m) {
        return optional("select Who_Id, What_Id, Created_Time from " + m + " where Created_Time is not null order by Created_Time desc");
      })),
      App.fetchWithFallback(function () { return App.stageValues(); }, null)
    ]);

    if (!results[7]) problems.push("Sales targets");
    if (!results[9]) problems.push("Deal stage list");
    setStages(results[9] || []);
    const dealRows = results[0];
    const deals = dealRows.map(toDeal);
    completeStages(deals);
    // Deals that cannot be counted correctly are named, never silently counted as ₹0.
    const flag = function (test, text) {
      const n = deals.filter(test).length;
      if (n) problems.push(n + (n === 1 ? " deal " : " deals ") + text);
    };
    flag(function (d) { return d.unconverted; }, "in another currency with no exchange rate (not added)");
    flag(function (d) { return d.noAmount && d.group !== "lost"; }, "with no amount (counted as ₹0)");
    flag(function (d) { return d.group === "confirmed" && !d.closedOn; }, "won with no closing date (not in any period)");
    flag(function (d) { return d.group === "unconfirmed" && d.bucket === null; }, "at a stage with no % bucket (shown as Not mapped)");
    flag(function (d) { return d.serviceMismatch && d.group !== "lost"; },
      "whose service amounts do not add up to Amount (split equally; the deal page shows their sum instead)");

    // Converted leads have left the Leads list, so they are read separately.
    const isConverted = function (l) { return l.$converted === true || l.Converted__s === true || !!l.$converted_detail; };
    const second = results[5];
    const convertedRows = second ? second.filter(isConverted) : [];
    // Rows that are not converted mean CRM ignored the request, so the number is unknown.
    const convertedKnown = !!second && (!second.length || convertedRows.length > 0);
    if (results[4] && !convertedKnown) problems.push("converted leads");
    const seen = new Set();
    const leads = results[4] && convertedRows.concat(results[4]).filter(function (l) {
      if (seen.has(l.id)) return false;
      seen.add(l.id);
      return true;
    }).map(function (l) {
      const detail = l.$converted_detail || null;
      const lead = Object.assign({}, l, { converted: isConverted(l) });
      lead.detail = detail && { deal: idOf(detail.deal), account: idOf(detail.account), contact: idOf(detail.contact) };
      // Moved to a deal only when CRM names the deal; a conversion without details is not assumed to have one.
      lead.toDeal = lead.converted && !!(lead.detail && lead.detail.deal);
      lead.convertedOn = lead.converted ? (detail && detail.convert_date) || l.Converted_Date_Time || l.Modified_Time : null;
      lead.name = l.Full_Name || [l.First_Name, l.Last_Name].filter(Boolean).join(" ") || "Lead";
      return lead;
    });

    const firstTouch = new Map();
    results[8].forEach(function (list) {
      (list || []).forEach(function (a) {
        const when = toDate(a.Created_Time);
        [a.Who_Id, a.What_Id].forEach(function (link) {
          const id = idOf(link);
          if (id && when && (!firstTouch.has(id) || when < firstTouch.get(id))) firstTouch.set(id, when);
        });
      });
    });

    const rows = {
      deals: deals, accounts: results[1], contacts: results[2], campaigns: results[3], leads: leads, convertedKnown: convertedKnown,
      activity: results[6], targets: results[7], firstTouch: firstTouch, problems: problems
    };
    setCountries(rows, dealRows);
    rows.touches = await buildTouches(rows.campaigns, rows.contacts, rows.deals);
    tagChannels(rows.deals, rows.campaigns, rows.touches);
    return rows;
  }

  // Filters reuse the rows just read. Refresh, or two minutes, reads them again.
  let cached = null, cachedAt = 0;
  function reset() { cached = null; }
  function currentRows() {
    if (!cached || Date.now() - cachedAt > 120000) {
      const job = fetchRows();
      cached = job;
      cachedAt = Date.now();
      job.catch(function () { if (cached === job) cached = null; });
    }
    return cached;
  }

  async function fetchLive(state) {
    const rows = await currentRows();
    // "Country not set" is always part of All countries, so no record is ever dropped.
    const raws = CODES.concat(OTHER_COUNTRY).map(function (c) { return liveRaw(c, state.range, rows); });
    const data = build(state.country === "ALL" ? raws : raws.filter(function (r) { return r.code === state.country; }), state, "live");
    const without = rows.deals.some(function (d) { return !d.country; }) || (rows.leads || []).some(function (l) { return !l.code; });
    data.countries = raws.map(countryRow).filter(function (c) { return c.code !== OTHER_COUNTRY || without; });
    data.problems = rows.problems;
    // Figures per country, to compare with a CRM report (open the browser console).
    console.table(summary(raws));
    return data;
  }

  // One line per country and one for All, with the figures a CRM report can confirm.
  function summary(raws) {
    const line = function (label, list) {
      const t = function (key) { return sum(list, function (r) { return r[key]; }); };
      const out = {
        country: label, confirmedCount: t("confirmedCount"), confirmedAmount: t("confirmedAmount"),
        unconfirmedCount: t("unconfirmedCount"), unconfirmedAmount: t("unconfirmedAmount")
      };
      BUCKETS.concat("none").forEach(function (b) {
        out["count" + b] = sum(list, function (r) { return r.byBucket[b].count; });
        out["amount" + b] = sum(list, function (r) { return r.byBucket[b].amount; });
      });
      return out;
    };
    return raws.map(function (r) { return line(r.code, [r]); }).concat(line("ALL", raws));
  }

  // The only entry point tabs' data comes through. A failed read is marked as failed, never shown as zero.
  async function loadData(state) {
    try {
      return await fetchLive(state);
    } catch (err) {
      const reason = (err && err.message) || String(err);
      console.warn("[widget] Fetch failed:", reason);
      return Object.assign(getData(state), { failed: true, countries: [], problems: [], reason: reason });
    }
  }

  return {
    CODES: CODES,
    SERVICES: SERVICES,
    STAGES: STAGES,
    BUCKETS: BUCKETS,
    BUCKET_NAMES: BUCKET_NAMES,
    OPTIONS: OPTIONS,
    OTHER_COUNTRY: OTHER_COUNTRY,
    atRisk: atRisk,
    serviceKey: serviceKey,
    serviceTotals: serviceTotals,
    shares: shares,
    getData: getData,
    loadData: loadData,
    reset: reset,
    // For the Node tests only.
    _test: {
      toDeal: toDeal, setCountries: setCountries, liveRaw: liveRaw, build: build, countryRow: countryRow,
      stageBucket: stageBucket, dealGroup: dealGroup, splitAmount: splitAmount, serviceParts: serviceParts,
      serviceTotals: serviceTotals, summary: summary, localDay: localDay, OTHER_COUNTRY: OTHER_COUNTRY,
      pickDeals: pickDeals, periodStart: periodStart, tagChannels: tagChannels, optionBlock: optionBlock
    }
  };
})();
