// Run with: node --test test/global-search.test.js
// The header search, with CRM replaced by a fake that answers COQL like Zoho (case-insensitive "like").
const test = require('node:test');
const assert = require('node:assert');
const { find } = require('../app/js/global-search.js');

const CODES = { US: ['US', 'United States'], UK: ['UK', 'United Kingdom'], AU: ['AU', 'Australia'] };
const countryCode = v => Object.keys(CODES).find(c => CODES[c].some(x => x.toLowerCase() === String(v || '').trim().toLowerCase())) || null;

const db = {
  Accounts: [
    { id: 'A1', Account_Name: 'Acme Pty Ltd', Billing_City: 'Sydney', Billing_Country: 'Australia', Website: 'acme.com.au' },
    { id: 'A2', Account_Name: 'Blue Harbour', Billing_City: 'London', Billing_Country: 'United Kingdom', Website: 'blueharbour.co.uk' }
  ],
  Deals: [
    { id: 'D1', Deal_Name: 'Payroll rollout', Stage: 'Qualification', Account_Name: { id: 'A1', name: 'Acme Pty Ltd' }, 'Account_Name.Billing_Country': 'Australia' },
    { id: 'D2', Deal_Name: 'Tax review', Stage: 'Proposal/Price Quote', Account_Name: { id: 'A2', name: 'Blue Harbour' }, 'Account_Name.Billing_Country': 'United Kingdom' },
    { id: 'D3', Deal_Name: 'ACME bookkeeping', Stage: 'Negotiation/Review', Account_Name: { id: 'A1', name: 'Acme Pty Ltd' }, 'Account_Name.Billing_Country': 'Australia' }
  ],
  Contacts: [
    { id: 'C1', Full_Name: 'Jo Person', First_Name: 'Jo', Last_Name: 'Person', Email: 'jo@acme.com.au', Mailing_Country: 'Australia', Account_Name: { id: 'A1', name: 'Acme Pty Ltd' } },
    { id: 'C2', Full_Name: 'Sam Smith', First_Name: 'Sam', Last_Name: 'Smith', Email: 'sam@blueharbour.co.uk', Mailing_Country: null, Account_Name: { id: 'A2', name: 'Blue Harbour' }, 'Account_Name.Billing_Country': 'United Kingdom' }
  ]
};
// A tiny COQL: "where" with "X like '%v%'" (case-insensitive) joined by "or", and "Account_Name in ('id', ...)"
function fakeCoql(log, opts = {}) {
  return async query => {
    log.push(query);
    if (opts.fail && opts.fail(query)) throw new Error('INVALID_QUERY');
    const module = /from (\w+)/.exec(query)[1];
    const where = /where \(?(.*?)\)? order by/.exec(query)[1];
    const likes = [...where.matchAll(/(\w+) like '%(.*?)%'/g)].map(m => [m[1], m[2].toLowerCase()]);
    const ins = /Account_Name in \(([^)]*)\)/.exec(where);
    const ids = ins ? ins[1].split(',').map(x => x.trim().replace(/'/g, '')) : [];
    return db[module].filter(r => likes.some(([f, v]) => String(r[f] || '').toLowerCase().includes(v)) || (r.Account_Name && ids.includes(r.Account_Name.id)));
  };
}
const run = (q, country = 'ALL', opts) => { const log = []; return find(q, country, { coql: fakeCoql(log, opts), countryCode }).then(r => ({ r, log })); };
const names = list => list.map(x => x.name);

test('empty or whitespace-only input asks CRM nothing', async () => {
  for (const q of ['', '   ', '\t']) {
    const { r, log } = await run(q);
    assert.equal(log.length, 0);
    assert.deepEqual([r.deals, r.accounts, r.contacts], [[], [], []]);
  }
});

test('matching is partial and case-insensitive, grouped by type, with a secondary line', async () => {
  const { r } = await run('aCmE');
  assert.deepEqual(names(r.accounts), ['Acme Pty Ltd']);
  assert.equal(r.accounts[0].detail, 'Sydney, Australia');
  assert.deepEqual(names(r.deals).sort(), ['ACME bookkeeping', 'Payroll rollout'], 'deals of a matching company are found too');
  assert.equal(r.deals.find(d => d.id === 'D1').detail, 'Acme Pty Ltd · Qualification');
  assert.deepEqual(names(r.contacts), ['Jo Person']);
  assert.equal(r.contacts[0].detail, 'jo@acme.com.au · Acme Pty Ltd');
  assert.equal(r.deals[0].name, 'ACME bookkeeping', 'a name that starts with the search comes first');
});

test('finds by email and by several words', async () => {
  assert.deepEqual(names((await run('sam@blue')).r.contacts), ['Sam Smith']);
  assert.deepEqual(names((await run('jo person')).r.contacts), ['Jo Person']);
  assert.deepEqual(names((await run('tax rev')).r.deals), ['Tax review']);
});

test('respects the header country filter', async () => {
  const uk = (await run('a', 'UK')).r;
  assert.ok(uk.accounts.every(a => a.id === 'A2') && uk.accounts.length === 1);
  assert.deepEqual(names(uk.deals), ['Tax review']);
  assert.deepEqual(names(uk.contacts), ['Sam Smith'], 'country from the account when the contact has none');
  const au = (await run('acme', 'AU')).r;
  assert.equal(au.deals.length, 2);
  assert.equal((await run('acme', 'US')).r.deals.length, 0);
});

test('a CRM field that cannot be searched falls back to names only; a failed type is reported', async () => {
  const { r, log } = await run('acme', 'ALL', { fail: q => /Website like/.test(q) });
  assert.deepEqual(names(r.accounts), ['Acme Pty Ltd']);
  assert.ok(log.some(q => /from Accounts where Account_Name like/.test(q)), 'retried without Website');
  assert.deepEqual(r.failed, []);
  const broken = await run('acme', 'ALL', { fail: q => /from Contacts/.test(q) });
  assert.deepEqual(broken.r.failed, ['Contacts']);
  assert.equal(broken.r.deals.length, 2, 'the other types still show');
});

test('quotes are escaped and at most 5 rows per type are shown', async () => {
  const { log } = await run("o'brien");
  assert.ok(log[0].includes("'%o\\'brien%'"));
  const many = Array.from({ length: 12 }, (_, i) => ({ id: 'X' + i, Deal_Name: 'Deal ' + i, Stage: 'Qualification', Account_Name: null }));
  db.Deals.push(...many);
  try { assert.equal((await run('deal')).r.deals.length, 5); } finally { db.Deals.splice(-12); }
});
