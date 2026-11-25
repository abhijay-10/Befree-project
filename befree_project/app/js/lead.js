// Lead widget screen
(function () {
  const C = window.BefreeConfig, R = window.BefreeRules;
  const inCrm = window.self !== window.top && C.mode !== 'demo';
  const db = inCrm ? window.BefreeCrm : window.BefreeSample;
  const ui = { id: null, user: C.users[0], form: null, msg: null, bad: false, busy: false, allTouches: false, list: null, rail: false, service: 'all', status: 'all', listError: null, tab: 'activity', edit: false, draft: null, noteDraft: null, users: null, ai: null, aiClosed: null, dup: null };
  let V = null;

  const $ = s => document.querySelector(s);
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const date = d => R.toDate(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const time = d => date(d) + ', ' + R.toDate(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const pill = (text, cls) => `<span class="pill ${cls || ''}">${esc(text)}</span>`;
  const opts = (list, blank) => `<option value="">${blank}</option>` + list.map(x => `<option>${esc(x)}</option>`).join('');
  const link = (entity, id, text) => V.live ? `<button class="link" data-entity="${esc(entity)}" data-record="${esc(id)}">${esc(text)}</button>` : esc(text);
  const problem = key => V.problems[key] ? `<p class="note bad">Could not load this section. ${esc(V.problems[key])}</p>` : '';
  const missing = key => !!(V.missing && V.missing[key]);
  const notSetUp = needs => `<p class="setup"><b>Not set up yet</b>Needs ${needs}</p>`;
  const shapes = {
    calendar: '<rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 7 8.5 6 8.5-6"/>',
    phone: '<path d="M6 3h3l1.8 4.6-2.3 1.7a12 12 0 0 0 6.2 6.2l1.7-2.3L21 15v3a3 3 0 0 1-3.2 3A16 16 0 0 1 3 6.2 3 3 0 0 1 6 3z"/>',
    deal: '<rect x="3" y="7.5" width="18" height="12.5" rx="2"/><path d="M8.5 7.5V5a1.5 1.5 0 0 1 1.5-1.5h4A1.5 1.5 0 0 1 15.5 5v2.5M3 13h18"/>',
    stop: '<circle cx="12" cy="12" r="9"/><path d="m5.7 5.7 12.6 12.6"/>',
    heat: '<path d="M10 13.6V5a2 2 0 1 1 4 0v8.6a4.5 4.5 0 1 1-4 0z"/>',
    people: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.2a6.5 6.5 0 0 1 3.5 5.8"/>',
    check: '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="m8 12.2 2.8 2.8L16.2 9"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.2l3.4 2"/>',
    card: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="11" r="2"/><path d="M5.5 16a3 3 0 0 1 6 0M14 10h4M14 14h4"/>',
    tag: '<path d="M3.5 11.5V4.5a1 1 0 0 1 1-1h7L20.5 12.5l-8 8z"/><circle cx="8" cy="8" r="1.4"/>',
    note: '<path d="M6 3h9l4 4v14H6z"/><path d="M9 12h7M9 16h5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    sync: '<path d="M20 11a8 8 0 0 0-14.3-4L4 9M4 4v5h5M4 13a8 8 0 0 0 14.3 4l1.7-2M20 20v-5h-5"/>',
    out: '<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/>',
    spark: '<path d="M11 3l1.9 5.6 5.6 1.9-5.6 1.9L11 18l-1.9-5.6-5.6-1.9 5.6-1.9zM18.5 15.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"/>',
    alert: '<path d="M12 5v8M12 18v.5"/>',
    tick: '<path d="m6 12.5 4 4 8-9"/>'
  };
  const icon = n => `<svg viewBox="0 0 24 24" aria-hidden="true">${shapes[n]}</svg>`;
  const icons = { 'Temperature': 'heat', 'Account engagement': 'people', 'Next task': 'check', 'Meeting status': 'calendar', 'Touch timeline': 'clock', 'Activity': 'clock', 'Lead details': 'card', 'Notes': 'note', 'Tasks': 'check', 'Linked deals': 'deal' };
  const initials = n => { const w = String(n).replace(/\(.*?\)/g, '').trim().split(/\s+/); return ((w[0] || '?')[0] + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase(); };
  const block = (title, body, cls) => `<section class="${cls || ''}"><h2>${icon(icons[title])}${title}</h2>${body}</section>`;

  // Each step is read from the record. Nothing is assumed.
  function journey() {
    const firstOf = (list, key) => list.map(x => x[key]).sort((a, b) => R.toDate(a) - R.toDate(b))[0];
    const accepted = V.meetings.filter(m => m.outcome === 'Accepted');
    const raised = V.isLead ? V.deals.length > 0 : ['Opportunity', 'Customer'].includes(V.contact.lifecycle);
    const own = V.touches.filter(t => t.contactId === V.contact.id);
    const steps = [
      ['Lead created', true, V.created],
      ['Owner assigned', !!V.account.owner, null, V.account.owner],
      ['Engaged', own.length > 0, firstOf(own, 'date')],
      ['Meeting booked', V.meetings.length > 0, firstOf(V.meetings, 'start')],
      ['Meeting accepted', accepted.length > 0, firstOf(accepted, 'start')],
      ['Deal raised', raised]
    ];
    // No next step for a lead we may not or should not work. Engaged is unknown until Touches exists.
    const stopped = R.isOptedOut(V.contact) || /lost|junk|not qualified/i.test(V.contact.status || '');
    const unknown = i => i === 2 && missing('touches');
    const next = stopped ? -1 : steps.findIndex((s, i) => !s[1] && !unknown(i));
    return '<ol class="journey" aria-label="Lead journey">' + steps.map(([label, done, when, note], i) => `<li class="${done ? 'done' : i === next ? 'next' : ''}"><span class="dot">${done ? icon('tick') : i + 1}</span><b>${label}</b><small>${done ? esc(note || (when ? date(when) : 'Done')) : i === next ? 'Next step' : unknown(i) ? 'No data yet' : 'Not yet'}</small></li>`).join('') + '</ol>';
  }
  function scale(value) {
    return '<div class="scale" aria-hidden="true">' + ['Cold', 'Warm', 'Hot'].map(x => `<span class="${x.toLowerCase()} ${x === value ? 'on' : ''}"><i></i>${x}</span>`).join('') + '</div>';
  }
  function faces() {
    const since = V.touches.filter(t => { const d = R.daysBetween(t.date, V.now); return d >= 0 && d <= C.warmDays; });
    const on = new Set(since.map(t => t.contactId));
    const list = V.contacts.slice().sort((a, b) => on.has(b.id) - on.has(a.id)), show = list.slice(0, 7);
    return '<ul class="faces">' + show.map(c => `<li class="${on.has(c.id) ? 'on' : ''}" title="${esc(c.name)}: ${on.has(c.id) ? 'engaged' : 'not engaged'}">${esc(initials(c.name))}</li>`).join('') + (list.length > 7 ? `<li>+${list.length - 7}</li>` : '') + '</ul>';
  }
  const allLeads = () => db.live ? ui.list : db.list(ui.user);
  const inService = c => ui.service === 'all' || (ui.service === 'none' ? !c.services.length : c.services.includes(ui.service.slice(2)));

  // Counts of leads per service. In the web tab a tile also filters the lead list.
  function servicesPanel() {
    const box = $('#services');
    if (!box) return;
    box.hidden = !V.service;
    if (!V.service) return;
    const head = text => `<div class="svc-head"><h2>${icon('tag')}Services</h2><p class="mute">${text}</p></div>`;
    if (!V.service.field && V.service.unread) { box.innerHTML = `<section>${head('')}<p class="note bad">Could not read the Leads fields from CRM. ${esc(V.service.unread)}</p></section>`; return; }
    if (!V.service.field && C.lead.service) { box.innerHTML = `<section>${head('')}<p class="note bad">The field ${esc(C.lead.service)} was not found in Leads. Check its API name and that your profile can see it.</p></section>`; return; }
    if (!V.service.field) { box.innerHTML = `<section>${head('')}<p class="setup"><b>No service field in Leads yet</b>Add a pick list field labelled Service to the Leads module. The counts then appear here.</p></section>`; return; }
    if (ui.listError) { box.innerHTML = `<section>${head('')}<p class="note bad">Could not count services. ${esc(ui.listError)}</p></section>`; return; }
    const list = allLeads();
    if (!list) { box.innerHTML = `<section>${head('Counting leads')}</section>`; return; }
    const s = R.countServices(list, V.service.options);
    const tile = (key, label, count) => {
      const pct = s.total ? Math.round(count / s.total * 100) : 0;
      const body = `<span class="svc-name">${esc(label)}</span><span class="svc-bar"><i style="width:${pct}%"></i></span><b>${count}</b><small>${pct}%</small>`;
      const cls = key === 'none' ? 'svc-row none' : 'svc-row';
      return ui.rail || !db.live ? `<button class="${cls}" data-svc="${esc(key)}" aria-pressed="${ui.service === key}" title="Show these leads">${body}</button>` : `<div class="${cls}">${body}</div>`;
    };
    const none = s.total - s.chosen;
    box.innerHTML = `<section>${head(`${s.chosen} of ${list.partial ? 'the first ' : ''}${s.total} leads have chosen a service`)}<div class="svc-list">` +
      s.rows.map(r => tile('s:' + r.name, r.name, r.count)).join('') + tile('none', 'No service yet', none) + '</div>' +
      (ui.service === 'all' ? '' : '<button class="link" data-svc="all">Show all leads</button>') + '</section>';
  }
  function serviceForm() {
    const s = V.service, now = V.contact.services || [];
    if (!s || !s.field) return '';
    if (!s.editable || !R.can(V.user, 'service')) return `<div class="svc-form"><p class="mute">${esc(s.label)}</p><p><b>${esc(now.join(', ') || 'Not chosen')}</b></p></div>`;
    const choices = [...new Set(s.options.concat(now))];
    const field = s.multi
      ? '<div class="checks">' + choices.map(x => `<label><input type="checkbox" name="service" value="${esc(x)}" ${now.includes(x) ? 'checked' : ''}> ${esc(x)}</label>`).join('') + '</div>'
      : `<select name="service" aria-label="${esc(s.label)}"><option value="">Not chosen</option>${choices.map(x => `<option ${now.includes(x) ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>`;
    return `<form class="svc-form" data-form="service"><p class="mute">${esc(s.label)}</p><div class="row">${field}<button>Save</button></div></form>`;
  }
  function detailBlock() {
    const rows = V.details || [['Email', V.contact.email], ['Account', V.account.name], ['Employees', V.account.staff]];
    const filled = rows.filter(r => r[1] !== null && r[1] !== undefined && r[1] !== '');
    const mayEdit = V.editable && V.editable.length && R.can(V.user, 'edit');
    const head = `<div class="svc-head"><h2>${icon('card')}Lead details</h2>${mayEdit && !ui.edit ? '<button data-do="edit">Edit</button>' : ''}</div>`;
    if (mayEdit && ui.edit) return `<section>${head}${editForm()}</section>`;
    return `<section>${head}` + serviceForm() + (filled.length ? '<dl class="details">' + filled.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('') + '</dl>' : '<p class="mute">No details recorded.</p>') + '</section>';
  }
  function editForm() {
    const d = ui.draft || {};
    const val = f => f.key in d ? d[f.key] : f.value == null ? '' : String(f.value);
    const field = f => {
      const v = val(f), req = f.required ? 'required' : '';
      const input = f.type === 'select'
        ? `<select name="${f.key}" ${req}><option value="">Not set</option>${[...new Set(f.options.concat(v ? [v] : []))].map(x => `<option ${x === v ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>`
        : `<input name="${f.key}" type="${f.type}" value="${esc(v)}" ${f.type === 'number' ? 'min="0" step="any"' : 'maxlength="255"'} ${req}>`;
      return `<label>${esc(f.label)}${input}</label>`;
    };
    let owner = '';
    if (R.can(V.user, 'owner') && ui.users) {
      const now = V.account.ownerId || V.account.owner, list = ui.users.some(u => u.id === now) ? ui.users : [{ id: now, name: V.account.owner }].concat(ui.users);
      const pick = 'owner' in d ? d.owner : now;
      owner = `<label>Owner<select name="owner">${list.map(u => `<option value="${esc(u.id)}" ${u.id === pick ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></label>`;
    }
    return `<form data-form="edit"><div class="fields">${V.editable.map(field).join('')}${owner}</div><div class="row end"><button class="primary">Save changes</button><button type="button" data-do="cancelEdit">Cancel</button></div></form>`;
  }
  function tabBar() {
    if (!V.notes) return '';
    const open = V.tasks.filter(t => t.open).length;
    const tabs = [['activity', missing('touches') ? 'Activity' : 'Touches'], ['notes', 'Notes', V.notes.length]];
    if (R.can(V.user, 'task')) tabs.push(['tasks', 'Tasks', open]);
    if (!tabs.some(t => t[0] === ui.tab)) ui.tab = 'activity';
    return '<div class="tabs" role="group" aria-label="Lead records">' + tabs.map(([k, n, x]) => `<button data-tab="${k}" aria-pressed="${ui.tab === k}">${n}${x === undefined ? '' : ` <span>${x}</span>`}</button>`).join('') + '</div>';
  }
  function notesBlock() {
    if (V.problems.notes) return block('Notes', problem('notes'));
    const d = ui.noteDraft || {};
    const add = R.can(V.user, 'note') ? `<form class="add" data-form="note"><input name="title" placeholder="Title (optional)" aria-label="Note title" maxlength="120" value="${esc(d.title || '')}"><textarea name="text" rows="3" placeholder="Write a note" aria-label="Note" maxlength="30000" required>${esc(d.text || '')}</textarea><button class="primary">Add note</button></form>` : '';
    return block('Notes', add + (V.notes.length ? '<ul class="notes">' + V.notes.map(n => `<li>${n.title ? `<b>${esc(n.title)}</b>` : ''}<p>${esc(n.text)}</p><small>${esc(n.by)}${n.at ? (n.by ? ', ' : '') + time(n.at) : ''}</small></li>`).join('') + '</ul>' : '<p class="mute">No notes yet.</p>'));
  }
  function tasksBlock() {
    if (V.problems.tasks) return block('Tasks', problem('tasks'));
    const add = R.isOptedOut(V.contact) ? '<p class="mute">Opted out. New tasks are blocked.</p>'
      : '<form class="add task" data-form="task"><input name="subject" placeholder="Task" aria-label="Task" maxlength="200" required><input type="date" name="due" aria-label="Due date" required><button class="primary">Add task</button></form>';
    const list = V.tasks.slice().sort((a, b) => b.open - a.open || R.toDate(a.due || '9999-01-01') - R.toDate(b.due || '9999-01-01'));
    return block('Tasks', add + (list.length ? '<ul class="tasks">' + list.map(t => `<li class="${t.open ? '' : 'closed'}"><span><b>${esc(t.type)}</b><small>${esc(t.owner)}${t.due ? (t.owner ? ', ' : '') + 'due ' + date(t.due) : ''} ${t.open && t.due && R.daysBetween(t.due, V.now) > 0 ? pill('Overdue', 'bad') : ''}</small></span>${t.open ? `<button data-close="${esc(t.id)}">Complete</button>` : pill('Completed', 'good')}</li>`).join('') + '</ul>' : '<p class="mute">No tasks.</p>'));
  }
  // Shown until Touches exists: what CRM already knows about this lead
  function activityBlock() {
    const items = [];
    const add = (when, text, note, cls) => { if (when) items.push({ when, text, note, cls }); };
    V.meetings.forEach(m => add(m.start, 'Meeting', R.toDate(m.start) > V.now ? 'Upcoming' : m.outcome || 'Took place', 'meet'));
    V.tasks.forEach(k => add(k.due, k.type, k.open ? 'Task due' : 'Task closed', 'task'));
    if (V.modified && V.created && R.toDate(V.modified) - R.toDate(V.created) > 60000) add(V.modified, 'Record updated', 'CRM');
    add(V.created, 'Lead created', 'CRM');
    items.sort((a, b) => R.toDate(b.when) - R.toDate(a.when));
    return block('Activity', '<ul class="timeline">' + items.slice(0, 8).map(x => `<li class="${x.cls || ''}"><time>${date(x.when)}</time><b>${esc(x.text)}</b><span class="mute">${esc(x.note)}</span></li>`).join('') + '</ul><p class="foot">Email clicks, webinars and events will appear here once Touches is set up.</p>');
  }

  function header() {
    const c = V.contact, a = V.account, seg = R.segment(a.staff);
    return `<header class="band"><div class="avatar" aria-hidden="true">${esc(initials(c.name))}</div><div class="who"><h1>${esc(c.name)} ${R.isOptedOut(c) ? pill('Opted out', 'bad') : ''}</h1>
      <p>${c.title ? esc(c.title) + ', ' : ''}${!V.live || a.id ? link(C.modules.account, a.id, a.name) : esc(a.name)}</p></div>
      <dl><div><dt>Country</dt><dd>${esc(a.country || 'Not set')}</dd></div><div><dt>Segment</dt><dd>${pill(seg.label)}</dd></div>
      <div><dt>Owner</dt><dd>${esc(a.owner || 'Unassigned')}</dd></div>${V.service && V.service.field ? `<div><dt>Service</dt><dd>${esc((c.services || []).join(', ') || 'Not chosen')}</dd></div>` : ''}<div><dt>${c.status !== undefined && !c.lifecycle ? 'Lead status' : 'Lifecycle'}</dt><dd>${esc(c.lifecycle || c.status || 'Not set')}</dd></div></dl></header>`;
  }
  function temperatureBlock(t) {
    if (missing('touches')) return block('Temperature', scale() + '<p class="mute">Waiting for engagement data</p>', 'waiting');
    if (V.problems.touches) return block('Temperature', problem('touches'));
    return block('Temperature', `<p class="big">${t.value}</p>${scale(t.value)}<p>${esc(t.reason)}</p>`, 'is-' + t.value.toLowerCase());
  }
  function engagementBlock() {
    if (missing('touches')) return block('Account engagement', faces() + '<p class="mute">Waiting for engagement data</p>', 'waiting');
    if (V.problems.touches || V.problems.contacts) return block('Account engagement', problem('touches') || problem('contacts'));
    const e = R.engagement(V);
    return block('Account engagement', `<p class="big">${e.engaged} of ${e.total}</p>${faces()}<p>contacts engaged in the last ${C.warmDays} days</p>`);
  }
  function taskBlock(t) {
    const open = V.tasks.filter(k => k.open).sort((x, y) => R.toDate(x.due || '9999-01-01') - R.toDate(y.due || '9999-01-01'))[0];
    const due = d => d ? `Due ${date(d)} ${R.daysBetween(d, V.now) > 0 ? pill('Overdue', 'bad') : ''}` : 'No due date';
    if (V.problems.tasks) return block('Next task', problem('tasks'));
    if (R.isOptedOut(V.contact)) return block('Next task', '<p class="mute">No outreach. This contact is opted out.</p>');
    if (open) return block('Next task', `<p><b>${esc(open.type)}</b></p><p>${esc(open.owner)}</p><p>${due(open.due)}</p>`);
    if (V.problems.touches) return block('Next task', problem('touches'));
    if (missing('touches')) return block('Next task', '<p class="mute">No open task.</p>');
    const r = R.routing(V, t);
    if (!r) return block('Next task', `<p class="mute">${t.value === 'Cold' ? 'No task. Cold leads are not routed.' : 'No open task.'}</p>`);
    return block('Next task', `<p><b>${r.type}</b> ${pill('Expected, not created yet')}</p><p>${r.user ? esc(r.user.name) + ' (' + r.user.role + ')' : 'No owner for this country'}</p><p>${due(r.due)}</p>`);
  }
  function meetingBlock() {
    if (V.problems.meetings) return block('Meeting status', problem('meetings'));
    const m = R.latestMeeting(V), state = R.meetingState(m, V.now);
    if (!m) return block('Meeting status', '<p class="mute">No meeting booked.</p>');
    let h = `<p>${time(m.start)} ${m.selfBooked ? pill('Self-booked', 'hot') : ''}</p>`;
    if (state === 'upcoming') h += '<p>Upcoming</p>';
    if (missing('outcome')) return block('Meeting status', h + (state === 'upcoming' ? '' : notSetUp('a Meeting Outcome field')));
    if (state === 'done') h += `<p><b>${esc(m.outcome)}</b>${m.reason ? ': ' + esc(m.reason) : ''}</p>`;
    if (state === 'due' || state === 'overdue') {
      h += `<p>Outcome needed ${state === 'overdue' ? pill('Overdue', 'bad') : pill('Due within 1 business day', 'warm')}</p>`;
      if (R.can(V.user, 'outcome')) h += `<form data-form="outcome"><label>Outcome<select name="outcome">${opts(C.outcomes, 'Choose')}</select></label><label id="reason" hidden>Reason<select name="reason">${opts(C.rejectReasons, 'Choose')}</select></label><button class="primary">Save outcome</button></form>`;
    }
    if (missing('reschedules')) return block('Meeting status', h);
    h += `<p class="mute">Reschedules: ${m.reschedules} of ${C.maxReschedules}</p>`;
    const again = state !== 'done' || m.outcome === 'No-show';
    if (again && R.can(V.user, 'book') && !R.isOptedOut(V.contact) && !coldAlready(m)) {
      h += m.reschedules < C.maxReschedules ? '<button data-show="resched">Reschedule</button>' : '<button data-do="toCold">Return to Cold</button>';
    }
    return block('Meeting status', h);
  }
  const coldAlready = m => V.contact.backToColdOn && R.daysBetween(m.bookedOn, V.contact.backToColdOn) >= 0 && m.outcome === 'No-show';
  function touchBlock() {
    if (missing('touches')) return activityBlock();
    if (V.problems.touches) return block('Touch timeline', problem('touches'));
    const all = V.touches.slice().sort((x, y) => R.toDate(y.date) - R.toDate(x.date));
    const show = ui.allTouches ? all : all.slice(0, 6);
    return block('Touch timeline', all.length ? '<ul class="timeline">' + show.map(t => `<li class="${R.isHighIntent(t) ? 'high' : ''}"><time>${date(t.date)}</time><span><b>${esc(t.type)}</b> ${R.isHighIntent(t) ? pill('High intent', 'hot') : ''}</span><span>${esc(t.channel)}</span><span class="mute">${t.contactId === V.contact.id ? 'This contact' : esc(t.contactName)}</span></li>`).join('') + '</ul>' +
      (all.length > 6 ? `<button class="link" data-do="touches">${ui.allTouches ? 'Show fewer' : 'Show all ' + all.length}</button>` : '') : '<p class="mute">No touches recorded.</p>');
  }
  function dealBlock() {
    if (V.problems.deals) return block('Linked deals', problem('deals'));
    const ds = R.visibleDeals(V);
    const none = V.isLead ? 'Deals appear here after the lead is converted.' : R.can(V.user, 'allDeals') ? 'No deals at this account.' : 'No deals raised by you at this account.';
    return block('Linked deals', ds.length ? '<ul class="deals">' + ds.map(d => `<li><span>${link(C.modules.deal, d.id, d.name)}</span><span class="mute">${esc(d.stage || 'Converted')}${d.stage in C.stages ? ', ' + C.stages[d.stage] + '%' : ''}</span></li>`).join('') + '</ul>' : `<p class="mute">${none}</p>`);
  }
  function actions() {
    const out = R.isOptedOut(V.contact), ok = R.canRaiseDeal(V), m = R.latestMeeting(V), state = R.meetingState(m, V.now);
    const pending = state === 'upcoming' || (!missing('outcome') && (state === 'due' || state === 'overdue'));
    const b = [];
    const add = (action, attr, text, off, cls) => { if (R.can(V.user, action)) b.push(`<button ${attr} class="${cls || ''}" ${off || ui.busy ? 'disabled' : ''}>${text}</button>`); };
    add('book', 'data-show="book"', icon('calendar') + 'Book meeting', out || pending || !!V.problems.meetings);
    if (!V.live || V.isLead) add('ai', 'data-do="ai" id="aiButton"', icon('spark') + 'AI summary', !!ui.ai && ui.ai.state === 'loading', 'ai');
    add('email', 'data-do="email"', icon('mail') + 'Send email', out);
    add('call', 'data-do="call"', icon('phone') + 'Add call task', out);
    add('raise', 'data-do="raise"', icon('deal') + 'Raise deal', !ok, 'primary');
    if (V.live) b.push(`<button data-entity="${V.isLead ? 'Leads' : C.modules.contact}" data-record="${esc(V.contact.id)}">${icon('out')}Open in CRM</button>`);
    add('optOut', 'data-show="optout"', icon('stop') + 'Opt out', out, 'quiet');
    const notes = [];
    if (out) notes.push('Opted out: email, call tasks and meeting booking are blocked.');
    if (R.can(V.user, 'raise') && !ok) notes.push(missing('outcome') ? 'Raise deal needs an Accepted meeting. The Meeting Outcome field is not set up yet.' : 'Raise deal unlocks after an Accepted meeting.');
    if (V.live && V.user.role === 'View only') notes.push(`The CRM profile "${esc(V.user.profile || 'unknown')}" is not matched to a Befree role in config.js.`);
    if (V.service && V.service.notFound && V.service.notFound.length && V.user.role === 'Admin') notes.push('These API names in config.js are not in your Leads module: ' + esc(V.service.notFound.join(', ')) + '.');
    return `<div class="actions">${b.join('') || '<span class="mute">View only</span>'}</div>${notes.map(n => `<p class="hint">${n}</p>`).join('')}${form()}`;
  }
  // AI summary. Drawn in its own box, so typing elsewhere on the page is not lost.
  function drawAi() {
    const box = $('#ai'), a = ui.ai;
    if (!box) return;
    if ($('#aiButton')) $('#aiButton').disabled = ui.busy || (!!a && a.state === 'loading');
    if (!a || a.id !== ui.id) { box.innerHTML = ''; return; }
    const tools = a.state === 'loading' ? '' : `<div class="ai-tools"><button class="mini" data-do="aiAgain">${icon('sync')}${a.state === 'error' ? 'Try again' : 'Refresh'}</button><button class="mini" data-do="aiClose">Close</button></div>`;
    const card = body => { box.innerHTML = `<section class="ai-card"><div class="ai-head"><h2>${icon('spark')}AI summary</h2>${a.at ? `<small>Generated ${time(a.at)}</small>` : ''}${V.live ? '' : pill('Sample answer, OpenAI not used')}${tools}</div><div class="ai-body">${body}</div></section>`; };
    if (a.state === 'loading') return card('<div class="ai-wait"><p class="mute" role="status">Reading this lead and writing the summary</p><i></i><i></i><i></i></div>');
    if (a.state === 'error') return card(`<p class="note bad" role="alert">${esc(a.error)}</p>`);
    const s = a.data, seg = R.segment(V.account.staff);
    const facts = [['Company', V.account.name], ['Job title', V.contact.title], ['Country', V.account.country], ['Segment', seg.code ? seg.label : ''], ['Owner', V.account.owner], ['Service', (V.contact.services || []).join(', ')], [V.contact.lifecycle ? 'Lifecycle' : 'Status', V.contact.lifecycle || V.contact.status]]
      .concat((V.details || []).filter(d => ['Lead source', 'Industry', 'Rating', 'Employees'].includes(d[0])))
      .filter(x => x[1] !== null && x[1] !== undefined && x[1] !== '');
    const points = (list, cls, mark, none) => list.length ? `<ul class="ai-list ${cls}">` + list.map(x => `<li>${icon(mark)}<span>${esc(x)}</span></li>`).join('') + '</ul>' : `<p class="mute">${none}</p>`;
    card((a.old ? `<p class="note warm-note">This lead ${a.old === 'changed' ? 'has changed since' : 'was reloaded after'} the summary was made. Refresh to include any changes.</p>` : '') +
      `<div class="ai-result"><span class="verdict ${s.verdict}">${s.label}</span><span class="mute">Evidence: ${s.evidence}</span></div><p class="ai-text">${esc(s.summary)}</p>${s.changed ? `<p class="setup">${esc(s.changed)}</p>` : ''}` +
      `<div class="ai-cols"><div><h3>Lead data</h3><dl class="details">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl></div>` +
      `<div><h3>Points to a deal</h3>${points(s.good, 'good-list', 'tick', 'No clear signs yet.')}</div>` +
      `<div><h3>Against, or not known</h3>${points(s.bad, 'bad-list', 'alert', 'No concerns found.')}</div></div>` +
      (s.next ? `<div class="ai-next"><b>Suggested next step</b>${esc(s.next)}</div>` : '') + `<p class="ai-foot">Written by AI from CRM data. Check it before you act on it.${a.saved ? ` Saved in ${a.saved === 'crm' ? 'CRM' : 'this browser only'}.` : ''}</p>`);
  }
  // Duplicate alert: is the company already an account, or the email already in CRM?
  function drawDup() {
    const box = $('#dup'), d = ui.dup && ui.dup.id === ui.id ? ui.dup.data : null;
    if (!box) return;
    if (!d) { box.innerHTML = ''; return; }
    const names = (entity, list) => list.slice(0, 3).map(x => link(entity, x.id, x.name) + (x.by ? ` (${x.by})` : '')).join(', ') + (list.length > 3 ? ` and ${list.length - 3} more` : '');
    const line = (cls, title, text) => `<p class="note ${cls}">${icon('alert')}<span><b>${title}</b> ${text}</span></p>`;
    const out = [];
    if (d.contacts.length) out.push(line('bad', 'Email already exists.', `${esc(d.email)} is already used by ${d.contacts.length === 1 ? 'the contact' : 'the contacts'} ${names(C.modules.contact, d.contacts)}.`));
    if (d.leads.length) out.push(line('bad', 'Email already exists.', `${esc(d.email)} is also on ${d.leads.length === 1 ? 'the lead' : d.leads.length + ' other leads:'} ${names('Leads', d.leads)}.`));
    if (d.accounts.length) out.push(line('warm-note', 'Company already exists.', `Account: ${names(C.modules.account, d.accounts)}. Add this lead to it when converting.`));
    if (d.failed.length) out.push(`<p class="hint dup-off">Duplicates could not be checked in: ${esc(d.failed.join(', '))}.</p>`);
    box.innerHTML = out.join('');
  }
  async function checkDup() {
    const v = V, id = ui.id;
    if (v.live && !v.isLead) return;
    let data;
    try { data = await db.duplicates(v); } catch (e) { data = { email: '', accounts: [], contacts: [], leads: [], failed: ['CRM'] }; }
    if (id !== ui.id || v !== V) return; // another lead was picked, or this one was reloaded
    ui.dup = { id, data };
    drawDup();
  }
  // Saved summaries: kept in a Leads field if it exists, and in this browser for this user
  const aiKey = v => 'befree-ai:' + (v.live ? v.user.id : 'sample') + ':' + v.contact.id;
  // Changes when something the summary is based on changes
  function aiMark(v) {
    const c = v.contact, text = JSON.stringify([c.name, c.title, v.account.name, c.status, c.lifecycle, !!c.optedOut, c.services, v.described,
      (v.notes || []).map(n => [n.id, n.text]), v.tasks.map(t => [t.id, t.open]), v.meetings.map(m => [m.id, m.start, m.outcome])]);
    let h = 0;
    for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
    return h;
  }
  async function keepAi(v, raw, at) {
    const { verdict, evidence, summary, for_deal, concerns, next_step } = raw;
    const text = JSON.stringify({ at: at.toISOString(), mark: aiMark(v), answer: { verdict, evidence, summary, for_deal, concerns, next_step } });
    let where = '';
    v.aiSaved = text;
    try { localStorage.setItem(aiKey(v), text); where = 'browser'; } catch (e) { /* browser storage is blocked */ }
    if (v.aiField) {
      try { await db.saveAi(v, text); where = 'crm'; } catch (e) { /* the browser copy is still there */ }
    }
    return where;
  }
  // Shows the last summary of this lead again, without asking OpenAI
  function restoreAi() {
    if (ui.ai || !R.can(V.user, 'ai') || (V.live && !V.isLead)) return false;
    let local = '';
    try { local = localStorage.getItem(aiKey(V)); } catch (e) { /* browser storage is blocked */ }
    const found = [[V.aiSaved, V.aiField ? 'crm' : 'browser'], [local, 'browser']].map(([text, saved]) => {
      try {
        const x = JSON.parse(text), at = new Date(x.at);
        return isNaN(at) ? null : { at, saved, old: x.mark === aiMark(V) ? false : 'changed', data: R.checkSummary(V, x.answer) };
      } catch (e) { return null; }
    }).filter(Boolean).sort((a, b) => b.at - a.at)[0]; // the newest one
    if (!found) return false;
    ui.ai = { id: ui.id, state: 'done', ...found };
    return true;
  }
  async function summarize() {
    if (!V || V.contact.id !== ui.id) return; // the picked lead is still loading
    const v = V, job = ui.ai = { id: ui.id, state: 'loading' };
    let raw = null;
    ui.aiClosed = null;
    drawAi();
    $('#ai').scrollIntoView({ block: 'nearest' });
    try {
      raw = await db.summarize(v);
      Object.assign(job, { data: R.checkSummary(v, raw), at: new Date(), state: 'done' });
    } catch (e) { Object.assign(job, { state: 'error', error: e.message || 'The summary could not be made.' }); }
    const saving = job.state === 'done' ? keepAi(v, raw, job.at) : null; // kept even if another lead was picked meanwhile
    if (ui.ai === job && $('#ai')) {
      drawAi();
      $('#ai').scrollIntoView({ block: 'nearest' });
    }
    if (!saving) return;
    job.saved = await saving;
    if (ui.ai === job && $('#ai')) drawAi();
  }
  function form() {
    if (ui.form === 'optout') return `<div class="panel"><p>Opt out ${esc(V.contact.name)}? Emails and call tasks will be blocked.</p><button class="primary" data-do="optout">Yes, opt out</button> <button data-do="cancel">Cancel</button></div>`;
    if (ui.form === 'book' || ui.form === 'resched') return `<form class="panel" data-form="${ui.form}"><label>${ui.form === 'book' ? 'Meeting' : 'New meeting'} date and time<input type="datetime-local" name="start" required></label><button class="primary">${ui.form === 'book' ? 'Book meeting' : 'Reschedule'}</button> <button type="button" data-do="cancel">Cancel</button></form>`;
    return '';
  }

  function render() {
    if (!db.live) {
      $('#demo').hidden = false;
      $('#demo').innerHTML = `<span>Sample data</span><label>View as <select id="user">${C.users.map(u => `<option value="${u.id}" ${u === ui.user ? 'selected' : ''}>${u.name} (${u.role}${u.country ? ', ' + u.country : ''})</option>`).join('')}</select></label>`;
    }
    rail();
    const t = R.temperature(V);
    $('#app').innerHTML = '<div class="hero' + (ui.shown === ui.id ? '' : ' enter') + '">' + header() + journey() + actions() + '</div>' + (ui.msg ? `<p class="note ${ui.bad ? 'bad' : 'good'}" role="status">${esc(ui.msg)}</p>` : '') +
      '<div id="dup" role="alert"></div><div id="ai" aria-live="polite"></div><div class="stats">' + temperatureBlock(t) + engagementBlock() + (R.can(V.user, 'task') ? taskBlock(t) : '') + meetingBlock() + '</div>' +
      '<div class="cols"><div class="stack"><div>' + tabBar() + (V.notes && ui.tab === 'notes' ? notesBlock() : V.notes && ui.tab === 'tasks' ? tasksBlock() : touchBlock()) + '</div><div id="services"></div></div><div class="stack">' + detailBlock() + dealBlock() + '</div></div>';
    ui.shown = ui.id;
    servicesPanel();
    drawDup();
    drawAi();
  }
  // Lead list: sample data, or the web tab where no record is open
  function rail() {
    const list = allLeads();
    if (!list || (db.live && !ui.rail)) return;
    $('#rail').hidden = false;
    if (!$('#find')) $('#rail').innerHTML = '<div class="rail-top"><div class="rail-head"><p>Leads <span id="count"></span></p><button class="mini" data-do="refresh" aria-label="Refresh leads" title="Refresh leads">' + icon('sync') + '</button><button class="mini primary" id="newLead" data-do="newLead">' + icon('plus') + 'New</button></div><input id="find" type="search" placeholder="Search name or company" aria-label="Search name or company"><select id="status" aria-label="Filter by status"></select></div><div id="leads"></div>';
    $('#newLead').hidden = !R.can(V.user, 'newLead');
    const states = [...new Set(list.map(c => c.status).filter(Boolean))].sort();
    if (ui.status !== 'all' && !states.includes(ui.status)) ui.status = 'all';
    if ($('#status').dataset.key !== states.join()) {
      $('#status').dataset.key = states.join();
      $('#status').innerHTML = '<option value="all">All statuses</option>' + states.map(s => `<option>${esc(s)}</option>`).join('');
    }
    $('#status').value = ui.status;
    const q = $('#find').value.trim().toLowerCase();
    const shown = list.filter(c => (c.name + ' ' + c.sub).toLowerCase().includes(q) && inService(c) && (ui.status === 'all' || c.status === ui.status));
    const view = shown.slice(0, 200);
    const key = view.map(c => c.id + c.name + c.sub).join();
    $('#count').textContent = (shown.length === list.length ? '' : shown.length + ' of ') + (list.partial ? 'first ' : '') + list.length;
    if ($('#leads').dataset.key !== key) {
      $('#leads').dataset.key = key;
      $('#leads').innerHTML = view.map(c => `<button data-lead="${esc(c.id)}"><span class="face" aria-hidden="true">${esc(initials(c.name))}</span><span class="txt"><b>${esc(c.name)}</b><small>${esc(c.sub)}</small></span></button>`).join('') || '<p class="mute">No leads match.</p>';
      if (shown.length > view.length) $('#leads').insertAdjacentHTML('beforeend', '<p class="mute">Showing 200. Search to find others.</p>');
    }
    $('#leads').querySelectorAll('button').forEach(b => b.setAttribute('aria-current', b.dataset.lead === ui.id ? 'true' : 'false'));
  }
  async function reload(msg, bad) {
    const id = ui.id, v = await db.load(id, ui.user);
    if (id !== ui.id) { ui.busy = false; return; } // another lead was picked meanwhile
    V = v;
    if (ui.ai) ui.ai.old = true;
    else if (ui.aiClosed !== id) restoreAi();
    const item = V.isLead && (ui.list || []).find(c => c.id === id); // keep the list in step with the saved lead
    if (item) Object.assign(item, { name: V.contact.name, sub: V.account.name, status: V.contact.status });
    Object.assign(ui, { msg: msg || null, bad: !!bad, form: null, busy: false });
    $('#app').classList.remove('loading');
    render();
    checkDup();
  }
  async function run(work, msg) {
    if (ui.busy) return;
    ui.busy = true;
    document.querySelectorAll('#app button').forEach(b => { b.disabled = true; });
    try { await work(); } catch (e) { return reload('Not saved. ' + (e.message || 'Unknown error'), true).catch(fail); }
    await reload(msg).catch(fail);
  }
  // Keep what the user has typed when the screen is redrawn
  function keep() {
    const e = $('form[data-form=edit]'), n = $('form[data-form=note]');
    if (e) ui.draft = Object.fromEntries(new FormData(e));
    if (n) ui.noteDraft = Object.fromEntries(new FormData(n));
  }
  function say(msg, bad) { keep(); ui.msg = msg; ui.bad = !!bad; render(); }
  function fail(e) { ui.busy = false; $('#app').classList.remove('loading'); $('#app').innerHTML = `<p class="note bad">Could not load the lead. ${esc(e && e.message || 'Unknown error')}</p>`; }

  document.addEventListener('change', e => {
    if (e.target.id === 'user') {
      ui.user = C.users.find(u => u.id === e.target.value);
      const list = db.list(ui.user);
      Object.assign(ui, { service: 'all', status: 'all', edit: false, draft: null, noteDraft: null, ai: null, aiClosed: null });
      if (!list.some(c => c.id === ui.id)) ui.id = list[0].id;
      reload();
    }
    if (e.target.id === 'status') { ui.status = e.target.value; rail(); }
    if (e.target.name === 'outcome') $('#reason').hidden = e.target.value !== 'Rejected';
  });
  document.addEventListener('input', e => { if (e.target.id === 'find') rail(); });
  document.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    const x = b.dataset, m = R.latestMeeting(V || { meetings: [] });
    if (x.svc) {
      ui.service = ui.service === x.svc ? 'all' : x.svc;
      rail();
      servicesPanel();
      const again = document.querySelector(`#services [data-svc="${CSS.escape(x.svc)}"]`);
      if (again) again.focus();
      return;
    }
    if (x.lead) {
      if (ui.busy || x.lead === ui.id) return;
      Object.assign(ui, { id: x.lead, allTouches: false, edit: false, draft: null, noteDraft: null, ai: null, aiClosed: null });
      rail();
      $('#app').classList.add('loading');
      return reload().catch(fail);
    }
    if (x.tab) { keep(); ui.tab = x.tab; return render(); }
    if (x.close) return run(() => db.closeTask(V, x.close), 'Task completed.');
    if (x.record) return db.open(x.entity, x.record);
    if (x.show) { ui.form = x.show; return say(null); }
    switch (x.do) {
      case 'cancel': ui.form = null; return say(null);
      case 'edit':
        ui.edit = true;
        say(null);
        if (R.can(V.user, 'owner') && !ui.users) db.users().then(u => { ui.users = u; if (ui.edit) { keep(); render(); } }, () => { ui.users = null; });
        return;
      case 'ai':
        if (ui.ai && ui.ai.state === 'done' && !ui.ai.old) return $('#ai').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        if (!ui.ai && V.contact.id === ui.id && restoreAi()) { // closed earlier: show it again
          ui.aiClosed = null;
          drawAi();
          return $('#ai').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
        return summarize();
      case 'aiAgain': return summarize();
      case 'aiClose': ui.ai = null; ui.aiClosed = ui.id; drawAi(); return $('#aiButton') && $('#aiButton').focus();
      case 'cancelEdit': ui.edit = false; say(null); ui.draft = null; return;
      case 'newLead': return V.live ? db.createLead() : say('Sample only: CRM would open its Create Lead page.');
      case 'refresh': return run(async () => { if (db.live) ui.list = await db.leads(); }, 'Leads refreshed.');
      case 'touches': ui.allTouches = !ui.allTouches; return say(null);
      case 'optout': return run(() => db.optOut(V), V.contact.name + ' is opted out.');
      case 'call': return run(() => db.addCall(V), 'Call task added.');
      case 'toCold': return run(() => db.toCold(V, m), 'Returned to Cold after ' + C.maxReschedules + ' reschedules.');
      case 'email': return say(V.live ? 'Use Send Email on this record in CRM.' : 'Sample only: the email would be sent from CRM.');
      case 'raise': return say('The deal form will come with the Deal widget.');
    }
  });
  document.addEventListener('submit', e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target)), kind = e.target.dataset.form, m = R.latestMeeting(V);
    if (kind === 'outcome') {
      const err = R.checkOutcome(f);
      return err ? say(err, true) : run(() => db.outcome(V, m, f), 'Meeting outcome saved: ' + f.outcome + '.');
    }
    if (kind === 'note') {
      const text = f.text.trim();
      if (!text) return say('Write a note first.', true);
      ui.noteDraft = f;
      return run(async () => { await db.addNote(V, f.title.trim(), text); ui.noteDraft = null; }, 'Note added.');
    }
    if (kind === 'task') {
      const subject = f.subject.trim();
      if (!subject) return say('Enter the task.', true);
      return run(() => db.addTask(V, subject, f.due), 'Task added.');
    }
    if (kind === 'edit') {
      const changes = {};
      V.editable.forEach(x => {
        const now = String(f[x.key] == null ? '' : f[x.key]).trim(), old = x.value == null ? '' : String(x.value);
        if (now !== old) changes[x.key] = now === '' ? null : x.type === 'number' ? Number(now) : now;
      });
      const blank = V.editable.find(x => x.required && x.key in changes && changes[x.key] === null);
      if (blank) return say(blank.label + ' is required.', true);
      const owner = f.owner && f.owner !== (V.account.ownerId || V.account.owner) ? f.owner : null;
      if (!Object.keys(changes).length && !owner) return say('Nothing has changed.', true);
      ui.draft = f;
      return run(async () => {
        if (Object.keys(changes).length) await db.saveFields(V, changes);
        if (owner) await db.setOwner(V, owner);
        ui.edit = false;
        ui.draft = null;
      }, 'Lead saved.');
    }
    if (kind === 'service') {
      const chosen = new FormData(e.target).getAll('service').filter(Boolean);
      return run(async () => {
        await db.setService(V, chosen);
        const item = (ui.list || []).find(c => c.id === V.contact.id);
        if (item) item.services = chosen;
      }, 'Service saved: ' + (chosen.join(', ') || 'Not chosen') + '.');
    }
    const start = new Date(f.start);
    if (!(start > new Date())) return say('Choose a future date and time.', true);
    if (kind === 'book') return run(() => db.book(V, start, 0), 'Meeting booked.');
    // After a No-show the old record is kept and a new meeting carries the count on
    return run(() => m.outcome ? db.book(V, start, m.reschedules + 1) : db.move(V, m, start), 'Meeting rescheduled.');
  });

  (async () => {
    ui.id = db.live ? await db.start() : db.list(ui.user)[0].id;
    if (!ui.id) { // web tab: no record is open, so let the user pick
      ui.list = await db.leads();
      ui.rail = true;
      if (!ui.list.length) { $('#app').innerHTML = '<p class="mute">No leads found.</p>'; return; }
      ui.id = ui.list[0].id;
    }
    await reload();
    if (db.live && !ui.rail && V.service && V.service.field) { // lead page: count in the background
      try { ui.list = await db.leads(); } catch (e) { ui.listError = e.message || 'Unknown error'; }
      servicesPanel();
    }
  })().catch(fail);
})();
