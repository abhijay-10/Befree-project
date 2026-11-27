// Run with: node --test test/admin-data.test.js
// Loads the widget's real data.js with a stub for the Zoho side, and checks the calculations on made-up CRM rows.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ctx = { App: { isEmbedded: false }, console: { warn() {}, info() {}, table() {}, log() {} } };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../app/js/data.js'), 'utf8'), ctx);
const Data = ctx.Data;
const T = Data._test;

const now = new Date();
const day = n => T.localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + n)); // n days from today
let nextId = 1;
const row = o => Object.assign({
  id: String(nextId++), Deal_Name: 'Deal', Stage: 'Qualification', Amount: 1000, Closing_Date: day(10),
  Country: 'US', Services_List: ['Accounting Services'], Created_Time: day(-20) + 'T10:00:00+05:30',
  Last_Activity_Time: day(-1) + 'T10:00:00+05:30'
}, o);

// Same steps as fetchRows + fetchLive: tag the deals, one raw record per country, then the view for the filter.
function view(rows, country = 'ALL', range = '30d', extra = {}) {
  const deals = rows.map(T.toDeal);
  const all = Object.assign({ deals, accounts: [], contacts: [], campaigns: [], leads: [], convertedKnown: true, activity: [], targets: [],
    firstTouch: new Map(), touches: new Map(), problems: [] }, extra);
  T.setCountries(all, rows);
  T.tagChannels(all.deals, all.campaigns, all.touches);
  const raws = ['US', 'UK', 'AU', T.OTHER_COUNTRY].map(c => T.liveRaw(c, range, all));
  const picked = country === 'ALL' ? raws : raws.filter(r => r.code === country);
  // A custom range is { range: 'custom', from, to }, as in the header state
  return T.build(picked, typeof range === 'string' ? { country, range } : Object.assign({ country }, range), 'live');
}
const won = o => row(Object.assign({ Stage: 'Closed Won', Closing_Date: day(-3) }, o));

/* ---------- stages ---------- */

test('stage decides the group and the %, not the Probability field', () => {
  assert.equal(T.stageBucket('Qualification'), 10);
  assert.equal(T.stageBucket('Needs Analysis'), 20);
  assert.equal(T.stageBucket('Value Proposition'), 40);
  assert.equal(T.stageBucket('Identify Decision Makers'), 60);
  // Zoho may give the same stage as "Id. Decision Makers": one stage, one name, 60%
  const idDm = T.toDeal(row({ Stage: 'Id. Decision Makers' }));
  assert.equal(idDm.stage, 'Identify Decision Makers');
  assert.equal(idDm.bucket, 60);
  assert.equal(T.stageBucket('Proposal/Price Quote'), 75);
  assert.equal(T.stageBucket('Negotiation/Review'), 90);
  assert.equal(T.stageBucket('Verbal commitment'), 90);
  const d = T.toDeal(row({ Stage: 'Qualification', Probability: 80 }));
  assert.equal(d.group, 'unconfirmed');
  assert.equal(d.probability, 10);
  assert.equal(T.toDeal(row({ Stage: 'Closed Won', Probability: 10 })).group, 'confirmed');
  assert.equal(T.toDeal(row({ Stage: 'Closed-Lost to Competition' })).group, 'lost');
});

test('stage buckets add up exactly to the unconfirmed KPIs, including unmapped stages', () => {
  const data = view([
    row({ Stage: 'Qualification', Amount: 100 }), row({ Stage: 'Qualification', Amount: 50.5 }),
    row({ Stage: 'Value Proposition', Amount: 200 }), row({ Stage: 'Negotiation/Review', Amount: 300 }),
    row({ Stage: 'Some new stage', Amount: 7 }), won({ Amount: 999 }), row({ Stage: 'Closed Lost', Amount: 5 })
  ]);
  const b = data.byBucket;
  assert.deepEqual([10, 20, 40, 60, 75, 90].map(k => b[k].count), [2, 0, 1, 0, 0, 1]);
  assert.equal(b.none.count, 1);
  const count = Object.values(b).reduce((t, x) => t + x.count, 0);
  const amount = Object.values(b).reduce((t, x) => t + x.amount, 0);
  assert.equal(count, data.kpis.unconfirmedCount);
  assert.equal(count, 5);
  assert.equal(amount, data.kpis.unconfirmedAmount);
  assert.equal(amount, 657.5);
  assert.equal(data.kpis.weighted, 150.5 * 0.1 + 200 * 0.4 + 300 * 0.9);
  assert.equal(data.kpis.confirmedAmount, 999);
  assert.equal(data.kpis.confirmedCount, 1);
});

