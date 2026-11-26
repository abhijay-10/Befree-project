// Sample data, kept in memory. Reloading the page resets it.
(function (root) {
  const C = root.BefreeConfig;
  const now = new Date();
  const ago = (n, hour) => { const d = new Date(now); d.setDate(d.getDate() - n); if (hour != null) d.setHours(hour, 0, 0, 0); return d; };
  const bizAgo = n => { const d = new Date(now); while (n > 0) { d.setDate(d.getDate() - 1); if (d.getDay() % 6) n--; } d.setHours(10, 0, 0, 0); return d; };
  let next = 1;

  const accounts = [
    { id: 'a1', name: 'Northgate Accounting', country: 'UK', staff: 1200, owner: 'Sam' },
    { id: 'a2', name: 'Harbour Advisory', country: 'UK', staff: 640, owner: 'Sam' },
    { id: 'a3', name: 'Lakeside Tax', country: 'US', staff: 320, owner: 'Brad' },
    { id: 'a4', name: 'Wattle Advisory', country: 'AU', staff: 30, owner: 'Ross' }
  ];
  const person = (id, accountId, name, title, lifecycle, extra) => ({ id, accountId, name, title, lifecycle, optedOut: false, backToColdOn: null, email: name.split(' ')[0].toLowerCase() + '@' + accounts.find(a => a.id === accountId).name.split(' ')[0].toLowerCase() + '.example', ...extra });
  const contacts = [
    person('c1', 'a2', 'Megan Price', 'Partner', 'Meeting booked'),
    person('c2', 'a2', 'Liam Ford', 'Head of Accounts', 'Working'),
    person('c3', 'a2', 'Zoe Hart', 'Office Manager', 'Target'),
    person('c4', 'a1', 'Priya Shah', 'Finance Director', 'Working'),
    person('c5', 'a1', 'Owen Clarke', 'Operations Manager', 'Target'),
    person('c6', 'a3', 'Dana Reyes', 'Managing Partner', 'Meeting booked'),
    person('c7', 'a3', 'Chris Nolan', 'Controller', 'Opted out', { optedOut: true }),
    person('c8', 'a4', 'Grace Lee', 'Practice Manager', 'Target')
  ];
  const picked = { c1: 0, c2: 0, c3: 1, c4: 1, c6: 0, c8: 2 };
  contacts.forEach(c => { c.services = c.id in picked ? [C.serviceLines[picked[c.id]]] : []; });
  const t = (contactId, n, type, channel) => ({ id: 't' + next++, contactId, type, channel, date: ago(n, 9) });
  const touches = [
    t('c1', 9, 'Event', 'Events'), t('c1', 4, 'Email click', 'Email'), t('c2', 15, 'Webinar', 'Webinars'), t('c2', 48, 'Email click', 'Email'),
    t('c4', 6, 'Webinar', 'Webinars'), t('c4', 3, 'Email click', 'Email'), t('c5', 12, 'Event', 'Events'),
    t('c6', 0, 'Pricing page', 'Website'), t('c6', 2, 'Email click', 'Email'), t('c8', 44, 'Email click', 'Email')
  ];
  const tasks = [{ id: 'k1', contactId: 'c6', type: 'Hot follow-up', owner: 'Brad', due: ago(0), open: true }];
  const meetings = [
    { id: 'm1', contactId: 'c1', start: bizAgo(3), bookedOn: bizAgo(6), selfBooked: false, outcome: '', reason: '', reschedules: 1 },
    { id: 'm2', contactId: 'c6', start: ago(-2, 15), bookedOn: ago(1), selfBooked: true, outcome: '', reason: '', reschedules: 0 },
    { id: 'm3', contactId: 'c4', start: bizAgo(4), bookedOn: bizAgo(8), selfBooked: false, outcome: 'Accepted', reason: '', reschedules: 0 }
  ];
  const deals = [
    { id: 'd1', accountId: 'a1', name: 'Northgate: Service line A', stage: 'Proposal presented', raisedBy: 'Tina' },
    { id: 'd2', accountId: 'a1', name: 'Northgate: Service line B', stage: 'Qualified', raisedBy: 'Sam' }
  ];
  const notes = [{ id: 'n1', contactId: 'c6', title: 'First call', text: 'Interested in bookkeeping support before year end.', at: ago(1, 11), by: 'Brad' }];
  const statuses = ['Not Contacted', 'Contacted', 'Pre-Qualified', 'Qualified', 'Junk Lead'];
  const sources = ['Web form', 'Target account', 'Event', 'Referral'];
  const find = id => contacts.find(c => c.id === id);

  root.BefreeSample = {
    live: false,
    list: user => contacts.filter(c => !c.converted && root.BefreeRules.canSee(user, accounts.find(a => a.id === c.accountId).country)).map(c => ({ id: c.id, name: c.name, sub: accounts.find(a => a.id === c.accountId).name, services: c.services, status: c.lifecycle })),
    async load(id, user) {
      const contact = find(id), account = accounts.find(a => a.id === contact.accountId);
      const team = contacts.filter(c => c.accountId === account.id);
      const ids = team.map(c => c.id);
      return {
        live: false, notes: notes.filter(n => n.contactId === id).slice().reverse(),
        editable: [
          { key: 'status', label: 'Lead Status', type: 'select', options: statuses, value: contact.status },
          { key: 'title', label: 'Title', type: 'text', value: contact.title },
          { key: 'email', label: 'Email', type: 'email', value: contact.email },
          { key: 'phone', label: 'Phone', type: 'text', value: contact.phone },
          { key: 'source', label: 'Lead Source', type: 'select', options: sources, value: contact.source }
        ],
        details: [['Email', contact.email], ['Phone', contact.phone], ['Lead source', contact.source], ['Account', account.name], ['Employees', account.staff]],
        now: new Date(), service: { field: 'sample', label: 'Service', multi: false, editable: true, options: C.serviceLines }, created: ago(60, 9), user, contact, account, contacts: team, problems: {},
        touches: touches.filter(x => ids.includes(x.contactId)).map(x => ({ ...x, contactName: find(x.contactId).name })),
        tasks: tasks.filter(x => x.contactId === id), meetings: meetings.filter(m => m.contactId === id), deals: deals.filter(d => d.accountId === account.id)
      };
    },
    async duplicates(v) { return { email: v.contact.email, failed: [], contacts: [], leads: [], accounts: v.deals.length ? [{ id: v.account.id, name: v.account.name, by: 'same name' }] : [] }; },
    async dealStages() { return Object.keys(C.stages); },
    async contactRoles() { return [{ id: 'r1', name: 'Developer/Evaluator' }, { id: 'r2', name: 'Decision Maker' }, { id: 'r3', name: 'Purchasing' }, { id: 'r4', name: 'Executive Sponsor' }]; },
    async campaigns() { return []; },
    async convert(v, f) {
      const deal = f.createDeal ? { id: 'd' + next++, accountId: v.account.id, name: f.dealName.trim(), stage: f.stage, raisedBy: v.user.name } : null;
      if (deal) deals.push(deal);
      Object.assign(find(v.contact.id), { converted: true, lifecycle: 'Opportunity' });
      return { dealId: deal ? deal.id : '', accountId: v.account.id, contactId: v.contact.id, roleSet: true };
    },
    async users() { return C.users.filter(u => u.role === 'BDM').map(u => ({ id: u.name, name: u.name })); },
    async setOwner(v, id) { accounts.find(a => a.id === v.account.id).owner = id; },
    async saveFields(v, changes) { Object.assign(find(v.contact.id), changes); },
    async addNote(v, title, text) { notes.push({ id: 'n' + next++, contactId: v.contact.id, title, text, at: new Date(), by: v.user.name }); },
    async addTask(v, subject, due) { tasks.push({ id: 'k' + next++, contactId: v.contact.id, type: subject, owner: v.user.name, due, open: true }); },
    async closeTask(v, id) { tasks.find(t => t.id === id).open = false; },
    async setService(v, list) { find(v.contact.id).services = list; },
    // Sample answer only. Nothing is sent to OpenAI from sample data.
    async summarize(v) {
      await new Promise(done => setTimeout(done, 900));
      const R = root.BefreeRules, c = v.contact, hot = R.temperature(v).value, good = [], bad = [];
      if (R.canRaiseDeal(v)) good.push('A meeting was accepted');
      if (hot !== 'Cold') good.push(`Temperature is ${hot}: ${R.temperature(v).reason}`);
      if (c.services.length) good.push('Service chosen: ' + c.services.join(', '));
      v.notes.slice(0, 1).forEach(n => good.push('Note: ' + n.text));
      if (!v.notes.length) bad.push('No notes have been recorded');
      if (!v.meetings.length) bad.push('No meeting has been booked');
      if (v.meetings.some(m => !m.outcome && R.toDate(m.start) < v.now)) bad.push('A past meeting has no outcome recorded');
      if (c.optedOut) bad.unshift('The contact has opted out');
      const verdict = c.optedOut ? 'not_interested' : R.canRaiseDeal(v) || (hot === 'Hot' && v.notes.length) ? 'interested' : hot !== 'Cold' ? 'possible' : 'too_early';
      return {
        verdict, evidence: good.length > 2 ? 'high' : good.length ? 'medium' : 'low', for_deal: good, concerns: bad,
        summary: `${c.name} is ${c.title} at ${v.account.name}. ` + (verdict === 'interested' ? 'Their recent actions show clear interest in working with us.' : verdict === 'possible' ? 'There are some positive signs, but nothing confirms interest yet.' : verdict === 'not_interested' ? 'They have asked not to be contacted.' : 'There is not enough activity to judge their interest yet.'),
        next_step: verdict === 'interested' ? 'Agree the scope and decision maker in the next meeting.' : 'Record what the lead needs, then agree a next step with them.'
      };
    },
    async optOut(v) { find(v.contact.id).optedOut = true; find(v.contact.id).lifecycle = 'Opted out'; },
    async addCall(v) { tasks.push({ id: 'k' + next++, contactId: v.contact.id, type: 'Call', owner: v.user.name, due: root.BefreeRules.addBusinessDays(new Date(), 0), open: true }); },
    async book(v, start, reschedules) {
      meetings.push({ id: 'm' + next++, contactId: v.contact.id, start, bookedOn: new Date(), selfBooked: false, outcome: '', reason: '', reschedules });
      find(v.contact.id).lifecycle = 'Meeting booked';
    },
    async invite(v, m) { Object.assign(meetings.find(x => x.id === m.id), { invited: true, invitedOn: new Date(), reply: 'not_known' }); },
    async move(v, m, start) { const x = meetings.find(y => y.id === m.id); x.start = start; x.reschedules++; },
    async outcome(v, m, f) { Object.assign(meetings.find(y => y.id === m.id), { outcome: f.outcome, reason: f.outcome === 'Rejected' ? f.reason : '' }); },
    async toCold(v, m) {
      const x = meetings.find(y => y.id === m.id);
      if (!x.outcome) x.outcome = 'No-show';
      Object.assign(find(v.contact.id), { backToColdOn: new Date(), lifecycle: 'Working' });
    }
  };
})(this);
