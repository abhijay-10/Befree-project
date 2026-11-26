// Run with: node --test test/lead-rules.test.js
const test = require('node:test');
const assert = require('node:assert');
const R = require('../app/js/rules.js');
const C = require('../app/js/config.js');
// Example staff for these tests only. The real list in config.js starts empty.
C.users.push(...[['revops', 'RevOps', 'Admin', null], ['sam', 'Sam', 'BDM', 'UK'], ['tina', 'Tina', 'BDE', 'UK'], ['brad', 'Brad', 'BDM', 'US'],
  ['cooper', 'Cooper', 'BDE', 'US'], ['ross', 'Ross', 'BDM', 'AU'], ['rick', 'Rick', 'BDE', 'AU'], ['marketing', 'Marketing', 'Marketing', null]]
  .map(([id, name, role, country]) => ({ id, name, role, country })));

const now = new Date(2026, 10, 24, 12); // Tuesday
const ago = n => new Date(2026, 10, 24 - n, 9);
const touch = (contactId, n, type) => ({ contactId, date: ago(n), type: type || 'Email click', channel: 'Email' });
const view = o => ({
  now, user: C.users[0], contact: { id: 'c1' }, account: { country: 'UK', staff: 640 },
  contacts: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }], touches: [], tasks: [], meetings: [], deals: [], ...o
});
const temp = o => R.temperature(view(o));