/* ---------- confirmed: date range and currency ---------- */

test('confirmed deals are counted by Closing Date in the range', () => {
  const data = view([won({ Amount: 10, Closing_Date: day(-5) }), won({ Amount: 20, Closing_Date: day(-45) }),
    won({ Amount: 40, Closing_Date: day(5) })]); // won early: counts as today
  assert.equal(data.kpis.confirmedAmount, 50);
  assert.equal(data.confirmedDeals.length, 2);
});

test('amounts in another currency are converted, and never added without a rate', () => {
  const data = view([won({ Amount: 100, Currency: 'USD', Exchange_Rate: 0.0125 }), won({ Amount: 100, Currency: 'GBP' }),
    won({ Amount: 300, Currency: 'INR', Exchange_Rate: 1 })]);
  assert.equal(data.kpis.confirmedAmount, 8000 + 0 + 300);
  assert.equal(T.toDeal(won({ Currency: 'GBP' })).unconverted, true);
});

/* ---------- countries ---------- */

test('All countries = US + UK + AU + country not set, and no deal is dropped', () => {
  const rows = [won({ Country: 'US', Amount: 1 }), won({ Country: 'United Kingdom', Amount: 2 }), won({ Country: 'Australia', Amount: 4 }),
    won({ Country: '', Amount: 8 }), won({ Country: 'India', Amount: 16 }), row({ Country: 'AU', Amount: 32 }), row({ Country: '', Amount: 64 })];
  const all = view(rows);
  assert.equal(all.kpis.confirmedAmount, 31);
  assert.equal(all.kpis.confirmedCount, 5);
  assert.equal(all.kpis.unconfirmedAmount, 96);
  const parts = ['US', 'UK', 'AU'].map(c => view(rows, c));
  assert.deepEqual(parts.map(p => p.kpis.confirmedAmount), [1, 2, 4]);
  const other = all.options.won.byCountry.find(c => c.label === 'Other');
  assert.equal(other.value, 24);
  assert.equal(all.options.won.byCountry.reduce((t, c) => t + c.value, 0), all.kpis.confirmedAmount);
  // Shares come from the totals, and add up to 100.
  assert.equal(Data.shares(all.options.won.byCountry.map(c => c.value)).reduce((t, v) => t + Math.round(v * 10), 0), 1000);
});

/* ---------- services ---------- */

test('a deal with several services is split equally, to the paisa, and counted once', () => {
  assert.deepEqual(Array.from(T.splitAmount(100, 3)), [33.34, 33.33, 33.33]);
  assert.deepEqual(Array.from(T.splitAmount(0.05, 2)), [0.03, 0.02]);
  const data = view([won({ Amount: 100, Services_List: ['Accounting Services', 'Payroll Services', 'Virtual Admin Services'] }),
    won({ Amount: 50, Services_List: [] }), row({ Amount: 1e6, Services_List: ['Tax Services'] })]);
  const total = data.services.reduce((t, s) => t + Math.round(s.value * 100), 0) / 100;
  assert.equal(total, 150);
  const deals = data.services.reduce((t, s) => t + s.deals, 0);
  assert.ok(Math.abs(deals - 2) < 1e-9); // 2 confirmed deals, not 4
  assert.equal(data.services.find(s => s.key === 'tax').value, 0); // open deal not counted
  assert.equal(data.services.find(s => s.key === 'other').value, 50);
  assert.equal(data.services.find(s => s.key === 'accounting').dealCount, 1);
});

/* ---------- channels ---------- */

test('channels hold confirmed amounts only and add up to the confirmed total', () => {
  const data = view([won({ Amount: 10, Lead_Source: 'Website' }), won({ Amount: 20, Lead_Source: 'Cold Call' }),
    won({ Amount: 40 }), row({ Amount: 1000, Lead_Source: 'Website' }), row({ Stage: 'Closed Lost', Amount: 500, Lead_Source: 'Website' })]);
  const by = Object.fromEntries(data.attribution.map(r => [r.channel, r.sourced]));
  assert.equal(by.Website, 10);
  assert.equal(by['Other / not set'], 60);
  assert.equal(data.attribution.reduce((t, r) => t + r.sourced, 0), data.kpis.confirmedAmount);
  assert.equal(data.marketingKpis.sourcedRevenue, 10); // marketing channels only
});

