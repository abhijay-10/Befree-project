// Run with: node --test test/deal-rules.test.js
const test = require('node:test');
const assert = require('node:assert');
const R = require('../app/js/rules.js');
const C = require('../app/js/config.js');

const now = new Date(2026, 10, 24, 12); // Tuesday
const ago = n => new Date(2026, 10, 24 - n, 9);
const options = C.stages.map(s => s.name);
const deal = o => ({
  stage: 'Needs confirmed', prob: 25, accountId: 'a', accountName: 'Acme', accountOwner: 'Sam', services: ['Tax Services'],
  roles: [{ name: 'Jo', role: 'Decision Maker' }], timeline: '2026-12-20', closeDate: '2026-12-20', nextStep: 'Call', created: ago(10),
  history: [], touches: null, ...o
});
const states = o => R.gate(deal(o)).map(g => g.state).join();

test('stage names match Zoho spelling and stay in order', () => {
  assert.equal(R.befreeStage('Closed Won').prob, 100);
  assert.equal(R.befreeStage('needs-confirmed').prob, 25);
  assert.equal(R.befreeStage('Negotiation/Review'), null);
  assert.ok(R.isLost('Closed Lost to Competition') && R.isLost('Closed-lost') && R.isWon('Closed Won') && !R.isClosed('Qualified'));
  assert.equal(R.nextStage('Qualified', options), 'Needs confirmed');
  assert.equal(R.nextStage('Verbal commitment', options), 'Closed-won');
  assert.equal(R.nextStage('Closed-won', options), null);
  assert.equal(R.nextStage('Unknown', options), null);
  assert.deepEqual(R.missingStages(options), []);
  assert.equal(R.missingStages(['Qualification', 'Closed Won']).length, 6);
});
test('a next step that names the next stage moves the deal', () => {
  const zoho = ['Qualification', 'Needs Analysis', 'Value Proposition', 'Id. Decision Makers', 'Proposal/Price Quote', 'Negotiation/Review', 'Closed Won', 'Closed Lost'];
  const go = (stage, text, o) => R.nextStepMove(deal({ stage, nextStep: '', ...o }), text, zoho);
  for (const t of ['need analysis', 'Needs Analysis', ' NEEDS  analysis. ']) assert.deepEqual(go('Qualification', t), { to: 'Needs Analysis' }, t);
  for (const t of ['Call Mohit', '', 'analysis', 'no need for analysis', 'Qualification']) assert.equal(go('Qualification', t), null, t);
  assert.deepEqual(go('Value Proposition', 'identify decision maker'), { to: 'Id. Decision Makers' });
  for (const t of ['proposal', 'price quote', 'proposal/price quote']) assert.deepEqual(go('Id. Decision Makers', t), { to: 'Proposal/Price Quote' }, t);
  assert.match(go('Qualification', 'Value proposition').why, /one at a time/);
  assert.match(go('Negotiation/Review', 'closed won').why, /Move button/);
  assert.equal(go('Closed Won', 'needs analysis'), null);
  assert.equal(go('Value Proposition', 'needs analysis'), null); // never backwards
  assert.match(go('Qualification', 'need analysis', { roles: [] }).why, /Decision maker/);
  assert.match(go('Qualification', 'need analysis', { approval: 'Pending' }).why, /approval/);
  C.nextStepNeedsQualification = false;
  assert.deepEqual(go('Qualification', 'need analysis', { roles: [] }), { to: 'Needs Analysis' });
  assert.match(go('Qualification', 'need analysis', { acceptance: 'Rejected' }).why, /rejected/);
  C.nextStepNeedsQualification = true;
});
test('qualification: each field done, missing or unknown', () => {
  assert.equal(states({}), 'done,done,done,done,done');
  assert.equal(states({ accountId: null }).split(',')[0], 'missing');
  assert.equal(states({ accountOwner: null }).split(',')[0], 'unknown');
  assert.equal(states({ services: [] }).split(',')[1], 'missing');
  assert.equal(states({ roles: [{ name: 'Jo', role: 'Purchasing' }] }).split(',')[2], 'missing');
  assert.equal(states({ roles: [{ name: 'Jo', role: 'Influencer' }] }).split(',')[2], 'done');
  assert.equal(states({ roles: null }).split(',')[2], 'unknown');
  assert.equal(states({ timeline: null }).split(',')[3], 'missing');
  assert.equal(states({ nextStep: '  ' }).split(',')[4], 'missing');
});
test('timeline more than 3 months after creation needs approval', () => {
  const created = new Date(2026, 10, 24);
  assert.equal(R.needsApproval(deal({ created, timeline: '2027-02-24' })), false);
  assert.equal(R.needsApproval(deal({ created, timeline: '2027-02-25' })), true);
  assert.equal(R.needsApproval(deal({ timeline: null })), false);
});
test('BDM acceptance has 1 business day', () => {
  assert.equal(R.acceptance(deal({}), now).state, 'none');
  assert.equal(R.acceptance(deal({ acceptance: 'Pending', created: ago(1) }), now).overdue, false);
  assert.equal(R.acceptance(deal({ acceptance: 'Pending', created: ago(4) }), now).overdue, true); // Friday
});
test('next step alerts at 2 and 7 business days', () => {
  const a = (n, o) => R.nextStepAlert(deal({ nextStep: '', nextStepUpdated: ago(n), ...o }), now);
  assert.equal(a(1).level, 'soon');
  assert.equal(a(4).level, 'owner');   // 2 business days
  assert.equal(a(8).level, 'owner');   // 6 business days
  assert.equal(a(11).level, 'manager'); // 7 business days
  assert.equal(a(11, { prob: 10 }), null);
  assert.equal(a(11, { stage: 'Closed-won', prob: 100 }), null);
  assert.equal(a(11, { nextStepUpdated: null }).level, 'unknown');
  assert.equal(R.nextStepAlert(deal({}), now), null);
});
test('close date pushes count only later dates', () => {
  const h = (...dates) => dates.map((closeDate, i) => ({ at: ago(20 - i), closeDate }));
  assert.equal(R.pushes(deal({ history: h('2026-12-01', '2026-12-10', '2026-12-05'), closeDate: '2026-12-20' })), 2);
  assert.equal(R.pushes(deal({ history: h('2026-12-20', '2026-12-20'), closeDate: '2026-12-20' })), 0);
  assert.equal(R.pushes(deal({ history: h('2026-12-01', '2026-12-10').reverse(), closeDate: '2026-12-10' })), 1);
  assert.equal(R.pushes(deal({ history: null })), null);
  assert.equal(R.needsReview(deal({ history: h('2026-12-01', '2026-12-10'), closeDate: '2026-12-20' })), true);
  assert.equal(R.needsReview(deal({ history: null })), false);
});
test('stage moves', () => {
  const m = (o, to, ev) => R.checkMove(deal(o), to || 'Proposal presented', ev === undefined ? 'notes' : ev, options);
  assert.equal(m({}), null);
  assert.match(m({}, 'Agreement sent'), /one at a time/);
  assert.equal(m({}, null, ' '), null); // no evidence is asked for
  assert.match(m({ services: [] }), /service line/);
  assert.match(m({ roles: null }), /Decision maker/); // an item that cannot be read blocks too
  assert.match(m({ accountOwner: null }), /assigned book/);
  assert.match(R.nextStepMove(deal({ stage: 'Qualified', roles: null }), 'Needs confirmed', options).why, /Decision maker/);
  assert.match(m({ acceptance: 'Pending' }), /not accepted/);
  assert.match(m({ acceptance: 'Rejected' }), /rejected/);
  assert.match(m({ approval: 'Pending' }), /approval/);
  assert.match(m({ stage: 'Closed-lost' }), /closed/);
});
test('closed-lost needs a stage and a reason', () => {
  const l = (s, r) => R.checkLost(deal({}), s, r, options, ['Price']);
  assert.equal(l('Closed-lost', 'Price'), null);
  assert.ok(l('Closed-lost', '') && l('Closed-won', 'Price'));
});
test('influence is the 180 days before creation, separate from sourced', () => {
  const t = n => [{ date: ago(n), channel: 'Email' }];
  assert.equal(R.influence(deal({ touches: t(190) })).influenced, true);
  assert.equal(R.influence(deal({ touches: t(191) })).influenced, false);
  assert.equal(R.influence(deal({ touches: t(5) })).influenced, false);
  assert.equal(R.influence(deal({ touches: [], sourcedBy: 'Marketing' })).sourced, true);
  assert.equal(R.influence(deal({})), null);
});
test('a contact role that CRM gives only as an ID is not guessed', () => {
  const g = roles => R.gate(deal({ roles }))[2];
  assert.equal(g([{ name: 'Jo', role: '', unread: '1485773000000020542' }]).state, 'unknown');
  assert.match(g([{ name: 'Jo', role: '', unread: '1485773000000020542' }]).note, /1485773000000020542/);
  assert.equal(g([{ name: 'Jo', role: '', unread: '1' }, { name: 'Al', role: 'Economic Decision Maker', unread: '' }]).state, 'done');
  assert.equal(g([{ name: 'Jo', role: 'Purchasing', unread: '' }]).state, 'missing');
});
test('services are locked from 90 percent', () => {
  const l = (prob, stage) => R.servicesLocked(deal({ prob, stage: stage || 'Negotiation/Review' }));
  assert.ok(l(90) && l(100, 'Closed Won') && l(null, 'Closed Won'));
  assert.ok(!l(75, 'Proposal/Price Quote') && !l(10, 'Qualification') && !l(0, 'Closed Lost') && !l(null, 'Qualification'));
});
test('services asked for in the website enquiry', () => {
  const o = ['Accounting Services', 'Payroll Services', 'Tax Services', 'Tax Services Plus'];
  const q = t => R.requestedServices(t, o);
  assert.deepEqual(q('Website enquiry\nFull name: james carter\nServices requested (2): Accounting Services, payroll services\nMessage: Tax Services too'), ['Accounting Services', 'Payroll Services']);
  assert.deepEqual(q('Website enquiry Services requested (2): Accounting Services, Payroll Services Message: hi, Tax Services'), ['Accounting Services', 'Payroll Services']);
  assert.deepEqual(q('Service requested: Tax Services Plus'), ['Tax Services Plus']);
  assert.deepEqual(q('Services requested (2): Accounting Services, Something else'), ['Accounting Services']);
  for (const t of ['', null, undefined, 'Wants Accounting Services', 'Services requested (0): ']) assert.deepEqual(q(t), []);
});
test('roles', () => {
  const u = role => ({ id: 'me', role });
  assert.ok(R.can(u('BDM'), 'edit') && !R.can(u('BDE'), 'edit') && !R.can(u('Marketing'), 'edit') && !R.can(u('View only'), 'edit'));
  assert.equal(R.canSee(u('BDE'), { createdById: 'x', ownerId: 'y' }), false);
  assert.ok(R.canSee(u('BDE'), { createdById: 'me' }) && R.canSee(u('BDE'), { ownerId: 'me' }) && R.canSee(u('Marketing'), {}));
});
test('service amounts add up to the deal amount', () => {
  const d = o => ({ services: ['Accounting Services', 'Payroll Services', 'Bookkeeping Services'], amount: 10000000, expected: 2000000, prob: 20, serviceAmounts: {}, ...o });
  const a = o => R.amounts(d(o));
  const all = a({ serviceAmounts: { 'Accounting Services': 100, 'Payroll Services': '200', 'Bookkeeping Services': 50.5, 'Tax Services': 999 } });
  assert.deepEqual(all.list.map(x => x.amount), [100, 200, 50.5]);
  assert.deepEqual([all.total, all.expected, all.set], [350.5, 70.1, 3]); // a service that is not chosen does not count
  const some = a({ serviceAmounts: { 'Accounting Services': 100, 'Payroll Services': null, 'Bookkeeping Services': '' } });
  assert.deepEqual([some.total, some.set, some.list[1].amount], [100, 1, null]);
  for (const o of [{}, { serviceAmounts: undefined }, { services: [] }, { serviceAmounts: { 'Payroll Services': 0 } }]) assert.deepEqual([a(o).total, a(o).expected, a(o).used], [10000000, 2000000, false]);
  assert.equal(a({ prob: null, serviceAmounts: { 'Payroll Services': 5 } }).expected, null);
});
test('every service amount API name is one the user gave', () => {
  const services = ['Accounting', 'Audit Support', 'Bookkeeping', 'Mortgage', 'Paraplanning', 'Payroll', 'Tax', 'Virtual Admin'].map(x => x + ' Services');
  assert.deepEqual(C.serviceAmounts, Object.fromEntries(services.map(x => [x, x.replace(/ /g, '_') + '_Amount'])));
});
test('every Deals API name is one the user gave', () => {
  const given = ['Account_Name', 'Amount', 'Campaign_Source', 'Closing_Date', 'Connected_To__s', 'Contact_Name', 'Created_By', 'Record_Image', 'Deal_Name', 'Owner', 'Description', 'Expected_Revenue', 'Lead_Source', 'Modified_By', 'Next_Step', 'Probability', 'Reason_For_Loss__s', 'Stage', 'Tag', 'Type', 'Services_List'];
  for (const n of Object.values(C.deal).concat(C.timeline)) assert.ok(given.includes(n), n);
});
