// Run with: node --test test/revenue-forecast.test.js
// The Revenue Forecast formulas on a fixed set of sample deals and a fixed "today".
const test = require('node:test');
const assert = require('node:assert');
const F = require('../app/js/revenue-forecast-calc.js');

const now = new Date(2026, 10, 26, 15, 0); // 26 Nov 2026, afternoon
const ymd = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const won = (id, amount, date) => ({ id, group: 'confirmed', amount, close: date, closedOn: date, bucket: null });
const open = (id, amount, date, bucket) => ({ id, group: 'unconfirmed', amount, close: date, bucket });
const lost = (id, amount, date) => ({ id, group: 'lost', amount, close: date, closedOn: date, bucket: null });

const deals = [
  won('w1', 100000, ymd(2026, 11, 20)),        // won in the last 30 days
  won('w2', 50000, ymd(2026, 10, 28)),         // won in the last 30 days (29 days ago)
  won('w3', 70000, ymd(2026, 10, 1)),          // won earlier than that
  open('o1', 200000, ymd(2026, 12, 5), 50),    // open, closing within 30 days
  open('o2', 80000, ymd(2026, 12, 25), 0),     // open at 0%, within 30 days
  open('o3', 40000, ymd(2026, 12, 1), 100),    // open at 100%, within 30 days
  open('o4', 999999, ymd(2027, 2, 10), 90),    // open, closing later
  open('o5', 30000, ymd(2026, 11, 2), 75),     // open, closing date passed (overdue)
  open('o6', 25000, '', 50),                   // open with no closing date
  open('o7', null, ymd(2026, 12, 10), 25),     // open with no amount
  lost('l1', 60000, ymd(2026, 11, 15)),        // lost
  won('w1', 100000, ymd(2026, 11, 20))         // the same deal again: counted once
];

test('won revenue: last 30 days, each deal once', () => {
  assert.deepStrictEqual(F.wonRevenue(deals, 30, now), { amount: 150000, count: 2 });
});
test('pipeline forecast: open deals closing in the next 30 days, amount × stage %', () => {
  // o1 200000×50% + o2 80000×0% + o3 40000×100% + o7 0×25%
  assert.deepStrictEqual(F.pipelineForecast(deals, 30, now), { amount: 140000, count: 4 });
});
test('best case: the same deals at full amount, never below the forecast', () => {
  const best = F.bestCase(deals, 30, now), fc = F.pipelineForecast(deals, 30, now);
  assert.deepStrictEqual(best, { amount: 320000, count: 4 });
  assert.ok(fc.amount <= best.amount);
});
test('lost, overdue, undated and later deals stay out of every figure', () => {
  assert.deepStrictEqual(F.leftOut(deals, now), { overdue: 1, noDate: 1 });
});
test('trend: not enough history with fewer than 3 months of revenue', () => {
  const t = F.trendPrediction(deals, now);
  assert.strictEqual(t.ok, false); // only October has won revenue among the 6 completed months
});
test('trend: least squares on 6 completed months, predicted for month 7', () => {
  const history = [10, 20, 30, 40, 50, 60].map((v, i) => won('h' + i, v * 1000, ymd(2026, 5 + i, 15))); // May..Oct
  const t = F.trendPrediction(history, now);
  assert.strictEqual(t.ok, true);
  assert.strictEqual(Math.round(t.slope), 10000);
  assert.strictEqual(Math.round(t.predicted), 70000);
  // Open deals never feed the trend
  assert.strictEqual(F.trendPrediction(history.concat(open('x', 5e6, ymd(2026, 9, 1), 90)), now).predicted, t.predicted);
});
test('trend: a falling line is floored at 0', () => {
  const history = [100, 80, 60, 40, 20, 5].map((v, i) => won('f' + i, v * 1000, ymd(2026, 5 + i, 10))); // May..Oct, falling
  assert.strictEqual(F.trendPrediction(history, now).predicted, 0);
});
test('chart: 6 past months of won revenue, then 3 months of pipeline forecast', () => {
  const c = F.chartData(deals, now);
  assert.strictEqual(c.past.length, 6);
  assert.deepStrictEqual(c.past.map(m => m.amount), [0, 0, 0, 0, 0, 120000]); // October: w3 70,000 + w2 50,000
  // This month (from today), December, January; o4 closes in February, beyond the chart
  assert.deepStrictEqual(c.future.map(m => m.amount), [0, 140000, 0]);
});