/* ---------- at-risk ---------- */

test('at-risk: unconfirmed deals only, each once, with local dates', () => {
  const asOf = T.localDay(new Date());
  const deals = [
    row({ Amount: 1, Closing_Date: day(-2), Last_Activity_Time: day(-40) + 'T09:00:00+05:30', Stage_Entered_Date: day(-60) }), // all three
    row({ Amount: 2, Closing_Date: day(5), Last_Activity_Time: day(-20) + 'T09:00:00+05:30' }), // idle 20 days
    row({ Amount: 4, Closing_Date: day(5), Stage_Entered_Date: day(-31) }), // stuck
    row({ Amount: 8, Closing_Date: day(5) }), // fine
    won({ Amount: 16, Closing_Date: day(-30), Last_Activity_Time: day(-90) + 'T09:00:00+05:30' }), // confirmed: never at risk
    row({ Stage: 'Closed Lost', Amount: 32, Closing_Date: day(-30) })
  ].map(T.toDeal);
  const r = Data.atRisk(deals, 14, asOf);
  assert.equal(r.count, 3);
  assert.equal(r.openCount, 4);
  assert.equal(r.value, 7);
  assert.equal(r.pct, 7 / 15 * 100);
  assert.equal(r.rows[0].label, 'Overdue +2');
  assert.equal(new Set(r.rows.map(x => x.deal.id)).size, r.rows.length);
  assert.equal(Data.atRisk(deals, 30, asOf).count, 2); // the threshold only changes the idle rule
  assert.equal(r.rows.find(x => x.deal.amount === 2).idle, 20);
});

test('today is the local date, not the UTC date', () => {
  const d = new Date(2026, 10, 26, 0, 30);
  assert.equal(T.localDay(d), '2026-11-26');
});

/* ---------- Won only / Won + Open ---------- */

const COUNTRIES = ['ALL', 'US', 'UK', 'AU', 'Other'];
const RANGES = ['7d', '30d', '90d', '12m', 'all'];
const close = (a, b) => Math.abs(a - b) < 0.005;
const mixed = () => [
  won({ Country: 'US', Amount: 1500000, Closing_Date: day(0), Lead_Source: 'Website', Services_List: ['Paraplanning Services', 'Mortgage Services', 'Virtual Admin Services'] }),
  won({ Country: 'US', Amount: 1000.01, Closing_Date: day(-6), Lead_Source: 'Cold Call' }),
  won({ Country: 'UK', Amount: 2500, Closing_Date: day(-29), Services_List: ['Tax Services', 'Payroll Services'] }),
  won({ Country: 'AU', Amount: 700, Closing_Date: day(-89), Lead_Source: 'Google AdWords' }),
  won({ Country: 'AU', Amount: 333.33, Closing_Date: day(-364), Services_List: [] }),
  won({ Country: '', Amount: 50, Closing_Date: day(-400) }),
  row({ Country: 'US', Amount: 1500000, Stage: 'Qualification', Lead_Source: 'Email' }),
  row({ Country: 'AU', Amount: 5000000, Stage: 'Negotiation/Review', Services_List: ['Accounting Services', 'Bookkeeping Services', 'Tax Services'] }),
  row({ Country: '', Amount: 100, Stage: 'Identify Decision Makers' }),
  row({ Country: 'UK', Amount: 9, Stage: 'Closed Lost' }),
  row({ Country: 'US', Amount: 77, Stage: 'Closed-Lost to Competition', Closing_Date: day(-1) })
];

