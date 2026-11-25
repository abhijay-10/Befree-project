// Sample data, kept in memory. Reloading the page resets it.
(function (root) {
  const C = root.BefreeConfig, R = root.BefreeRules;
  const now = new Date();
  const ago = n => { const d = new Date(now); d.setDate(d.getDate() - n); d.setHours(9, 0, 0, 0); return d; };
  const bizAgo = n => { const d = new Date(now); while (n > 0) { d.setDate(d.getDate() - 1); if (d.getDay() % 6) n--; } d.setHours(9, 0, 0, 0); return d; };
  const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const ahead = n => ymd(ago(-n));
  const user = id => C.users.find(u => u.id === id);
  const [ACC, PAY, VA, BOOK, TAX] = C.sampleServices;
  const order = C.stages.map(s => s.name);

  function make(id, name, country, account, contact, owner, raisedBy, stage, amount, created, close, o) {
    const i = order.indexOf(stage), prob = C.stages[i].prob;
    const closes = o.closes || [close];
    const steps = stage === 'Closed-lost' ? ['Qualified', 'Needs confirmed', stage] : order.slice(0, i + 1);
    const history = steps.map((s, k) => ({ stage: s, prob: R.befreeStage(s).prob, at: ago(Math.max(0, Math.round(created - (created - 2) * k / Math.max(1, steps.length - 1)))), closeDate: ahead(closes[Math.min(k, closes.length - 1)]), by: user(owner).name }));
    if (closes.length > steps.length) closes.slice(steps.length).forEach(c => history.push({ stage, prob, at: ago(1), closeDate: ahead(c), by: user(owner).name }));
    return {
      id, name, country, accountId: 'acc-' + id, accountName: account, accountOwner: user(owner).name, contactId: 'con-' + id, contactName: contact,
      owner: user(owner).name, ownerId: owner, createdById: raisedBy, createdBy: user(raisedBy).name, stage, prob, amount, symbol: '',
      created: ago(created), modified: ago(Math.min(1, created)), closeDate: ahead(close), services: [], roles: [], nextStep: '', nextStepUpdated: null,
      type: 'New Business', leadSource: 'Web Download', campaign: '', description: '', sourcedBy: 'BDE', acceptance: 'Not needed', approval: 'Not needed', rejectReason: '', lostReason: '',
      history, touches: [], ...o
    };
  }
  const touch = (days, type, channel, who) => ({ date: ago(days), type, channel, who });
  const dm = (name, role) => [{ name, role: role || 'Decision Maker' }];

  const deals = [
    make('d1', 'Northgate tax outsourcing', 'UK', 'Northgate Accounting', 'Hugo Lane', 'sam', 'tina', 'Proposal presented', 84000, 40, 35, { services: [TAX], roles: dm('Hugo Lane'), nextStep: '', nextStepUpdated: bizAgo(8), sourcedBy: 'BDE', touches: [touch(64, 'Email click', 'Email', 'Hugo Lane'), touch(70, 'Event', 'Events', 'Hugo Lane'), touch(260, 'Webinar', 'Webinars', 'Priya Shah')] }),
    make('d2', 'Harbour payroll support', 'UK', 'Harbour Advisory', 'Megan Price', 'sam', 'tina', 'Qualified', 32000, 0, 45, { services: [PAY], roles: dm('Megan Price', 'Influencer'), nextStep: 'Scoping call', acceptance: 'Pending', sourcedBy: 'BDE', touches: [touch(4, 'Email click', 'Email', 'Megan Price')] }),
    make('d3', 'Lakeside bookkeeping', 'US', 'Lakeside Tax', 'Faye Morris', 'brad', 'brad', 'Agreement sent', 52000, 60, 20, { services: [BOOK], roles: dm('Faye Morris'), nextStep: 'Legal review call', closes: [5, 12, 20], sourcedBy: 'Marketing', campaign: 'Capacity webinar', touches: [touch(95, 'Webinar', 'Webinars', 'Faye Morris')] }),
    make('d4', 'Summit virtual admin', 'US', 'Summit Books', 'Ben Ortiz', 'brad', 'cooper', 'Needs confirmed', 18000, 20, 30, { services: [], roles: [], nextStep: 'Send case study', sourcedBy: 'Referral' }),
    make('d5', 'Wattle accounting team', 'AU', 'Wattle Advisory', 'Ava Scott', 'ross', 'ross', 'Closed-won', 36000, 90, 5, { services: [ACC, TAX], roles: dm('Ava Scott'), nextStep: 'Handover', sourcedBy: 'BDM', touches: [touch(130, 'Webinar', 'Webinars', 'Ava Scott')] }),
    make('d6', 'Coral payroll pilot', 'AU', 'Coral Partners', 'Tom Nguyen', 'ross', 'rick', 'Closed-lost', 12000, 70, 3, { services: [PAY], roles: dm('Tom Nguyen'), nextStep: '', lostReason: 'Timing', sourcedBy: 'BDE' }),
    make('d7', 'Banksia tax season', 'AU', 'Banksia Group', 'Isla Grant', 'ross', 'ross', 'Qualified', 61000, 3, 150, { services: [TAX], roles: dm('Isla Grant'), nextStep: 'Manager approval', approval: 'Pending', sourcedBy: 'AI SDR' })
  ];
  const find = id => deals.find(d => d.id === id);
  const visible = u => deals.filter(d => (!u.country || u.country === d.country) && R.canSee(u, d));
  const addHistory = (d, v) => d.history.push({ stage: d.stage, prob: d.prob, at: new Date(), closeDate: d.closeDate, by: v.user.name });

  root.BefreeSample = {
    live: false,
    list: u => visible(u).map(d => ({ id: d.id, name: d.name, sub: d.accountName + ', ' + d.stage, services: d.services, amount: d.amount })),
    async load(id, u) {
      const d = find(id);
      return {
        live: false, now: new Date(), user: u, problems: {}, missing: {}, notFound: [],
        service: { field: 'Services_List', label: 'Services List', multi: true, editable: true, options: C.sampleServices },
        stages: order, reasons: C.sampleLostReasons, stagesKnown: true,
        deal: { ...d, timeline: d.closeDate, expected: Math.round(d.amount * d.prob / 100), history: d.history.slice() }
      };
    },
    async move(v, to) { const d = find(v.deal.id); d.stage = to; d.prob = R.befreeStage(to).prob; addHistory(d, v); },
    async lose(v, stage, reason) { const d = find(v.deal.id); d.stage = stage; d.prob = 0; d.lostReason = reason; addHistory(d, v); },
    async nextStep(v, text, to) { const d = find(v.deal.id); d.nextStep = text; d.nextStepUpdated = new Date(); if (to) await this.move(v, to); },
    async closeDate(v, date) { const d = find(v.deal.id); d.closeDate = date; addHistory(d, v); },
    async setService(v, list) { find(v.deal.id).services = list; },
    async decide(v, accepted, reason) { Object.assign(find(v.deal.id), { acceptance: accepted ? 'Accepted' : 'Rejected', rejectReason: reason || '' }); }
  };
})(this);
