/*
 * The one data layer. Tabs receive its output; they never fetch or aggregate by themselves.
 * Zoho CRM data produces one raw record per country, and build() turns those into the view data,
 * so "All countries" is always a sum and every ratio is recalculated from sums.
 * There is no sample data: if CRM can't be read, every figure is empty.
 */
window.Data = (function () {
  "use strict";

  const CODES = ["US", "UK", "AU"];
  const RANGE_DAYS = { "7d": 7, "30d": 30, "90d": 90, "12m": 365 };

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
  const OTHER = { key: "other", label: "Other services", name: "Other", color: "#C4C9D4" };

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

  const CHANNELS = ["Email", "Webinars", "Events", "LinkedIn Organic", "LinkedIn Ads", "Google Ads", "Website", "Social Media"];

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
   * The one service-line aggregation. Takes service lists ([{key, value, deals}]) and returns
   * one row per service with its total value and deal count.
   */
  function serviceTotals(lists) {
    const rows = lists.flat();
    const catalogue = rows.some(function (r) { return r.key === OTHER.key; }) ? SERVICES.concat(OTHER) : SERVICES;
    return catalogue.map(function (s) {
      const mine = rows.filter(function (r) { return r.key === s.key; });
      return {
        key: s.key, label: s.label, name: s.name, color: s.color,
        value: sum(mine, function (r) { return r.value; }),
        deals: sum(mine, function (r) { return r.deals; })
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

  function attainment(target, closedWon, forecast) {
    return {
      target: target,
      closedWon: closedWon,
      forecast: forecast,
      gap: Math.max(0, target - closedWon - forecast),
      pct: target ? (closedWon + forecast) / target * 100 : null
    };
  }

  function forecastVsTarget(raws) {
    const t = function (key) { return add(raws.map(function (r) { return r[key]; })); };
    const total = attainment(t("target"), t("closedWonQuarter"), t("forecast"));
    total.byCountry = raws.map(function (r) {
      return Object.assign({ country: r.code }, attainment(r.target, r.closedWonQuarter, r.forecast));
    });
    return total;
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

  // Open deals matching any rule; the most severe reason leads (overdue, stuck, no activity).
  function atRisk(deals, thresholdDays, asOf) {
    const open = deals.filter(function (d) { return d.stage !== WON && d.stage !== LOST; });
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
    return { rows: rows, count: rows.length, value: value, openCount: open.length, pct: openValue ? value / openValue * 100 : null };
  }

  /* ================= Aggregation ================= */

  // Sums per-country raw records. Flow metrics are already limited to the date range.
  function build(raws, state, source) {
    const total = function (fn) { return add(raws.map(fn)); };
    const flow = function (v) { return v === null || v === undefined ? null : Math.round(v); };
    const m = function (key) { return total(function (r) { return r.marketing[key]; }); };
    const p = function (key) { return total(function (r) { return r.previous[key]; }); };

    const pipeline = total(function (r) { return r.pipeline; });
    const forecast = total(function (r) { return r.forecast; });
    const openDeals = total(function (r) { return r.openDeals; });
    const influenced = total(function (r) { return r.influenced; });
    const newAccounts = total(function (r) { return r.newAccounts; });
    const won = total(function (r) { return r.win.won; });
    const closed = total(function (r) { return r.win.closed; });
    const winRate = closed ? won / closed * 100 : null;
    const prevWon = total(function (r) { return r.previous.win && r.previous.win.won; });
    const prevClosed = total(function (r) { return r.previous.win && r.previous.win.closed; });
    const prevOpen = p("openDeals");

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
      pipeline: change(pipeline, p("pipeline"), 1),
      forecast: change(forecast, p("forecast"), 1),
      openDeals: prevOpen === null ? undefined : signed(openDeals - prevOpen, 0, ""),
      winRate: winRate !== null && prevClosed ? signed(winRate - prevWon / prevClosed * 100, 1) : undefined,
      newAccounts: change(newAccounts, p("newAccounts")),
      influenced: change(influenced, p("influenced"))
    };

    const sourced = m("sourced");
    const leads = m("leads"), mql = m("mql"), sql = m("sql"), spend = m("spend");
    const prevLeads = p("leads"), prevMql = p("mql"), prevSql = p("sql"), prevSpend = p("spend");
    const mqlRate = ratio(sql, mql);
    const costPerLead = ratio(spend, leads);
    const roi = ratio(sourced, spend);

    const marketingKpis = {
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

    const byStage = {};
    raws.forEach(function (r) {
      Object.keys(r.byStage).forEach(function (k) { byStage[k] = (byStage[k] || 0) + r.byStage[k]; });
    });

    const temperature = {};
    raws.forEach(function (r) {
      Object.keys(r.temperature || {}).forEach(function (k) { temperature[k] = (temperature[k] || 0) + r.temperature[k]; });
    });

    const services = serviceTotals(raws.map(function (r) { return r.services; }));
    const accounts = total(function (r) { return r.accounts; });
    const deals = raws.reduce(function (all, r) { return all.concat(r.deals); }, []);

    const funnel = STAGES.map(function (s, i) { return raws.reduce(function (t, r) { return t + r.funnel[i]; }, 0); });

    return {
      source: source,
      unavailable: source === "empty" && App.isEmbedded, // flagged only inside CRM
      asOf: raws[0].asOf,
      forecastVsTarget: forecastVsTarget(raws),
      stageConversion: stageConversion(funnel, raws),
      response: responseStats(raws, raws[0].months.map(function (m) { return m.label; })),
      channelTrend: channelTrend(raws, state.range),
      team: state.country === "ALL" || !raws.length ? null : { bdm: raws[0].bdm, bde: raws[0].bde },
      accounts: accounts,
      dealCount: deals.length,
      kpis: {
        pipelineValue: pipeline,
        forecast: forecast,
        openDeals: openDeals,
        winRate: winRate,
        newAccounts: flow(newAccounts),
        influenced: influenced,
        delta: delta,
        spark: {
          pipeline: series("pipeline"), forecast: series("forecast"), openDeals: series("openDeals"),
          winRate: winSpark, newAccounts: series("newAccounts"), influenced: series("influenced")
        }
      },
      services: services,
      servicesByCountry: raws.map(function (r) {
        return { country: r.code, total: r.pipeline, services: serviceTotals([r.services]) };
      }),
      funnel: funnel,
      pipelineByStage: byStage,
      pipelineByServiceLine: services.filter(function (s) { return s.value > 0; })
        .map(function (s) { return { label: s.name, value: s.value }; })
        .sort(function (a, b) { return b.value - a.value; }),
      pipelineByCountry: raws.map(function (r) { return { label: r.code, value: r.pipeline }; })
        .sort(function (a, b) { return b.value - a.value; }),
      wonLost: raws[0].months.map(function (month, i) {
        return {
          label: month.label,
          won: raws.reduce(function (t, r) { return t + r.months[i].won; }, 0),
          lost: raws.reduce(function (t, r) { return t + r.months[i].lost; }, 0)
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
          name: c.name, channel: c.channel, status: c.status, pipeline: c.pipeline,
          spend: c.spend, leads: flow(c.leads), roi: ratio(c.revenue, c.spend)
        };
      }),
      deals: deals,
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
      code: code, bdm: "", bde: "", asOf: new Date().toISOString().slice(0, 10),
      accounts: 0, pipeline: 0, forecast: 0, openDeals: 0, byStage: {}, funnel: zeros(STAGES.length), services: [],
      win: { won: 0, closed: 0 }, newAccounts: 0, influenced: 0, target: 0, closedWonQuarter: 0,
      months: months.slice(6).map(function (m) { return { label: m.label, won: 0, lost: 0, revenue: 0 }; }),
      monthLabels12: months.map(function (m) { return m.label; }),
      temperature: {},
      attribution: CHANNELS.map(function (c) { return { channel: c, sourced: 0, influenced: 0 }; }),
      marketing: { sourced: 0, webinar: 0, events: 0, linkedin: 0, enquiries: 0, leads: 0, mql: 0, sql: 0, opportunities: 0, won: 0, spend: 0 },
      previous: { pipeline: null, forecast: null, openDeals: null, win: { won: 0, closed: 0 }, newAccounts: null,
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

  /* ================= Live data (Zoho COQL) ================= */

  // TODO: confirm every module and field API name below (Setup > Developer Space > APIs).
  const FIELDS = {
    deal: {
      name: "Deal_Name", stage: "Stage", amount: "Amount", close: "Closing_Date", created: "Created_Time",
      probability: "Probability", owner: "Owner.first_name", accountName: "Account_Name.Account_Name",
      accountId: "Account_Name.id", contactFirst: "Contact_Name.First_Name", contactLast: "Contact_Name.Last_Name",
      contactId: "Contact_Name.id", leadSource: "Lead_Source", campaignId: "Campaign_Source.id",
      country: "Country",      // TODO: custom field
      service: "Service_Line", // TODO: custom field
      bde: "BDE"               // TODO: custom field; remove if you don't have it
    },
    account: { country: "Billing_Country", created: "Created_Time", temperature: "Temperature" /* TODO: custom */ },
    contact: {
      country: "Mailing_Country", rating: "Rating", // TODO: Rating is a custom Hot / Warm / Cold field
      engaged: "Last_Engaged_Date", channels: "Engaged_Channels" // TODO: custom fields
    },
    campaign: {
      name: "Campaign_Name", type: "Type", status: "Status", start: "Start_Date", spend: "Actual_Cost",
      country: "Country", leads: "Leads_Count", webinar: "Attendees", events: "Participants",
      linkedin: "Engagements" // TODO: all but Campaign_Name, Type, Status, Start_Date, Actual_Cost are custom
    },
    lead: { source: "Lead_Source", status: "Lead_Status", created: "Created_Time", country: "Country" }
  };

  // TODO: match these to your picklist values.
  const COUNTRY_VALUES = {
    US: ["US", "USA", "United States"],
    UK: ["UK", "GB", "United Kingdom"],
    AU: ["AU", "Australia"]
  };
  const STAGE_ALIASES = {
    "qualification": "Qualified", "needs analysis": "Needs confirmed", "proposal/price quote": "Proposal presented",
    "closed won": WON, "closed lost": LOST, "closed-lost to competition": LOST, "closed lost to competition": LOST
  };
  const CLOSED_VALUES = ["Closed Won", "Closed Lost", "Closed-won", "Closed-lost", "Closed Lost to Competition"];
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
  const DEAL_AGES = { lastActivity: "Last_Activity_Time", stageEntered: "Stage_Entered_Date" }; // Stage_Entered_Date is custom
  const LEAD_RESPONSE = { owner: "Owner.first_name", activityModules: ["Calls", "Tasks"] }; // TODO: add emails if logged in a module

  function stageName(v) {
    const key = String(v || "").trim().toLowerCase();
    const known = STAGES.find(function (s) { return s.name.toLowerCase() === key; });
    return known ? known.name : STAGE_ALIASES[key] || String(v || "");
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
  function daysAgo(n) { return new Date(Date.now() - n * 864e5); }
  function within(value, from, to) {
    const d = toDate(value);
    return !!d && d >= from && d < (to || new Date(8.64e15));
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
  const quoted = function (list) { return list.map(function (v) { return "'" + v + "'"; }).join(", "); };

  // COQL returns at most 200 rows per call.
  async function query(select) {
    let rows = [];
    for (let offset = 0; offset < 2000; offset += 200) {
      const page = await App.coql(select + " limit " + offset + ", 200");
      rows = rows.concat(page);
      if (page.length < 200) break;
    }
    return rows;
  }
  const optional = function (select) {
    return App.fetchWithFallback(function () { return query(select); }, null);
  };

  function toDeal(r) {
    const f = FIELDS.deal;
    const stage = stageName(r[f.stage]);
    const known = STAGES.find(function (s) { return s.name === stage; });
    return {
      id: r.id,
      accountId: r[f.accountId] || null,
      contactId: r[f.contactId] || null,
      campaignId: r[f.campaignId] || null,
      name: r[f.name] || "(unnamed deal)",
      account: r[f.accountName] || "",
      contact: [r[f.contactFirst], r[f.contactLast]].filter(Boolean).join(" "),
      country: countryCode(r[f.country]),
      service: r[f.service] || "",
      amount: Number(r[f.amount]) || 0, // assumes amounts are in ₹ (CRM base currency)
      stage: stage,
      probability: r[f.probability] != null ? Number(r[f.probability]) : known ? known.prob : 0,
      owner: r[f.owner] || "",
      bde: r[f.bde] || "",
      leadSource: r[f.leadSource],
      close: r[f.close] || "",
      created: toDate(r[f.created])
    };
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

  // Builds one country's raw record from fetched rows.
  function liveRaw(code, days, rows) {
    const mine = function (list, field) {
      return list && list.filter(function (r) { return countryCode(r[field]) === code; });
    };
    const deals = rows.deals.filter(function (d) { return d.country === code; });
    const accounts = mine(rows.accounts, FIELDS.account.country);
    const contacts = mine(rows.contacts, FIELDS.contact.country);
    const leads = mine(rows.leads, FIELDS.lead.country);
    const C = FIELDS.campaign;
    const Ld = FIELDS.lead;
    const campaignRows = mine(rows.campaigns, C.country);
    const open = deals.filter(isOpen);
    const since = daysAgo(days), before = daysAgo(days * 2);

    const campaignType = new Map((rows.campaigns || []).map(function (c) { return [c.id, c[C.type]]; }));
    const sourceOf = function (d) { return channelName(d.leadSource) || channelName(campaignType.get(d.campaignId)); };
    const channelsOf = function (d) {
      return new Set((rows.touches.get(d.contactId) || []).filter(function (t) {
        const age = (d.created - t.date) / 864e5;
        return age >= 0 && age <= INFLUENCE_DAYS;
      }).map(function (t) { return t.channel; }));
    };

    // The one attribution rule, used for the totals and for each month of the trend.
    function attributionOf(list) {
      const out = {
        rows: CHANNELS.map(function (c) { return { channel: c, sourced: 0, influenced: 0 }; }),
        sourced: 0,
        influenced: 0
      };
      list.filter(function (d) { return d.stage !== LOST; }).forEach(function (d) {
        const source = sourceOf(d);
        if (source) {
          out.rows[CHANNELS.indexOf(source)].sourced += d.amount;
          out.sourced += d.amount;
        }
        const channels = channelsOf(d);
        channels.forEach(function (c) { out.rows[CHANNELS.indexOf(c)].influenced += d.amount; });
        if (channels.size && isOpen(d)) out.influenced += d.amount; // counted once per deal
      });
      return out;
    }
    const totals = attributionOf(deals);
    const attributionRows = totals.rows, sourced = totals.sourced, influenced = totals.influenced;
    const trendMonths = lastMonths(12);
    const byMonth = trendMonths.map(function (month) {
      return attributionOf(deals.filter(function (d) { return d.created && inMonth(d.created.toISOString(), month); })).rows;
    });
    const history = function (key) {
      return CHANNELS.map(function (_, c) { return byMonth.map(function (rowsOfMonth) { return rowsOfMonth[c][key]; }); });
    };

    // Quarter to date.
    const now = new Date();
    const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    const quarterEnd = new Date(quarterStart.getFullYear(), quarterStart.getMonth() + 3, 1);
    const closedWonQuarter = sum(deals.filter(function (d) {
      return d.stage === WON && within(d.close, quarterStart, quarterEnd);
    }), function (d) { return d.amount; });
    const targets = mine(rows.targets, TARGETS.country);
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
          owner: r[LEAD_RESPONSE.owner] || "Unassigned",
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
      const done = deals.filter(function (d) { return !isOpen(d) && inMonth(d.close, month); });
      const wins = done.filter(function (d) { return d.stage === WON; });
      return { label: month.label, won: wins.length, lost: done.length - wins.length, closed: done.length,
               revenue: sum(wins, function (d) { return d.amount; }) };
    });
    const last6 = monthly.slice(6), prev6 = monthly.slice(0, 6);
    const winOf = function (list) {
      return { won: sum(list, function (x) { return x.won; }), closed: sum(list, function (x) { return x.closed; }) };
    };

    // Counts in a window. null (shown as "—") when the module or field is unavailable.
    const fieldTotal = function (types, field, from, to) {
      if (!campaignRows || !(rows.campaigns || []).some(function (r) { return r[field] != null; })) return null;
      return sum(campaignRows.filter(function (r) {
        return within(r[C.start], from, to) && (!types || types.indexOf(channelName(r[C.type])) !== -1);
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
    const sourcedDeals = deals.filter(function (d) { return d.created && d.created >= since && sourceOf(d); });

    function windowMetrics(from, to) {
      // TODO: converted leads are not returned by default; include them if leads convert quickly.
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
    const earlier = windowMetrics(before, since);

    const newAccounts = accounts && accounts.filter(function (a) { return within(a[FIELDS.account.created], since); }).length;
    const prevAccounts = accounts && accounts.filter(function (a) { return within(a[FIELDS.account.created], before, since); }).length;

    const temperature = {};
    (accounts || []).forEach(function (a) {
      const t = a[FIELDS.account.temperature];
      if (t) temperature[t] = (temperature[t] || 0) + 1;
    });

    const byStage = {};
    open.forEach(function (d) { byStage[d.stage] = (byStage[d.stage] || 0) + d.amount; });
    const reached = deals.map(function (d) { return STAGES.findIndex(function (s) { return s.name === d.stage; }); });

    const services = rows.serviceGroups
      ? rows.serviceGroups.filter(function (g) { return countryCode(g.country) === code; })
      : open.map(function (d) { return { key: serviceKey(d.service), value: d.amount, deals: 1 }; });

    return {
      code: code,
      asOf: now.toISOString().slice(0, 10),
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
      pipeline: sum(open, function (d) { return d.amount; }),
      forecast: sum(open, function (d) { return d.amount * d.probability / 100; }),
      openDeals: open.length,
      byStage: byStage,
      // A deal at one stage has reached the earlier ones. Lost deals are left out.
      funnel: STAGES.map(function (s, i) { return reached.filter(function (x) { return x >= i; }).length; }),
      services: services,
      win: winOf(last6),
      newAccounts: accounts ? newAccounts : null,
      influenced: contacts || rows.campaigns ? influenced : null,
      months: last6,
      temperature: temperature,
      attribution: attributionRows,
      marketing: Object.assign({}, current, {
        sourced: sourced,
        opportunities: sourcedDeals.length,
        won: sourcedDeals.filter(function (d) { return d.stage === WON; }).length
      }),
      // Pipeline, forecast, open-deal and attribution history isn't available, so no delta for those.
      previous: Object.assign({ pipeline: null, forecast: null, openDeals: null, influenced: null, sourced: null,
                                win: winOf(prev6), newAccounts: accounts ? prevAccounts : null }, earlier),
      spark: {
        win: monthly.map(function (x) { return { won: x.won, closed: x.closed }; }),
        newAccounts: accounts ? months12.map(function (month) {
          return accounts.filter(function (a) { return inMonth(a[FIELDS.account.created], month); }).length;
        }) : []
      },
      campaigns: (campaignRows || []).map(function (c) {
        const linked = deals.filter(function (d) { return d.campaignId === c.id; });
        const state = String(c[C.status] || "").toLowerCase();
        return {
          name: c[C.name] || "(unnamed campaign)",
          channel: channelName(c[C.type]) || c[C.type] || "—",
          spend: c[C.spend] != null ? Number(c[C.spend]) : null,
          leads: c[C.leads] != null ? Number(c[C.leads]) : null,
          pipeline: sum(linked.filter(isOpen), function (d) { return d.amount; }),
          revenue: sum(linked.filter(function (d) { return d.stage === WON; }), function (d) { return d.amount; }),
          status: /complete|ended/.test(state) ? "Ended" : /inactive|hold|paus/.test(state) ? "Paused" : "Active"
        };
      }),
      deals: deals,
      activity: liveActivity(deals, accounts || [], contacts || [], rows.activity)
    };
  }

  // Notes, meetings, calls and tasks linked to this country's records.
  function liveActivity(deals, accounts, contacts, activity) {
    const related = new Map();
    accounts.forEach(function (a) { related.set(a.id, {}); });
    contacts.forEach(function (c) { related.set(c.id, { rating: c[FIELDS.contact.rating] }); });
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
      if (info.probability !== undefined) {
        item.pill = info.probability + "%";
        item.pillType = "blue";
      } else if (ratingTypes[info.rating]) {
        item.pill = info.rating;
        item.pillType = ratingTypes[info.rating];
      }
      items.push(item);
    });
    return items;
  }

  // TODO: confirm the activity modules and fields.
  async function fetchActivity() {
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
      }, []);
      return rows.map(function (r) {
        return {
          icon: s.icon, verb: s.verb, title: r[s.title] || "", when: toDate(r.Created_Time),
          links: s.links.map(function (f) { return r[f] && (r[f].id || r[f]); }).filter(Boolean)
        };
      });
    }));
    return lists.flat();
  }

  async function fetchLive(state) {
    const codes = state.country === "ALL" ? CODES : [state.country];
    const values = quoted(codes.reduce(function (all, c) { return all.concat(COUNTRY_VALUES[c]); }, []));
    const select = function (module, fields, countryField) {
      return "select " + fields.join(", ") + " from " + module + " where " + countryField + " in (" + values + ")";
    };
    const D = FIELDS.deal, A = FIELDS.account, C = FIELDS.contact, M = FIELDS.campaign, Ld = FIELDS.lead;
    const dealFields = Object.keys(D).map(function (k) { return D[k]; });

    // Deals are essential: if this throws, loadData falls back to sample data.
    const dealRows = await query(select("Deals", dealFields, D.country));
    const results = await Promise.all([
      optional(select("Accounts", [A.country, A.created, A.temperature], A.country)),
      optional(select("Contacts", [C.country, C.rating, C.engaged, C.channels], C.country)),
      optional(select("Campaigns", Object.keys(M).map(function (k) { return M[k]; }), M.country)),
      optional(select("Leads", ["id", Ld.source, Ld.status, Ld.created, Ld.country], Ld.country)),
      // Open pipeline grouped by service line and country.
      optional("select " + D.service + ", " + D.country + ", SUM(" + D.amount + "), COUNT(id) from Deals where ((" +
        D.country + " in (" + values + ")) and (" + D.stage + " not in (" + quoted(CLOSED_VALUES) + "))) group by " +
        D.service + ", " + D.country),
      fetchActivity(),
      optional(select(TARGETS.module, [TARGETS.country, TARGETS.period, TARGETS.amount], TARGETS.country)),
      // Queried separately so a missing custom field doesn't fail the main deals query.
      optional(select("Deals", ["id", DEAL_AGES.lastActivity, DEAL_AGES.stageEntered], D.country)),
      optional("select id, " + LEAD_RESPONSE.owner + " from Leads where " + Ld.country + " in (" + values + ")"),
      Promise.all(LEAD_RESPONSE.activityModules.map(function (m) {
        return optional("select Who_Id, What_Id, Created_Time from " + m + " where Created_Time is not null order by Created_Time desc");
      }))
    ]);

    const ages = new Map((results[7] || []).map(function (r) { return [r.id, r]; }));
    const owners = new Map((results[8] || []).map(function (r) { return [r.id, r[LEAD_RESPONSE.owner]]; }));
    if (results[3]) results[3].forEach(function (l) { l[LEAD_RESPONSE.owner] = owners.get(l.id); });
    const firstTouch = new Map();
    results[9].forEach(function (list) {
      (list || []).forEach(function (a) {
        const when = toDate(a.Created_Time);
        [a.Who_Id, a.What_Id].forEach(function (link) {
          const id = link && (link.id || link);
          if (id && when && (!firstTouch.has(id) || when < firstTouch.get(id))) firstTouch.set(id, when);
        });
      });
    });
    const day = function (v) { return v ? String(v).slice(0, 10) : null; };

    const groups = results[4] && results[4].map(function (r) {
      const keys = Object.keys(r);
      return {
        key: serviceKey(r[D.service]),
        country: r[D.country],
        value: Number(r[keys.find(function (k) { return /^sum/i.test(k); })]) || 0,
        deals: Number(r[keys.find(function (k) { return /^count/i.test(k); })]) || 0
      };
    });
    const rows = {
      targets: results[6],
      firstTouch: firstTouch,
      deals: dealRows.map(function (r) {
        const deal = toDeal(r), extra = ages.get(r.id) || {};
        deal.lastActivityDate = day(extra[DEAL_AGES.lastActivity] || r[D.created]);
        deal.stageEnteredDate = day(extra[DEAL_AGES.stageEntered]);
        return deal;
      }),
      accounts: results[0], contacts: results[1], campaigns: results[2], leads: results[3],
      serviceGroups: groups, activity: results[5]
    };
    rows.touches = await buildTouches(rows.campaigns, rows.contacts, rows.deals);

    const days = RANGE_DAYS[state.range] || 30;
    return build(codes.map(function (c) { return liveRaw(c, days, rows); }), state, "live");
  }

  // The only entry point tabs' data comes through.
  async function loadData(state) {
    const live = await App.fetchWithFallback(function () { return fetchLive(state); }, null);
    return live || getData(state);
  }

  return {
    CODES: CODES,
    SERVICES: SERVICES,
    STAGES: STAGES,
    atRisk: atRisk,
    serviceKey: serviceKey,
    serviceTotals: serviceTotals,
    shares: shares,
    getData: getData,
    loadData: loadData
  };
})();
