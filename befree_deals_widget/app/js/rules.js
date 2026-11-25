// Befree rules used by the deal widget (R2, R3, R6, steps 7 and 8). No screen code in here.
(function (root) {
  const C = typeof module !== 'undefined' ? require('./config.js') : root.BefreeConfig;
  const filled = v => !!String(v == null ? '' : v).trim();

  /* ---------- dates ---------- */
  // A date-only value such as "2026-11-24" must stay on that day in every time zone
  function toDate(v) {
    if (v instanceof Date) return new Date(v);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || '');
    return m ? new Date(+m[1], m[2] - 1, +m[3]) : new Date(v);
  }
  const day = v => { const d = toDate(v); d.setHours(0, 0, 0, 0); return d; };
  const daysBetween = (a, b) => Math.round((day(b) - day(a)) / 86400000);
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
  function addMonths(from, n) {
    const d = day(from), dom = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + n);
    d.setDate(Math.min(dom, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
    return d;
  }

  /* ---------- stages (R2) ---------- */
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const befreeStage = name => C.stages.find(s => norm(s.name) === norm(name)) || null;
  const isLost = name => /lost/.test(norm(name));
  const isWon = name => /^closedwon/.test(norm(name));
  const isClosed = name => isLost(name) || isWon(name);
  // Open stages in order, then Closed-won. Lost stages are kept apart.
  const path = options => options.filter(s => !isLost(s));
  const lostStages = options => options.filter(isLost);
  const missingStages = options => C.stages.filter(s => !options.some(o => norm(o) === norm(s.name))).map(s => s.name);
  function nextStage(stage, options) {
    const p = path(options), i = p.indexOf(stage);
    return i < 0 || isClosed(stage) ? null : p[i + 1] || null;
  }

  /* ---------- qualification gate (step 7) ---------- */
  function gate(d) {
    const account = !d.accountId ? 'missing' : d.accountOwner === null ? 'unknown' : d.accountOwner ? 'done' : 'missing';
    const dm = d.roles && d.roles.find(r => /decision|influenc/i.test(r.role)), unread = d.roles && d.roles.find(r => r.unread);
    return [
      { label: 'Account in an assigned book', state: account, note: account === 'done' ? d.accountName + ', owner ' + d.accountOwner : account === 'unknown' ? 'Account owner could not be read' : 'No account or account owner' },
      { label: 'Need matched to a service line', state: d.services.length ? 'done' : 'missing', note: d.services.join(', ') || 'Choose a service' },
      { label: 'Decision maker or influencer named', state: dm ? 'done' : d.roles && !unread ? 'missing' : 'unknown', note: dm ? dm.name + ', ' + dm.role : unread ? `The role of ${unread.name} could not be read from CRM (role ID ${unread.unread})` : d.roles ? 'Add a Contact Role to this deal in CRM' : 'Contact Roles could not be read' },
      { label: 'Timeline or trigger recorded', state: d.timeline ? 'done' : 'missing', note: d.timeline ? '' : 'Set the closing date' },
      { label: 'Next step agreed', state: filled(d.nextStep) ? 'done' : 'missing', note: d.nextStep || 'Record the next step' }
    ];
  }
  const needsApproval = d => !!(d.timeline && d.created && day(d.timeline) > addMonths(d.created, C.approvalMonths));

  // A BDE-raised deal waits 1 business day for the BDM, then is accepted automatically
  function acceptance(d, now) {
    if (d.acceptance !== 'Pending') return { state: d.acceptance || 'none' };
    const due = addBusinessDays(d.created, 1);
    return { state: 'Pending', due, overdue: day(now) > due };
  }

  /* ---------- deal health (step 8) ---------- */
  function nextStepAlert(d, now) {
    if (isClosed(d.stage) || filled(d.nextStep) || !(d.prob >= 25 && d.prob <= 90)) return null;
    if (!d.nextStepUpdated) return { level: 'unknown', days: null };
    const days = businessDaysSince(d.nextStepUpdated, now);
    return { days, level: days >= C.managerAlertDays ? 'manager' : days >= C.ownerAlertDays ? 'owner' : 'soon' };
  }
  // Counts each time the closing date moved later. null = the history could not be read.
  function pushes(d) {
    if (!d.history) return null;
    const dates = d.history.filter(h => h.closeDate).sort((a, b) => toDate(a.at) - toDate(b.at)).map(h => h.closeDate);
    if (d.closeDate) dates.push(d.closeDate);
    return dates.filter((x, i) => i && day(x) > day(dates[i - 1])).length;
  }
  const needsReview = d => !isClosed(d.stage) && (pushes(d) || 0) >= C.maxPushes;

  function checkMove(d, to, evidence, options, skipGate) {
    if (isClosed(d.stage)) return 'This deal is closed.';
    if (to !== nextStage(d.stage, options)) return 'Stages move one at a time.';
    const open = gate(d).filter(g => g.state !== 'done');
    if (open.length && !skipGate) return 'Complete qualification first: ' + open.map(g => g.label).join('; ') + '.';
    if (d.acceptance === 'Pending') return 'The BDM has not accepted this deal yet.';
    if (d.acceptance === 'Rejected') return 'The BDM rejected this deal.';
    if (d.approval === 'Pending' || d.approval === 'Rejected') return 'Sales Manager approval is ' + d.approval.toLowerCase() + '.';
    if (!filled(evidence)) return 'Record the evidence for this stage.';
    return null;
  }
  // "need analysis" means the stage "Needs Analysis". "Proposal" or "Price Quote" mean "Proposal/Price Quote".
  const words = s => String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map(w => w === 'id' ? 'identify' : w.length > 3 ? w.replace(/s$/, '') : w).join(' ');
  const sameStage = (text, stage) => !!words(text) && [stage].concat(stage.split('/')).some(s => words(s) === words(text));
  // What a new next step does to the stage: null (nothing), { to } or { why } when it may not move
  function nextStepMove(d, text, options) {
    const p = path(options), at = p.indexOf(d.stage), next = nextStage(d.stage, options);
    const named = p.findIndex((s, i) => i > at && sameStage(text, s));
    if (!next || named < 0) return null;
    if (isWon(p[named])) return { why: 'A deal is closed as won with the Move button, not from the next step.' };
    if (p[named] !== next) return { why: 'Stages move one at a time. The next stage is ' + next + '.' };
    const why = checkMove({ ...d, nextStep: text }, next, text, options, !C.nextStepNeedsQualification);
    return why ? { why } : { to: next };
  }
  function checkLost(d, stage, reason, options, reasons) {
    if (isClosed(d.stage)) return 'This deal is closed.';
    if (!lostStages(options).includes(stage)) return 'Choose a lost stage.';
    if (!reasons.includes(reason)) return 'Choose a reason for the loss.';
    return null;
  }

  /* ---------- attribution (R6) ---------- */
  function influence(d) {
    if (!d.touches) return null;
    const list = d.touches.filter(t => { const n = daysBetween(t.date, d.created); return n >= 0 && n <= C.influencedDays; });
    return { list, channels: [...new Set(list.map(t => t.channel))], influenced: list.length > 0, sourced: d.sourcedBy === 'Marketing' };
  }

  /* ---------- services ---------- */
  // Services named in the website enquiry, for example "Services requested (2): Accounting Services, Payroll Services"
  function requestedServices(description, options) {
    const m = /services?\s+requested\s*(?:\((\d+)\))?\s*:\s*([^\r\n]*)/i.exec(description || '');
    if (!m) return [];
    const found = [];
    for (const part of m[2].split(/[,;]/).slice(0, m[1] ? +m[1] : undefined)) {
      const text = part.trim().toLowerCase();
      const hit = options.filter(o => text === o.toLowerCase() || text.startsWith(o.toLowerCase() + ' ')).sort((a, b) => b.length - a.length)[0];
      if (hit && !found.includes(hit)) found.push(hit);
    }
    return found;
  }

  // From Negotiation (90%) on, the services are fixed
  const servicesLocked = d => (d.prob !== null && d.prob >= C.lockServicesAt) || isWon(d.stage);

  /* ---------- roles (step 10): our proposal, CRM profiles must enforce the same ---------- */
  const access = {
    Admin: ['edit', 'decide', 'all'],
    BDM: ['edit', 'decide', 'all'],
    BDE: [],
    Marketing: ['all']
  };
  const can = (user, action) => (access[user.role] || []).includes(action);
  // A BDE sees the deals they raised or own. Anyone else sees what CRM shares with them.
  const canSee = (user, deal) => user.role !== 'BDE' || deal.createdById === user.id || deal.ownerId === user.id;

  const R = {
    toDate, day, daysBetween, addBusinessDays, businessDaysSince, addMonths, norm, befreeStage, isLost, isWon, isClosed, path, lostStages,
    missingStages, nextStage, gate, needsApproval, acceptance, nextStepAlert, pushes, needsReview, checkMove, sameStage, nextStepMove, checkLost, influence,
    requestedServices, servicesLocked, can, canSee
  };
  if (typeof module !== 'undefined') module.exports = R; else root.BefreeRules = R;
})(this);