test('every option, country and date: won + open = Won + Open, and the parts add up', () => {
  const rows = mixed();
  for (const range of RANGES) {
    const all = view(rows, 'ALL', range);
    for (const country of COUNTRIES) {
      const o = view(rows, country, range).options;
      for (const f of ['count', 'amount', 'sourced']) assert.ok(close(o.won[f] + o.open[f], o.wonOpen[f]), `${country} ${range} ${f}`);
      for (const name of ['won', 'open', 'wonOpen']) {
        const b = o[name];
        assert.ok(close(b.byCountry.reduce((t, c) => t + c.value, 0), b.amount), `${country} ${range} ${name} countries`);
        assert.ok(close(b.services.reduce((t, s) => t + s.value, 0), b.amount), `${country} ${range} ${name} services`);
        assert.ok(close(b.services.reduce((t, s) => t + s.deals, 0), b.count), `${country} ${range} ${name} deal shares`);
      }
    }
    // US + UK + AU + Country not set = All countries, for every option.
    for (const name of ['won', 'open', 'wonOpen']) {
      for (const f of ['count', 'amount', 'sourced']) {
        const parts = ['US', 'UK', 'AU', 'Other'].reduce((t, c) => t + view(rows, c, range).options[name][f], 0);
        assert.ok(close(parts, all.options[name][f]), `${range} ${name} ${f}: ${parts} vs ${all.options[name][f]}`);
      }
    }
    // Channels add up to the confirmed total; Won only and Open only match the KPIs.
    assert.ok(close(all.attribution.reduce((t, r) => t + r.sourced, 0), all.kpis.confirmedAmount), range + ' channels');
    assert.ok(close(all.options.won.amount, all.kpis.confirmedAmount), range + ' won = KPI');
    assert.ok(close(all.options.open.amount, all.kpis.unconfirmedAmount), range + ' open = KPI');
  }
});

test('open deals are never hidden by the date filter; lost deals are never included', () => {
  const rows = mixed();
  const opens = RANGES.map(r => view(rows, 'ALL', r).options.open.amount);
  assert.ok(opens.every(v => v === opens[0]));
  assert.equal(opens[0], 1500000 + 5000000 + 100);
  assert.deepEqual(RANGES.map(r => view(rows, 'ALL', r).options.won.count), [2, 3, 4, 5, 6]);
});

test('first and last day of a period', () => {
  for (const [range, n] of [['7d', 7], ['30d', 30], ['90d', 90], ['12m', 365]]) {
    const first = won({ Amount: 1, Closing_Date: day(-(n - 1)) });   // first day: in
    const before = won({ Amount: 10, Closing_Date: day(-n) });       // the day before the period: out
    const last = won({ Amount: 100, Closing_Date: day(0) });         // today, the last day: in
    assert.equal(view([first, before, last], 'ALL', range).options.won.amount, 101, range);
  }
  assert.equal(view([won({ Amount: 5, Closing_Date: '2001-01-01' })], 'ALL', 'all').options.won.amount, 5);
  assert.equal(T.periodStart('7d', new Date(2026, 0, 3, 23, 59)).getTime(), new Date(2025, 11, 28).getTime());
  assert.throws(() => T.periodStart('2y'));
});

test('empty data gives zeros that still add up, and no errors', () => {
  for (const range of RANGES) for (const country of COUNTRIES) {
    const d = view([], country, range);
    assert.equal(d.options.wonOpen.amount, 0);
    assert.equal(d.kpis.confirmedCount, 0);
    assert.equal(d.marketingKpis.roi, null);
  }
});

test('ROI: same period for revenue and spend; no spend is "not available" (null), never 0 or infinity', () => {
  const campaign = (cost, start) => ({ id: 'c' + nextId++, Campaign_Name: 'C', Type: 'Email', Actual_Cost: cost, Start_Date: start, Country: 'US' });
  const rows = [won({ Amount: 1000, Lead_Source: 'Email' })];
  assert.equal(view(rows, 'US', '30d').marketingKpis.roi, null); // no campaigns
  assert.equal(view(rows, 'US', '30d', { campaigns: [campaign(0, day(-2))] }).marketingKpis.roi, null); // spend 0
  assert.equal(view(rows, 'US', '30d', { campaigns: [campaign(500, day(-40))] }).marketingKpis.roi, null); // spend outside the period
  assert.equal(view(rows, 'US', '30d', { campaigns: [campaign(250, day(-2)), campaign(500, day(-40))] }).marketingKpis.roi, 4);
  assert.equal(view(rows, 'US', 'all', { campaigns: [campaign(250, day(-2)), campaign(750, null)] }).marketingKpis.roi, 1);
});

