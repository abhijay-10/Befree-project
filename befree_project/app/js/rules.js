// Befree rules used by the lead widget (R3 to R8). No screen code in here.
(function (root) {
  const C = typeof module !== 'undefined' ? require('./config.js') : root.BefreeConfig;
  const DAY = 86400000;

  // A date-only value such as "2026-11-24" must stay on that day in every time zone
  function toDate(v) {
    if (v instanceof Date) return new Date(v);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || '');
    return m ? new Date(+m[1], m[2] - 1, +m[3]) : new Date(v);
  }
  const day = v => { const d = toDate(v); d.setHours(0, 0, 0, 0); return d; };
  const daysBetween = (a, b) => Math.round((day(b) - day(a)) / DAY);
  const isWeekday = d => d.getDay() !== 0 && d.getDay() !== 6;

  function addBusinessDays(from, n) {
    const d = day(from);
    while (!isWeekday(d)) d.setDate(d.getDate() + 1);
    while (n > 0) { d.setDate(d.getDate() + 1); if (isWeekday(d)) n--; }
    return d;
  }
  function businessDaysSince(from, now) {
    const d = day(from), end = day(now);
    let n = 0;
    while (d < end) { d.setDate(d.getDate() + 1); if (isWeekday(d)) n++; }
    return n;
  }

  // R8
  function segment(staff) {
    const n = Number(staff) || 0;
    if (n >= 1000) return { code: 'T1', label: 'T1 Enterprise', tier: 1 };
    if (n >= 500) return { code: 'T2', label: 'T2 Large', tier: 2 };
    if (n >= 100) return { code: 'T3-A', label: 'T3-A', tier: 3 };
    if (n >= 50) return { code: 'T3-B', label: 'T3-B', tier: 3 };
    if (n >= 1) return { code: 'T4', label: 'T4 Small', tier: 4 };
    return { code: '', label: 'No segment', tier: null };
  }
  const userFor = (country, role) => C.users.find(u => u.country === country && u.role === role) || null;

  const isHighIntent = touch => C.highIntentTypes.includes(touch.type);
  const within = (date, days, now) => { const d = daysBetween(date, now); return d >= 0 && d <= days; };

  // How many different contacts at the account engaged in the last 30 days
  function engagement(v) {
    const recent = v.touches.filter(t => within(t.date, C.warmDays, v.now));
    return { engaged: new Set(recent.map(t => t.contactId)).size, total: v.contacts.length };
  }

  // R5, with R4 "back to Cold": activity up to that day no longer counts
  function temperature(v) {
    const reset = v.contact.backToColdOn;
    const counts = date => !reset || daysBetween(reset, date) > 0;
    const touches = v.touches.filter(t => counts(t.date));

    const signals = touches.filter(t => t.contactId === v.contact.id && isHighIntent(t) && within(t.date, C.hotDays, v.now))
      .map(t => ({ date: t.date, text: t.type }));
    v.meetings.filter(m => m.selfBooked && counts(m.bookedOn) && within(m.bookedOn, C.hotDays, v.now))
      .forEach(m => signals.push({ date: m.bookedOn, text: 'Self-booked meeting' }));
    if (signals.length) {
      const s = signals.sort((a, b) => toDate(b.date) - toDate(a.date))[0];
      return { value: 'Hot', reason: s.text, since: s.date };
    }

    const first = {}; // each contact's first touch inside the window
    touches.filter(t => within(t.date, C.warmDays, v.now)).forEach(t => {
      if (!first[t.contactId] || toDate(t.date) < toDate(first[t.contactId])) first[t.contactId] = t.date;
    });
    const dates = Object.values(first).sort((a, b) => toDate(a) - toDate(b));
    if (dates.length >= 2) {
      return { value: 'Warm', reason: dates.length + ' of ' + v.contacts.length + ' contacts engaged in ' + C.warmDays + ' days', since: dates[1] };
    }
    if (reset) return { value: 'Cold', reason: 'Returned to Cold after ' + C.maxReschedules + ' reschedules', since: null };
    return { value: 'Cold', reason: dates.length ? 'Only 1 contact engaged in ' + C.warmDays + ' days' : 'No engagement in ' + C.warmDays + ' days', since: null };
  }

  // Step 5. The due date counts from the day the lead became Hot or Warm.
  function routing(v, temp) {
    if (['Opportunity', 'Customer', 'Paused', 'Cool-off', 'Opted out'].includes(v.contact.lifecycle)) return null;
    const last = latestMeeting(v);
    if (last && ['Accepted', 'Rejected'].includes(last.outcome)) return null; // already worked
    const tier = segment(v.account.staff).tier;
    if (temp.value === 'Hot') return { type: 'Hot follow-up', user: userFor(v.account.country, 'BDM'), due: addBusinessDays(temp.since, 0) };
    if (temp.value === 'Warm' && tier) {
      return { type: 'Warm sequence', user: userFor(v.account.country, tier === 1 ? 'BDM' : 'BDE'), due: addBusinessDays(temp.since, 2) };
    }
    return null; // the brief does not route Cold
  }

  // How many leads chose each service. A lead that chose two services counts once in each.
  function countServices(leads, options) {
    const names = [...new Set(options.concat(leads.flatMap(l => l.services)))];
    return {
      total: leads.length,
      chosen: leads.filter(l => l.services.length).length,
      rows: names.map(n => ({ name: n, count: leads.filter(l => l.services.includes(n)).length })).sort((a, b) => b.count - a.count)
    };
  }

  // "https://www.acme.com.au/about" and "jo@acme.com.au" both give "acme.com.au"
  function domainOf(text) {
    const t = String(text || '').trim().toLowerCase().replace(/^.*@/, '').replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').split(/[/?#:]/)[0];
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(t) && !C.freeMail.includes(t) ? t : '';
  }

  const isOptedOut = c => !!c.optedOut || c.lifecycle === 'Opted out';

  // R4
  const latestMeeting = v => v.meetings.slice().sort((a, b) => toDate(b.start) - toDate(a.start))[0] || null;
  function meetingState(m, now) {
    if (!m) return 'none';
    if (m.outcome) return 'done';
    if (toDate(m.start) > now) return 'upcoming';
    return businessDaysSince(m.start, now) > 1 ? 'overdue' : 'due';
  }
  const canRaiseDeal = v => v.meetings.some(m => m.outcome === 'Accepted');
  function checkOutcome(f) {
    if (!C.outcomes.includes(f.outcome)) return 'Choose an outcome.';
    if (f.outcome === 'Rejected' && !C.rejectReasons.includes(f.reason)) return 'A rejection needs a reason.';
    return null;
  }

  // Convert to deal: the existing records that can be reused, and which are picked at first
  function convertChoices(dup) {
    const contacts = dup.contacts.map(c => ({ id: c.id, name: c.name, accountId: c.accountId || '', accountName: c.accountName || '' }));
    const accounts = [];
    const add = (id, name, by) => { if (id && !accounts.some(a => a.id === id)) accounts.push({ id, name, by }); };
    contacts.forEach(c => add(c.accountId, c.accountName || 'Account of ' + c.name, 'account of ' + c.name));
    dup.accounts.forEach(a => add(a.id, a.name, a.by));
    const first = contacts[0];
    return { accounts, contacts, contactId: first ? first.id : '', accountId: (first && first.accountId) || (accounts[0] ? accounts[0].id : '') };
  }
  function checkConvert(f, choices) {
    if (!String(f.dealName || '').trim()) return 'Enter the deal name.';
    if (!f.stage) return 'Choose a stage.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.closingDate || '')) return 'Choose a closing date.';
    if (f.amount && !(Number(f.amount) >= 0)) return 'The amount must be a number, 0 or more.';
    const c = choices.contacts.find(x => x.id === f.contactId);
    if (c && c.accountId && c.accountId !== f.accountId) return c.name + ' belongs to another account. Choose that account, or create a new contact.';
    return null;
  }

  // Checks the AI answer before it is shown. CRM facts win over the AI result.
  const verdicts = { interested: 'Interested', possible: 'Possibly interested', too_early: 'Too early to tell', not_interested: 'Not interested' };
  function checkSummary(v, raw) {
    const text = x => typeof x === 'string' ? x.trim() : '';
    const list = x => (Array.isArray(x) ? x : []).map(text).filter(Boolean).slice(0, 4);
    const s = {
      verdict: raw && raw.verdict, evidence: raw && ['low', 'medium', 'high'].includes(raw.evidence) ? raw.evidence : 'low',
      summary: text(raw && raw.summary), good: list(raw && raw.for_deal), bad: list(raw && raw.concerns), next: text(raw && raw.next_step), changed: ''
    };
    if (!Object.keys(verdicts).includes(s.verdict) || !s.summary) throw new Error('The AI answer was incomplete. Please try again.');
    const set = (verdict, why) => { if (s.verdict !== verdict) { s.verdict = verdict; s.changed = why; } };
    const written = !!(v.notes && v.notes.length) || !!v.described;
    if (isOptedOut(v.contact)) {
      set('not_interested', 'Result set from CRM: this lead has opted out.');
      s.next = 'Do not contact this lead. They have opted out.';
    } else if (s.verdict === 'not_interested' && !written && !/lost|junk|not qualified/i.test(v.contact.status || '') && !v.meetings.some(m => m.outcome === 'Rejected')) {
      set('too_early', 'Result set from CRM: nothing on record shows a clear no.');
    } else if (s.verdict === 'interested' && !written && !canRaiseDeal(v) && !v.deals.length && temperature(v).value !== 'Hot') {
      set('possible', 'Result set from CRM: there is no accepted meeting or note that confirms interest.');
    }
    s.label = verdicts[s.verdict];
    return s;
  }

  // Step 10: our proposal, to be confirmed with Befree. CRM profiles must enforce the same.
  const access = {
    Admin: ['ai', 'edit', 'note', 'newLead', 'owner', 'service', 'task', 'email', 'call', 'book', 'outcome', 'optOut', 'raise', 'convert', 'allDeals'],
    BDM: ['ai', 'edit', 'note', 'newLead', 'service', 'task', 'email', 'call', 'book', 'outcome', 'optOut', 'raise', 'convert', 'allDeals'],
    BDE: ['ai', 'edit', 'note', 'newLead', 'service', 'task', 'email', 'call', 'book', 'outcome', 'optOut', 'raise', 'convert'],
    Marketing: ['optOut', 'allDeals']
  };
  const can = (user, action) => (access[user.role] || []).includes(action);
  const canSee = (user, country) => !user.country || user.country === country;
  const visibleDeals = v => v.deals.filter(d => can(v.user, 'allDeals') || d.raisedBy === v.user.name);

  const R = {
    toDate, day, daysBetween, addBusinessDays, businessDaysSince, segment, userFor, countServices, isHighIntent, engagement, temperature,
    routing, isOptedOut, latestMeeting, meetingState, canRaiseDeal, checkOutcome, convertChoices, checkConvert, checkSummary, domainOf, can, canSee, visibleDeals
  };
  if (typeof module !== 'undefined') module.exports = R; else root.BefreeRules = R;
})(this);