test('segments at every boundary', () => {
  const codes = [1000, 999, 500, 499, 100, 99, 50, 49, 1, 0].map(n => R.segment(n).code);
  assert.deepEqual(codes, ['T1', 'T2', 'T2', 'T3-A', 'T3-A', 'T3-B', 'T3-B', 'T4', 'T4', '']);
});
test('every high-intent type makes the contact Hot', () => {
  for (const type of C.highIntentTypes) assert.equal(temp({ touches: [touch('c1', 1, type)] }).value, 'Hot', type);
  assert.equal(temp({ touches: [touch('c1', 1, 'Webinar')] }).value, 'Cold');
  assert.equal(temp({ touches: [touch('c2', 1, 'Pricing page')] }).value, 'Cold'); // a colleague's action
});
test('a self-booked meeting makes the contact Hot', () => {
  assert.equal(temp({ meetings: [{ selfBooked: true, bookedOn: ago(1), start: ago(-2) }] }).value, 'Hot');
  assert.equal(temp({ meetings: [{ selfBooked: false, bookedOn: ago(1), start: ago(-2) }] }).value, 'Cold');
});
test('Warm needs 2 different contacts within 30 days', () => {
  const t = temp({ touches: [touch('c1', 30), touch('c2', 2)] });
  assert.equal(t.value, 'Warm');
  assert.equal(t.reason, '2 of 3 contacts engaged in 30 days');
  assert.equal(temp({ touches: [touch('c1', 31), touch('c2', 2)] }).value, 'Cold');
  assert.equal(temp({ touches: [touch('c1', 1), touch('c1', 2)] }).value, 'Cold');
});
test('back to Cold ignores earlier activity but not later activity', () => {
  const contact = { id: 'c1', backToColdOn: ago(2) };
  assert.equal(temp({ contact, touches: [touch('c1', 3, 'Pricing page')] }).value, 'Cold');
  assert.equal(temp({ contact, touches: [touch('c1', 1, 'Pricing page')] }).value, 'Hot');
});
test('routing owner and due date', () => {
  const route = o => { const v = view(o); return R.routing(v, R.temperature(v)); };
  const warm = [touch('c1', 4), touch('c2', 1)]; // became Warm on Monday 23 Nov
  assert.equal(route({ touches: warm }).user.name, 'Tina');
  assert.equal(route({ touches: warm }).due.getDate(), 25);
  assert.equal(route({ touches: warm, account: { country: 'UK', staff: 1000 } }).user.name, 'Sam');
  assert.equal(route({ touches: [touch('c1', 0, 'Pricing page')], account: { country: 'US', staff: 20 } }).user.name, 'Brad');
  assert.equal(route({ touches: [touch('c1', 0, 'Pricing page')] }).due.getDate(), 24);
  assert.equal(route({ touches: [touch('c1', 2, 'Pricing page')] }).due.getDate(), 23); // Sunday moves to Monday
  assert.equal(route({}), null);
  assert.equal(route({ touches: warm, meetings: [{ start: ago(2), outcome: 'Accepted' }] }), null);
  assert.ok(route({ touches: warm, meetings: [{ start: ago(2), outcome: 'No-show' }] }));
  assert.equal(route({ touches: warm, contact: { id: 'c1', lifecycle: 'Paused' } }), null);
});
test('meeting outcome is due within 1 business day', () => {
  assert.equal(R.meetingState({ start: ago(-1) }, now), 'upcoming');
  assert.equal(R.meetingState({ start: ago(1) }, now), 'due');
  assert.equal(R.meetingState({ start: ago(4) }, now), 'overdue');
  assert.equal(R.meetingState({ start: ago(4), outcome: 'No-show' }, now), 'done');
});
test('a rejection needs a reason from the list', () => {
  assert.ok(R.checkOutcome({ outcome: '' }));
  assert.ok(R.checkOutcome({ outcome: 'Rejected', reason: '' }));
  assert.equal(R.checkOutcome({ outcome: 'Rejected', reason: 'No need' }), null);
  assert.equal(R.checkOutcome({ outcome: 'Accepted' }), null);
});
test('raise deal unlocks only after an Accepted meeting', () => {
  assert.ok(!R.canRaiseDeal(view({})));
  assert.ok(!R.canRaiseDeal(view({ meetings: [{ outcome: 'No-show' }] })));
  assert.ok(R.canRaiseDeal(view({ meetings: [{ outcome: 'Accepted' }] })));
});
test('roles', () => {
  const u = n => C.users.find(x => x.name === n);
  assert.ok(!R.can(u('Marketing'), 'raise') && !R.can(u('Marketing'), 'task') && R.can(u('Marketing'), 'optOut'));
  assert.ok(R.can(u('Tina'), 'raise') && !R.canSee(u('Tina'), 'US') && R.canSee(u('RevOps'), 'US'));
  const deals = [{ raisedBy: 'Tina' }, { raisedBy: 'Sam' }];
  assert.equal(R.visibleDeals(view({ user: u('Tina'), deals })).length, 1);
  assert.equal(R.visibleDeals(view({ user: u('Sam'), deals })).length, 2);
  assert.equal(R.can({ role: 'View only' }, 'optOut'), false);
});
test('CRM actions by role', () => {
  const has = (role, a) => R.can({ role }, a);
  for (const a of ['edit', 'note', 'newLead']) {
    assert.ok(has('Admin', a) && has('BDM', a) && has('BDE', a), a);
    assert.ok(!has('Marketing', a) && !has('View only', a), a);
  }
  assert.ok(has('Admin', 'owner') && !has('BDM', 'owner') && !has('BDE', 'owner'));
});
test('AI summary: CRM facts win over the AI answer', () => {
  const ai = (verdict, o) => R.checkSummary(view(o || {}), { verdict, evidence: 'high', summary: 'Text', for_deal: ['a', ' ', 5], concerns: null, next_step: 'Call them' });
  const note = { notes: [{ text: 'x' }] };
  assert.equal(ai('interested').verdict, 'possible'); // nothing on record confirms it
  assert.equal(ai('interested', note).verdict, 'interested');
  assert.equal(ai('interested', { described: true }).verdict, 'interested');
  assert.equal(ai('interested', { meetings: [{ start: ago(1), outcome: 'Accepted' }] }).verdict, 'interested');
  assert.equal(ai('not_interested').verdict, 'too_early'); // missing data is not a no
  assert.equal(ai('not_interested', note).verdict, 'not_interested');
  assert.equal(ai('not_interested', { contact: { id: 'c1', status: 'Lost Lead' } }).verdict, 'not_interested');
  assert.equal(ai('not_interested', { meetings: [{ start: ago(1), outcome: 'Rejected' }] }).verdict, 'not_interested');
  const out = ai('interested', { ...note, contact: { id: 'c1', optedOut: true } });
  assert.equal(out.verdict, 'not_interested');
  assert.match(out.next, /Do not contact/);
  assert.deepEqual(ai('too_early').good, ['a']);
  assert.deepEqual(ai('too_early').bad, []);
  assert.equal(ai('too_early').changed, '');
});
test('AI summary: an unusable answer is refused', () => {
  for (const bad of [null, {}, { verdict: 'maybe', summary: 'x' }, { verdict: 'possible', summary: ' ' }, { verdict: 'toString', summary: 'x' }]) assert.throws(() => R.checkSummary(view({}), bad));
});
test('AI summary by role', () => {
  for (const role of ['Admin', 'BDM', 'BDE']) assert.ok(R.can({ role }, 'ai'));
  for (const role of ['Marketing', 'View only']) assert.ok(!R.can({ role }, 'ai'));
});
test('service counts', () => {
  const r = R.countServices([{ services: ['A'] }, { services: ['A', 'B'] }, { services: [] }, { services: ['Old'] }], ['A', 'B', 'C']);
  assert.deepEqual(r.rows, [{ name: 'A', count: 2 }, { name: 'B', count: 1 }, { name: 'Old', count: 1 }, { name: 'C', count: 0 }]);
  assert.equal(r.total, 4);
  assert.equal(r.chosen, 3);
  assert.equal(R.countServices([], []).rows.length, 0);
});
test('date-only values keep their day', () => {
  assert.equal(R.toDate('2026-11-24').getDate(), 24);
});
test('company domain from a website or an email', () => {
  for (const t of ['https://www.Acme.com.au/about?x=1', 'acme.com.au', 'WWW.acme.com.au/', 'jo@acme.com.au', 'http://acme.com.au:8080']) assert.equal(R.domainOf(t), 'acme.com.au', t);
  for (const t of ['', null, undefined, 'jo@gmail.com', 'not a site', 'localhost', "x'y.com"]) assert.equal(R.domainOf(t), '', String(t));
});