test('multi-service deals: service amount fields are used only when they add up to Amount', () => {
  const services = ['Accounting Services', 'Payroll Services'];
  const fits = T.toDeal(won({ Amount: 1000, Services_List: services, Accounting_Services_Amount: 700, Payroll_Services_Amount: 300 }));
  assert.deepEqual(Array.from(fits.parts), [700, 300]);
  assert.equal(fits.serviceMismatch, false);
  const off = T.toDeal(won({ Amount: 1000, Services_List: services, Accounting_Services_Amount: 700, Payroll_Services_Amount: 200 }));
  assert.deepEqual(Array.from(off.parts), [500, 500]);
  assert.equal(off.serviceMismatch, true);
  const partly = T.toDeal(won({ Amount: 1000, Services_List: services, Accounting_Services_Amount: 1000 }));
  assert.deepEqual(Array.from(partly.parts), [500, 500]);
  assert.equal(partly.serviceMismatch, true);
  // Converted: the parts still add up exactly to the converted amount.
  const usd = T.toDeal(won({ Amount: 100, Currency: 'USD', Exchange_Rate: 0.012, Services_List: services.concat('Tax Services'),
    Accounting_Services_Amount: 33.33, Payroll_Services_Amount: 33.33, Tax_Services_Amount: 33.34 }));
  assert.equal(usd.amount, 8333.33);
  assert.equal(Math.round(usd.parts.reduce((t, v) => t + v, 0) * 100), Math.round(usd.amount * 100));
});

test('marketing influenced counts a deal once, even with several engaged channels', () => {
  const contact = { id: 'p1', name: 'P' };
  const created = day(-10) + 'T10:00:00+05:30';
  const engaged = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 20);
  const touches = new Map([['p1', [{ channel: 'Email', date: engaged }, { channel: 'Webinars', date: engaged }]]]);
  const d = view([won({ Amount: 1000, Contact_Name: contact, Created_Time: created }),
    row({ Amount: 50, Contact_Name: contact, Created_Time: created })], 'ALL', '30d', { touches });
  assert.equal(d.options.won.influenced, 1000);
  assert.equal(d.options.wonOpen.influenced, 1050);
  assert.equal(d.kpis.influenced, 1000);
  assert.equal(d.attribution.find(r => r.channel === 'Email').influenced, 1000); // per channel, never added together
});

test('Overview follows the header date range: chart slots add up to the period figures', () => {
  const lost = o => row(Object.assign({ Stage: 'Closed Lost', Closing_Date: day(-3) }, o));
  const rows = [
    won({ Amount: 100, Closing_Date: day(0) }), won({ Amount: 200, Closing_Date: day(-6) }), won({ Amount: 400, Closing_Date: day(-20) }),
    won({ Amount: 800, Closing_Date: day(-80) }), won({ Amount: 1600, Closing_Date: day(-300) }), won({ Amount: 3200, Closing_Date: day(-900) }),
    lost({ Closing_Date: day(-2) }), lost({ Closing_Date: day(-50) }),
    row({ Created_Time: day(-1) + 'T10:00:00+05:30' }), row({ Created_Time: day(-40) + 'T10:00:00+05:30' })
  ];
  const leads = [day(-1), day(-25), day(-200)].map((d, i) => ({ id: 'L' + i, Full_Name: 'Lead ' + i, Country: 'US', Created_Time: d + 'T10:00:00+05:30' }));
  ['7d', '30d', '90d', '12m', 'all'].forEach(range => {
    const d = view(rows, 'ALL', range, { leads });
    const bars = d.periodBars, total = k => bars.reduce((t, b) => t + b[k], 0);
    assert.equal(total('revenue'), d.kpis.confirmedAmount, range + ': revenue bars = Confirmed amount');
    assert.equal(total('won'), d.kpis.confirmedCount, range + ': won bars = confirmed deals');
    const closed = total('won') + total('lost');
    assert.equal(d.kpis.winRate, closed ? total('won') / closed * 100 : null, range + ': win rate from the same period');
    assert.equal(d.leads.months.reduce((t, m) => t + m.created, 0), d.leads.created, range + ': lead bars = leads created');
    const all = Object.assign({ deals: rows.map(T.toDeal), accounts: [], contacts: [], campaigns: [], leads, convertedKnown: true, activity: [],
      targets: [], firstTouch: new Map(), touches: new Map(), problems: [] });
    T.setCountries(all, rows);
    T.tagChannels(all.deals, all.campaigns, all.touches);
    const country = ['US', 'UK', 'AU', T.OTHER_COUNTRY].map(c => T.countryRow(T.liveRaw(c, range, all))).reduce((t, c) => t + c.won, 0);
    assert.equal(country, total('won'), range + ': country won = won bars');
    assert.equal(d.periodFrom ? d.periodFrom.getTime() : null, T.periodStart(range) ? T.periodStart(range).getTime() : null);
  });
  // Slot sizes: 7 × 1 day, 6 × 5 days, 6 × 15 days; All time starts in the year of the first record
  assert.equal(T.periodSlots('7d').length, 7);
  assert.equal(T.periodSlots('30d').length, 6);
  assert.equal(T.periodSlots('90d').length, 6);
  assert.equal(T.periodSlots('all', new Date(now.getFullYear() - 2, 5, 1)).length, 3);
  const all = view(rows, 'ALL', 'all', { leads });
  assert.equal(all.periodBars[0].label, String(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 900).getFullYear()));
});