test('convert to deal reuses the contact and its account first', () => {
  const c = R.convertChoices({ contacts: [{ id: 'p1', name: 'Jo', accountId: 'a1', accountName: 'Acme' }], accounts: [{ id: 'a2', name: 'Acme Ltd', by: 'same website' }], leads: [] });
  assert.equal(c.contactId, 'p1');
  assert.equal(c.accountId, 'a1');
  assert.deepEqual(c.accounts.map(a => a.id), ['a1', 'a2']);
  const none = R.convertChoices({ contacts: [], accounts: [], leads: [] });
  assert.equal(none.accountId + none.contactId, '');
});
test('convert to deal checks the form', () => {
  const choices = { contacts: [{ id: 'p1', name: 'Jo', accountId: 'a1' }] };
  const f = { createDeal: 'on', dealName: 'Acme', stage: 'Qualified', closingDate: '2026-12-24', amount: '', accountId: 'a1', contactId: 'p1' };
  assert.equal(R.checkConvert(f, choices), null);
  for (const bad of [{ dealName: ' ' }, { stage: '' }, { closingDate: '' }, { amount: '-1' }, { accountId: '' }]) assert.ok(R.checkConvert({ ...f, ...bad }, choices), JSON.stringify(bad));
  assert.equal(R.checkConvert({ accountId: 'a1', contactId: 'p1' }, choices), null); // no deal: only account and contact
  assert.ok(R.checkConvert({ accountId: '', contactId: 'p1' }, choices));
});
test('only Admin, BDM and BDE can convert', () => {
  assert.deepEqual(['Admin', 'BDM', 'BDE', 'Marketing', 'View only'].map(role => R.can({ role }, 'convert')), [true, true, true, false, false]);
});
test('a sent invitation unlocks Convert to Deal, a declined one or another outcome does not', () => {
  const ok = (m, more) => R.meetingAccepted(view({ meetings: [{ start: ago(-1), ...m }].concat(more || []) }));
  assert.ok(ok({ invited: true }) && ok({ invited: true, reply: 'accepted' }) && ok({ invited: true, reply: 'not_known' }) && ok({ outcome: 'Accepted' }));
  assert.ok(!ok({}) && !ok({ invited: true, reply: 'declined' }) && !ok({ invited: true, outcome: 'Rejected' }) && !ok({ invited: true, outcome: 'No-show' }));
  assert.ok(!R.meetingAccepted(view({})));
  assert.ok(!ok({}, [{ start: ago(5), invited: true }])); // only the latest meeting's invitation counts
  assert.ok(!R.canRaiseDeal(view({ meetings: [{ start: ago(-1), invited: true }] }))); // not proof of interest for the AI summary
  C.acceptOnInvite = false;
  assert.ok(!ok({ invited: true }) && ok({ outcome: 'Accepted' }));
  C.acceptOnInvite = true;
});
test('temperature saved by the AI summary', () => {
  const t = R.savedTemperature, d = { value: 'Hot', score: 80, judged: 60, good: ['a', 'b', 'c', 'd', 5], bad: null, sources: [{ url: 'https://a.com' }, { url: 'javascript:x' }, null] };
  const x = t('Hot', d, false, 'Contacted');
  assert.deepEqual([x.value, x.details.good, x.details.bad, x.details.sources], ['Hot', ['a', 'b', 'c'], [], [{ url: 'https://a.com' }]]);
  assert.equal(t('Cold', d, false, '').details, null); // changed in CRM: the old reasons do not belong to it
  assert.equal(t('', d, false, '').value, 'Hot');
  assert.deepEqual([t('', null, false, '').value, t('-None-', null).value, t('Boiling', { value: 'x' }).value], ['', '', '']);
  for (const [o, s] of [[true, ''], [false, 'Junk Lead'], [false, 'Lost Lead'], [false, 'Not Qualified']]) assert.equal(t('Hot', d, o, s).value, 'Cold');
  assert.equal(t('', null, true, '').value, '');
});
test('temperature counts: each open lead once, lost and junk left out, opted-out never Hot', () => {
  const l = (temperature, o) => ({ temperature, status: 'Contacted', optedOut: false, ...o });
  assert.deepEqual(R.countTemperatures([l('Hot'), l('Hot'), l('Warm'), l('Cold'), l('Not enough data'), l(''), l('Hot', { optedOut: true }), l('Hot', { status: 'Junk Lead' })]),
    { Hot: 2, Warm: 1, Cold: 2, 'Not enough data': 1, none: 1, total: 7 });
  assert.equal(R.countTemperatures([]).total, 0);
});