test('custom date range: every figure uses exactly the chosen days, both included', () => {
  const custom = { range: 'custom', from: day(-10), to: day(5) };
  const p = T.periodOf(custom);
  assert.equal(p.days, 16);
  const rows = [
    won({ Amount: 100, Closing_Date: day(-10) }), won({ Amount: 200, Closing_Date: day(-1) }),   // inside (first day, yesterday)
    won({ Amount: 400, Closing_Date: day(-11) }), won({ Amount: 800, Closing_Date: day(-40) }),  // before the range
    row({ Stage: 'Proposal/Price Quote', Amount: 1000, Closing_Date: day(5) }),                   // open, last day: in the forecast
    row({ Stage: 'Needs Analysis', Amount: 2000, Closing_Date: day(6) })                         // open, after the range: not
  ];
  const leads = [day(-10), day(0), day(-11), day(6)].map((d, i) => ({ id: 'C' + i, Full_Name: 'Lead ' + i, Country: 'US', Created_Time: d + 'T10:00:00+05:30' }));
  const d = view(rows, 'ALL', custom, { leads });
  assert.equal(d.kpis.confirmedAmount, 300);
  assert.equal(d.kpis.confirmedCount, 2);
  assert.equal(d.periodBars.reduce((t, b) => t + b.revenue, 0), 300, 'bars add up to the range');
  assert.equal(d.leads.created, 2);
  assert.equal(d.leads.months.reduce((t, m) => t + m.created, 0), 2);
  assert.equal(d.periodTo.getTime(), p.to.getTime());
  // Forecast: open deals closing inside the range from today on, at stage %
  const f = d.revenueForecast;
  assert.equal(f.custom, true);
  assert.equal(f.past[5].amount, 300);
  assert.equal(f.next.count, 1);
  assert.equal(f.next.weighted, 750);
  // A range that is over has no forecast
  const past = view(rows, 'ALL', { range: 'custom', from: day(-40), to: day(-2) }, { leads });
  assert.equal(past.revenueForecast.over, true);
  assert.equal(past.revenueForecast.next.count, 0);
  assert.equal(past.kpis.confirmedAmount, 1300);
});

test('revenue forecast: open deals past their Closing Date still count, and the open pipeline covers every open deal', () => {
  const rows = [
    row({ Stage: 'Proposal/Price Quote', Amount: 1000, Closing_Date: day(-20) }),  // overdue, 75%
    row({ Stage: 'Qualification', Amount: 2000, Closing_Date: day(-1) }),          // overdue, 10%
    row({ Stage: 'Negotiation/Review', Amount: 4000, Closing_Date: day(120) }),    // after the window, 90%
    row({ Stage: 'Needs Analysis', Amount: 500, Closing_Date: day(0) })            // closing today, 20%
  ];
  const f = view(rows, 'ALL', '30d').revenueForecast;
  assert.equal(f.next.count, 3, 'today + the 2 overdue deals');
  assert.equal(f.next.weighted, 750 + 200 + 100);
  assert.equal(f.next.best, 3500);
  assert.equal(f.overdue.count, 2);
  assert.equal(f.overdue.counted, true);
  assert.equal(f.pipeline.count, 4);
  assert.equal(f.pipeline.weighted, 750 + 200 + 3600 + 100);
  // A custom range that includes today (yesterday and today): the deal closing yesterday is counted
  const c = view(rows, 'ALL', { range: 'custom', from: day(-1), to: day(0) }).revenueForecast;
  assert.equal(c.over, false);
  assert.equal(c.next.count, 3);
  assert.equal(c.next.weighted, 1050);
  // A range that starts later does not take the overdue deals
  const later = view(rows, 'ALL', { range: 'custom', from: day(100), to: day(130) }).revenueForecast;
  assert.equal(later.next.count, 1);
  assert.equal(later.overdue.counted, false);
});
