// Lead widget screen
(function () {
  const C = window.BefreeConfig, R = window.BefreeRules;
  const inCrm = window.self !== window.top;
  const db = window.BefreeCrm; // live CRM data only
  const ui = { heats: null, id: null, user: C.users[0], form: null, msg: null, bad: false, busy: false, allTouches: false, list: null, rail: false, status: 'all', tab: 'activity', edit: false, draft: null, noteDraft: null, users: null, ai: null, aiClosed: null, dup: null, conv: null, convDraft: null };
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
  const block = (title, body, cls) => `<section class="${cls || ''}" data-card="${title.toLowerCase().replace(/\s+/g, '-')}"><h2>${icon(icons[title])}${title}</h2>${body}</section>`;

  // Each step is read from the record. Nothing is assumed.
  // The stages are Lead_Status values, matched without spaces, hyphens or capitals. Junk is not a stage.
  const STAGES = [['Not Contacted', 'Not Contacted'], ['Contacted', 'Contacted'], ['Pre-Qualified', 'Pre-Qualified'], ['Qualified', 'Qualified (Deal Created)']];
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
  const statusOptions = () => ((V.editable || []).find(f => f.key === 'status') || {}).options || [];
  const crmStatus = name => statusOptions().find(o => norm(o) === norm(name) || (name === 'Junk' && norm(o) === 'junklead'));
  function journey() {
    const now = norm(V.contact.status), at = STAGES.findIndex(s => norm(s[0]) === now), junk = /^junk/.test(now);
    const mayMove = R.can(V.user, 'edit') && !ui.busy;
    const step = (label, cls, mark, note, value) => {
      const tag = value && mayMove ? 'button' : 'span';
      return `<li class="${cls}"><${tag} class="step"${tag === 'button' ? ` data-status="${esc(value)}" title="Set Lead Status to ${esc(value)}"` : ''}><span class="dot">${mark}</span><b>${label}</b><small>${note}</small></${tag}></li>`;
    };
    const items = [step('Lead created', 'done', icon('tick'), V.created ? date(V.created) : 'Done')].concat(STAGES.map(([name, label], i) => {
      const done = i < at, current = i === at;
      return step(label, done ? 'done' : current ? 'next' : '', done ? icon('tick') : i + 2, current ? 'Current' : done ? 'Done' : 'Not yet', current ? null : crmStatus(name));
    }));
    const junkValue = crmStatus('Junk');
    const aside = junk ? '<span class="pill bad junk">Junk lead</span>' : mayMove && junkValue ? `<button class="quiet junk" data-status="${esc(junkValue)}">${icon('stop')}Mark as junk</button>` : '';
    const unknown = now && at < 0 && !junk ? `<p class="mute">Lead Status in CRM: ${esc(V.contact.status)}</p>` : '';
    ui.junk = aside;
    return `<ol class="journey ${junk ? 'junked' : ''}" aria-label="Lead status">${items.join('')}</ol>${unknown ? `<div class="status-note">${unknown}</div>` : ''}`;
  }
  function scale(value) {
    return '<div class="scale" aria-hidden="true">' + ['Cold', 'Warm', 'Hot'].map(x => `<span class="${x.toLowerCase()} ${x === value ? 'on' : ''}"><i></i>${x}</span>`).join('') + '</div>';
  }
  const sourceName = v => /^web\s*-?\s*(site\s*)?forms?$/i.test(String(v).trim()) ? 'Website' : v;
  const allLeads = () => ui.list;
  const hue = s => [...String(s)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7); // a steady colour per name

  // Only the services of this lead
  function servicesBlock() {
    if (!V.service) return '';
    const now = V.contact.services || [], card = (text, body) => `<section><div class="svc-head"><h2>${icon('tag')}Services</h2><p class="mute">${text}</p></div>${body}</section>`;
    if (!V.service.field && V.service.unread) return card('', `<p class="note bad">Could not read the Leads fields from CRM. ${esc(V.service.unread)}</p>`);
    if (!V.service.field && C.lead.service) return card('', `<p class="note bad">The field ${esc(C.lead.service)} was not found in Leads. Check its API name and that your profile can see it.</p>`);
    if (!V.service.field) return card('', '<p class="setup"><b>No service field in Leads yet</b>Add a pick list field labelled Service to the Leads module. The services then appear here.</p>');
    if (!now.length) return card('', '<p class="mute">No service chosen for this lead yet.</p>');
    return card(`${now.length} ${now.length === 1 ? 'service' : 'services'} on this lead`, '<ul class="ai-list good-list">' + now.map(x => `<li>${icon('tick')}<span>${esc(x)}</span></li>`).join('') + '</ul>');
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
    return `<section>${head}` + serviceForm() + (filled.length ? '<dl class="details">' + filled.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(k === 'Lead source' ? sourceName(v) : v)}</dd></div>`).join('') + '</dl>' : '<p class="mute">No details recorded.</p>') + '</section>';
  }
  function editForm() {
    const d = ui.draft || {};
    const val = f => f.key in d ? d[f.key] : f.value == null ? '' : String(f.value);
    const field = f => {
      const v = val(f), req = f.required ? 'required' : '';
      const input = f.type === 'select'
        ? `<select name="${f.key}" ${req}><option value="">Not set</option>${[...new Set(f.options.concat(v ? [v] : []))].map(x => `<option value="${esc(x)}" ${x === v ? 'selected' : ''}>${esc(f.key === 'source' ? sourceName(x) : x)}</option>`).join('')}</select>`
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
    const facts = [['Country', a.country || 'Not set'], ['Segment', seg.label], ['Owner', a.owner || 'Unassigned']]
      .concat(V.service && V.service.field ? [['Service', (c.services || []).join(', ') || 'Not chosen']] : [])
      .concat([['Lead status', c.status || c.lifecycle || 'Not set']]);
    return `<header class="band"><div class="avatar" aria-hidden="true">${esc(initials(c.name))}</div><div class="who"><h1>${esc(c.name)} ${R.isOptedOut(c) ? pill('Opted out', 'bad') : ''}</h1>
      <p>${c.title ? esc(c.title) + ', ' : ''}${!V.live || a.id ? link(C.modules.account, a.id, a.name) : esc(a.name)}</p></div></header>
      <dl class="facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
  }
  function temperatureBlock(t) {
    if (missing('touches') && V.isLead) return savedHeatBlock();
    if (missing('touches')) return block('Temperature', scale() + '<p class="mute">Waiting for engagement data</p>', 'waiting');
    if (V.problems.touches) return block('Temperature', problem('touches'));
    return block('Temperature', `<p class="big">${t.value}</p>${scale(t.value)}<p>${esc(t.reason)}</p>`, 'is-' + t.value.toLowerCase());
  }
  // Temperature worked out by the AI summary function, with the number of open leads in each
  function savedHeatBlock() {
    const h = heatNow(), d = h.details, n = ui.heats;
    const points = (list, cls, mark) => list.length ? `<ul class="ai-list ${cls}">` + list.map(x => `<li>${icon(mark)}<span>${esc(x)}</span></li>`).join('') + '</ul>' : '';
    const host = u => u.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
    const links = d ? d.sources.filter((x, i, all) => all.findIndex(y => host(y.url) === host(x.url)) === i).slice(0, 4) : [];
    let body = h.value ? `<p class="big">${h.value}</p>${scale(h.value)}` : scale();
    if (!h.value) body += '<p class="mute">Not checked yet. Click AI summary.</p>';
    if (d && d.judged) body += `<p>Score ${Number(d.score) || 0} of 100</p><p class="mute">Confidence: ${esc(d.confidence)}${d.at ? '. Updated ' + time(d.at) : ''}</p>`;
    if (d) body += points(d.good, 'good-list', 'tick') + points(d.bad, 'bad-list', 'alert');
    if (links.length) body += `<p class="mute">Sources: ${links.map(x => `<a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(host(x.url))}</a>`).join(', ')}</p>`;
    if (V.heatField && n) body += `<div class="heat-count"><p class="mute">All open leads</p>${['Hot', 'Warm', 'Cold'].map(x => `<span class="${x.toLowerCase()}"><b>${n[x]}</b>${x}</span>`).join('')}${n['Not enough data'] + n.none ? `<p class="mute">${[[n['Not enough data'], 'not enough data'], [n.none, 'not checked yet']].filter(x => x[0]).map(x => x.join(' ')).join(', ')}</p>` : ''}</div>`;
    if (V.heatField && d && d.saved === false) body += `<p class="setup"><b>Not saved in CRM</b>Check the pick list values of ${esc(C.ai.temperatureField)}.</p>`;
    if (!V.heatField) body += `<p class="setup"><b>Not saved in CRM</b>Create the field ${esc(C.ai.temperatureField)} in Leads to keep and count it.</p>`;
    return block('Temperature', body, h.value && h.value !== 'Not enough data' ? 'is-' + h.value.toLowerCase() : 'waiting');
  }
  // The newest saved details: from CRM, or from this browser
  function heatNow() {
    let local = '';
    try { local = localStorage.getItem(aiKey(V)); } catch (e) { /* browser storage is blocked */ }
    const d = [V.aiSaved, local].map(text => { try { const x = JSON.parse(text); return x.temperature ? { ...x.temperature, at: x.at } : null; } catch (e) { return null; } })
      .concat(V.heatDetails || []).filter(Boolean).sort((a, b) => new Date(b.at) - new Date(a.at))[0];
    return R.savedTemperature(V.heat, V.heatField && !V.heat ? null : d, V.contact.optedOut, V.contact.status);
  }
  // Redraws only this card, so typing elsewhere on the page is not lost
  function drawHeat() {
    const box = $('#heat');
    if (box && V && V.isLead && missing('touches')) box.innerHTML = savedHeatBlock();
  }
  // After an AI summary. If it failed, CRM may still have a new temperature, saved before OpenAI was asked.
  async function newHeat(v, raw) {
    if (!v.live || !v.isLead) return;
    if (raw && raw.temperature) Object.assign(v, { heat: raw.temperature.value, heatDetails: { ...raw.temperature, at: new Date().toISOString() } });
    else try { v.heat = await db.temperature(v); } catch (e) { return; }
    const item = (ui.list || ui.heatList || []).find(x => x.id === v.contact.id);
    if (item) item.temperature = v.heat;
    if (V !== v) return; // another lead was picked meanwhile
    drawHeat();
    countHeats();
  }
  async function countHeats() {
    if (!V || !V.live || !V.isLead || !V.heatField || !missing('touches')) return;
    if (!ui.list && !ui.heatList) {
      try { ui.heatList = await db.leads(); } catch (e) { return; } // the card works without the counts
    }
    const list = ui.list || ui.heatList, item = list.find(x => x.id === V.contact.id);
    if (item) Object.assign(item, { temperature: V.heat, status: V.contact.status, optedOut: V.contact.optedOut });
    ui.heats = R.countTemperatures(list);
    drawHeat();
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
    return block('Next task', `<p><b>${r.type}</b> ${pill('Expected, not created yet')}</p><p>${r.user ? esc(r.user.name) + ' (' + r.user.role + ')' : esc(V.account.owner || 'No owner set')}</p><p>${due(r.due)}</p>`);
  }
  function meetingBlock() {
    if (V.problems.meetings) return block('Meeting status', problem('meetings'));
    const m = R.latestMeeting(V), state = R.meetingState(m, V.now);
    if (!m) return block('Meeting status', '<p class="mute">No meeting booked.</p>');
    let h = `<p>${time(m.start)} ${m.selfBooked ? pill('Self-booked', 'hot') : ''}</p>`;
    if (state === 'upcoming') h += '<p>Upcoming</p>';
    if (V.isLead || !V.live) {
      const said = { accepted: ['Client accepted', 'good'], declined: ['Client declined', 'bad'], tentative: ['Client replied maybe', 'warm'] }[m.reply];
      h += `<p>${m.invited ? pill(said ? said[0] : 'Invitation sent', said ? said[1] : 'good') + (m.invitedOn ? ` <span class="mute">${date(m.invitedOn)}</span>` : '') : '<span class="mute">Invitation not sent</span>'}</p>`;
    }
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
    const out = R.isOptedOut(V.contact), ok = V.live && !V.isLead ? R.canRaiseDeal(V) : R.meetingAccepted(V), m = R.latestMeeting(V), state = R.meetingState(m, V.now);
    const pending = (state === 'upcoming' && m.reply !== 'declined') || (!missing('outcome') && (state === 'due' || state === 'overdue'));
    const b = [];
    const add = (action, attr, text, off, cls) => { if (R.can(V.user, action)) b.push(`<button ${attr} class="${cls || ''}" ${off || ui.busy ? 'disabled' : ''}>${text}</button>`); };
    add('book', 'data-show="book"', icon('calendar') + 'Book meeting', out || pending || !!V.problems.meetings);
    if (!V.live || V.isLead) add('ai', 'data-do="ai" id="aiButton"', icon('spark') + 'AI summary', !!ui.ai && ui.ai.state === 'loading', 'ai');
    add('email', 'data-do="email"', icon('mail') + 'Send email', out);
    add('call', 'data-do="call"', icon('phone') + 'Add call task', out);
    add('raise', 'data-do="raise"', icon('deal') + 'Convert to Deal', !ok, 'primary');
    if (V.live) b.push(`<button data-entity="${V.isLead ? 'Leads' : C.modules.contact}" data-record="${esc(V.contact.id)}">${icon('out')}Open in CRM</button>`);
    if (ui.junk) b.push(ui.junk);
    add('optOut', 'data-show="optout"', icon('stop') + 'Opt out', out, 'quiet');
    const notes = [];
    if (out) notes.push('Opted out: email, call tasks and meeting booking are blocked.');
    if (R.can(V.user, 'raise') && !ok) notes.push(V.live && !V.isLead || !C.acceptOnInvite ? 'Convert to Deal unlocks after an Accepted meeting.' : !m || state === 'done' ? 'Convert to Deal unlocks after you book a meeting and send the invitation.' : m.reply === 'declined' ? 'The client declined the invitation. Book a later meeting and send its invitation to unlock Convert to Deal.' : 'Click Send email to send the meeting invitation. Convert to Deal then unlocks.');
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
    const card = body => { box.innerHTML = `<section class="ai-card"><div class="ai-head"><h2>${icon('spark')}AI summary</h2>${a.at ? `<small>Generated ${time(a.at)}</small>` : ''}${tools}</div><div class="ai-body">${body}</div></section>`; };
    if (a.state === 'loading') return card('<div class="ai-wait"><p class="mute" role="status">Reading this lead and writing the summary</p><i></i><i></i><i></i></div>');
    if (a.state === 'error') return card(`<p class="note bad" role="alert">${esc(a.error)}</p>`);
    const s = a.data, seg = R.segment(V.account.staff);
    const facts = [['Company', V.account.name], ['Job title', V.contact.title], ['Country', V.account.country], ['Segment', seg.code ? seg.label : ''], ['Owner', V.account.owner], ['Service', (V.contact.services || []).join(', ')], [V.contact.lifecycle ? 'Lifecycle' : 'Status', V.contact.lifecycle || V.contact.status]]
      .concat((V.details || []).filter(d => ['Lead source', 'Industry', 'Rating', 'Employees'].includes(d[0])))
      .filter(x => x[1] !== null && x[1] !== undefined && x[1] !== '');
    const points = (list, cls, mark, none) => list.length ? `<ul class="ai-list ${cls}">` + list.map(x => `<li>${icon(mark)}<span>${esc(x)}</span></li>`).join('') + '</ul>' : `<p class="mute">${none}</p>`;
    card((a.old ? `<p class="note warm-note">This lead ${a.old === 'changed' ? 'has changed since' : 'was reloaded after'} the summary was made. Refresh to include any changes.</p>` : '') +
      `<div class="ai-result"><span class="verdict ${s.verdict}">${s.label}</span><span class="mute">Evidence: ${s.evidence}</span></div><p class="ai-text">${esc(s.summary)}</p>${s.changed ? `<p class="setup">${esc(s.changed)}</p>` : ''}` +
      `<div class="ai-cols"><div><h3>Lead data</h3><dl class="details">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(k === 'Lead source' ? sourceName(v) : v)}</dd></div>`).join('')}</dl></div>` +
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
    const same = [d.contacts.length ? names(C.modules.contact, d.contacts) : '', d.leads.length ? names('Leads', d.leads) : ''].filter(Boolean);
    if (same.length) out.push(line('warm-note', 'Possible duplicate.', `Same email as ${same.join(', ')}.`));
    if (d.accounts.length) out.push(line('warm-note', 'Company already exists.', `Account: ${names(C.modules.account, d.accounts)}. Use Convert to Deal to add this lead to it.`));
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
  const aiKey = v => 'befree-ai:' + v.user.id + ':' + v.contact.id;
  // Changes when something the summary is based on changes
  function aiMark(v) {
    const c = v.contact, text = JSON.stringify([c.name, c.title, v.account.name, c.status, c.lifecycle, !!c.optedOut, c.services, v.described,
      (v.notes || []).map(n => [n.id, n.text]), v.tasks.map(t => [t.id, t.open]), v.meetings.map(m => [m.id, m.start, m.outcome])]);
    let h = 0;
    for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
    return h;
  }
  async function keepAi(v, raw, at) {
    const { verdict, evidence, summary, for_deal, concerns, next_step, temperature } = raw;
    const text = JSON.stringify({ at: at.toISOString(), mark: aiMark(v), answer: { verdict, evidence, summary, for_deal, concerns, next_step }, ...(temperature ? { temperature } : {}) });
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
    newHeat(v, raw);
    const saving = job.state === 'done' ? keepAi(v, raw, job.at) : null; // kept even if another lead was picked meanwhile
    if (ui.ai === job && $('#ai')) {
      drawAi();
      $('#ai').scrollIntoView({ block: 'nearest' });
    }
    if (!saving) return;
    job.saved = await saving;
    if (ui.ai === job && $('#ai')) drawAi();
  }
  const dupData = () => ui.dup && ui.dup.id === ui.id ? ui.dup.data : null;
  // The same choices as CRM's own Convert Lead page
  function convertForm() {
    const c = ui.conv, d = ui.convDraft || {};
    const select = (name, label, list, blank) => `<label>${label}<select name="${name}">${blank === null ? '' : `<option value="">${blank}</option>`}${list.map(x => `<option value="${esc(x.id)}" ${x.id === d[name] ? 'selected' : ''}>${esc(x.text)}</option>`).join('')}</select></label>`;
    const named = list => list.map(x => ({ id: x.id, text: x.name }));
    const notes = [];
    if (c.leadCount) notes.push(`${c.leadCount === 1 ? '1 other lead has' : c.leadCount + ' other leads have'} this email. Only this lead is converted.`);
    if (c.failed.length) notes.push('Duplicates could not be checked in: ' + esc(c.failed.join(', ')) + '. Check in CRM that this account and contact do not exist yet.');
    if (!c.roles) notes.push('Contact roles could not be read. Set the role on the deal in CRM.');
    return `<form class="panel" data-form="convert" novalidate><p><b>Convert ${esc(V.contact.name)}</b></p>
      <div class="fields">${select('accountId', 'Account', c.accounts.map(a => ({ id: a.id, text: a.name + (a.by ? ' (' + a.by + ')' : '') })), 'Create new account')}
      ${select('contactId', 'Contact', named(c.contacts), 'Create new contact')}
      ${c.users ? select('ownerId', 'Owner of the new records', named(c.users), null) : ''}</div>
      <label class="tick"><input type="checkbox" name="createDeal" ${d.createDeal ? 'checked' : ''}> Create a new deal for this account</label>
      <div class="fields" id="convDeal" ${d.createDeal ? '' : 'hidden'}>
      <label>Amount<input type="number" name="amount" min="0" step="any" value="${esc(d.amount)}"></label>
      <label>Deal name *<input name="dealName" maxlength="120" value="${esc(d.dealName)}"></label>
      <label>Closing date *<input type="date" name="closingDate" value="${esc(d.closingDate)}"></label>
      <label>Stage *<select name="stage">${c.stages.map(s => `<option ${s === d.stage ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
      ${select('campaignId', 'Campaign source', named(c.campaigns), 'None')}
      ${c.roles ? select('contactRole', 'Contact role', named(c.roles), 'None') : ''}</div>
      <p class="mute">This cannot be undone. The lead leaves the Leads list. Existing account and contact details are not overwritten.</p>${notes.map(n => `<p class="mute">${n}</p>`).join('')}
      <button class="primary">Convert</button> <button type="button" data-do="cancel">Cancel</button></form>`;
  }
  async function openConvert() {
    if (ui.busy) return;
    const id = ui.id, v = V;
    let stages, dup, roles, campaigns, users;
    ui.busy = true;
    try {
      [stages, dup, roles, campaigns, users] = await Promise.all([db.dealStages(), dupData() || db.duplicates(v), db.contactRoles(), db.campaigns(),
        R.can(v.user, 'owner') ? db.users().catch(() => null) : null]);
    } catch (e) { ui.busy = false; return say(e.message || 'The conversion form could not be opened.', true); }
    ui.busy = false;
    if (id !== ui.id || v !== V) return;
    const choices = R.convertChoices(dup), owner = v.account.ownerId || v.account.owner;
    if (users && owner && !users.some(u => u.id === owner)) users = [{ id: owner, name: v.account.owner }].concat(users);
    keep();
    ui.conv = { ...choices, stages, roles, campaigns, users, failed: dup.failed, leadCount: dup.leads.length };
    ui.convDraft = {
      createDeal: 'on', dealName: (v.account.name === 'No company' ? v.contact.name : v.account.name).slice(0, 120), stage: stages[0], amount: '', closingDate: '',
      campaignId: '', contactRole: '', ownerId: owner || '', accountId: choices.accountId, contactId: choices.contactId
    };
    ui.form = 'convert';
    ui.msg = null;
    render(); // not say(): it would read an old form over the new draft
  }
  // Not run(): a converted lead cannot be loaded again
  async function convert(f) {
    if (ui.busy) return;
    if (!R.meetingAccepted(V)) return say('Send the meeting invitation first.', true);
    const err = R.checkConvert(f, ui.conv);
    if (err) return say(err, true);
    const v = V, id = ui.id;
    keep();
    ui.busy = true;
    document.querySelectorAll('#app button').forEach(b => { b.disabled = true; });
    let made;
    try { made = await db.convert(v, f); } catch (e) {
      ui.busy = false;
      return say('Not converted. ' + (e.message || 'Unknown error'), true);
    }
    if (ui.list) ui.list = ui.list.filter(c => c.id !== id);
    Object.assign(ui, { busy: false, id: null, form: null, msg: null, conv: null, convDraft: null, dup: null, ai: null, edit: false, draft: null, noteDraft: null });
    const open = (entity, recordId, text) => v.live && recordId ? `<button data-entity="${esc(entity)}" data-record="${esc(recordId)}">${icon('out')}${text}</button>` : '';
    const missed = f.createDeal && !made.dealId;
    const result = missed ? `${v.contact.name} is converted, but CRM did not return a deal. Check the account in CRM.`
      : f.createDeal ? `${v.contact.name} is converted. Deal "${f.dealName.trim()}" was created.` : `${v.contact.name} is converted to an account and contact, without a deal.`;
    const role = made.dealId && f.contactRole && !made.roleSet ? '<p class="note warm-note">The contact role could not be confirmed. Check Contact Roles on the deal in CRM.</p>' : '';
    $('#app').innerHTML = `<div class="hero"><div class="actions">${open(C.modules.deal, made.dealId, 'Open deal')}${open(C.modules.account, made.accountId, 'Open account')}${open(C.modules.contact, made.contactId, 'Open contact')}</div></div><p class="note ${missed ? 'bad' : 'good'}" role="status">${esc(result)}</p>${role}`;
    rail();
  }
  function form() {
    if (ui.form === 'convert' && ui.conv) return convertForm();
    if (ui.form === 'invite') {
      const m = R.latestMeeting(V);
      return `<div class="panel"><p><b>Send the meeting invitation${m.invited ? ' again' : ''}?</b></p><p>To ${esc(V.contact.name)} (${esc(V.contact.email)}), for the meeting on ${time(m.start)}.</p><p class="mute">CRM emails the client an invitation and adds them to the meeting.</p><button class="primary" data-do="invite">Send invitation</button> <button data-do="cancel">Cancel</button></div>`;
    }
    if (ui.form === 'optout') return `<div class="panel"><p>Opt out ${esc(V.contact.name)}? Emails and call tasks will be blocked.</p><button class="primary" data-do="optout">Yes, opt out</button> <button data-do="cancel">Cancel</button></div>`;
    if (ui.form === 'book' || ui.form === 'resched') return `<form class="panel" data-form="${ui.form}"><label>${ui.form === 'book' ? 'Meeting' : 'New meeting'} date and time<input type="datetime-local" name="start" required></label><button class="primary">${ui.form === 'book' ? 'Book meeting' : 'Reschedule'}</button> <button type="button" data-do="cancel">Cancel</button></form>`;
    return '';
  }

  function render() {
    rail();
    const t = R.temperature(V);
    $('#app').innerHTML = '<div class="hero' + (ui.shown === ui.id ? '' : ' enter') + '">' + header() + journey() + actions() + '</div>' + (ui.msg ? `<p class="note ${ui.bad ? 'bad' : 'good'}" role="status">${esc(ui.msg)}</p>` : '') +
      '<div id="dup" role="alert"></div><div id="ai" aria-live="polite"></div><div class="stats"><div id="heat">' + temperatureBlock(t) + '</div>' + (R.can(V.user, 'task') ? taskBlock(t) : '') + meetingBlock() + '</div>' +
      '<div class="cols"><div class="stack"><div>' + tabBar() + (V.notes && ui.tab === 'notes' ? notesBlock() : V.notes && ui.tab === 'tasks' ? tasksBlock() : touchBlock()) + '</div>' + servicesBlock() + '</div><div class="stack">' + detailBlock() + dealBlock() + '</div></div>';
    ui.shown = ui.id;
    drawDup();
    drawAi();
    countHeats();
  }
  // Lead list: the web tab, where no record is open
  function rail() {
    const list = allLeads();
    if (!list || (db.live && !ui.rail)) return;
    $('#rail').hidden = false;
    if (!$('#find')) $('#rail').innerHTML = '<div class="rail-top"><div class="rail-head"><p>Leads <span id="count"></span></p><button class="mini" data-do="refresh" aria-label="Refresh leads" title="Refresh leads">' + icon('sync') + '</button><button class="mini primary" id="newLead" data-do="newLead">' + icon('plus') + 'New</button></div><input id="find" type="search" placeholder="Search name or company" aria-label="Search name or company"><div class="filters"><select id="status" aria-label="Filter by status"></select><select data-filter="country" aria-label="Filter by country"></select><select data-filter="service" aria-label="Filter by service"></select><select data-filter="source" aria-label="Filter by lead source"></select></div></div><div id="leads"></div>';
    $('#newLead').hidden = !R.can(V.user, 'newLead');
    const states = [...new Set(list.map(c => c.status).filter(Boolean))].sort();
    if (ui.status !== 'all' && !states.includes(ui.status)) ui.status = 'all';
    if ($('#status').dataset.key !== states.join()) {
      $('#status').dataset.key = states.join();
      $('#status').innerHTML = '<option value="all">All statuses</option>' + states.map(s => `<option>${esc(s)}</option>`).join('');
    }
    $('#status').value = ui.status;
    const q = $('#find').value.trim().toLowerCase();
    const pick = ui.filters || (ui.filters = { country: '', service: '', source: '' });
    const valuesOf = (c, k) => k === 'service' ? c.services || [] : c[k] ? [c[k]] : [];
    document.querySelectorAll('#rail [data-filter]').forEach(box => {
      const k = box.dataset.filter, all = { country: 'All countries', service: 'All services', source: 'All lead sources' }[k];
      const found = [...new Set(list.flatMap(c => valuesOf(c, k)))].sort();
      if (!found.includes(pick[k])) pick[k] = '';
      if (box.dataset.key !== found.join()) { box.dataset.key = found.join(); box.innerHTML = `<option value="">${all}</option>` + found.map(x => `<option>${esc(x)}</option>`).join(''); }
      box.value = pick[k];
    });
    const shown = list.filter(c => (c.name + ' ' + c.sub).toLowerCase().includes(q) && (ui.status === 'all' || c.status === ui.status) && Object.keys(pick).every(k => !pick[k] || valuesOf(c, k).includes(pick[k])));
    const view = shown.slice(0, 200);
    const key = view.map(c => c.id + c.name + c.sub + c.status).join();
    $('#count').textContent = (shown.length === list.length ? '' : shown.length + ' of ') + (list.partial ? 'first ' : '') + list.length;
    if ($('#leads').dataset.key !== key) {
      $('#leads').dataset.key = key;
      $('#leads').innerHTML = view.map(c => `<button data-lead="${esc(c.id)}"><span class="face" style="--h:${hue(c.name)}" aria-hidden="true">${esc(initials(c.name))}</span><span class="txt"><b>${esc(c.name)}</b><small>${esc(c.sub)}</small></span>${c.status ? `<em class="st st-${norm(c.status)}">${esc(c.status)}</em>` : ''}</button>`).join('') || '<p class="mute">No leads match.</p>';
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
  async function run(work, msg, failed) {
    if (ui.busy) return;
    ui.busy = true;
    document.querySelectorAll('#app button').forEach(b => { b.disabled = true; });
    try { await work(); } catch (e) { return reload((failed || 'Not saved. ') + (e.message || 'Unknown error'), true).catch(fail); }
    await reload(msg).catch(fail);
  }
  // Keep what the user has typed when the screen is redrawn
  function keep() {
    const e = $('form[data-form=edit]'), n = $('form[data-form=note]');
    if (e) ui.draft = Object.fromEntries(new FormData(e));
    if (n) ui.noteDraft = Object.fromEntries(new FormData(n));
    const c = $('form[data-form=convert]');
    if (c) ui.convDraft = Object.fromEntries(new FormData(c));
  }
  function say(msg, bad) { keep(); ui.msg = msg; ui.bad = !!bad; render(); }
  function fail(e) { ui.busy = false; $('#app').classList.remove('loading'); $('#app').innerHTML = `<p class="note bad">Could not load the lead. ${esc(e && e.message || 'Unknown error')}</p>`; }

  document.addEventListener('change', e => {
    if (e.target.name === 'createDeal') $('#convDeal').hidden = !e.target.checked;
    if (e.target.id === 'status') { ui.status = e.target.value; rail(); }
    if (e.target.dataset.filter) { ui.filters[e.target.dataset.filter] = e.target.value; rail(); }
    if (e.target.name === 'outcome') $('#reason').hidden = e.target.value !== 'Rejected';
  });
  document.addEventListener('input', e => { if (e.target.id === 'find') rail(); });
  document.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    const x = b.dataset, m = R.latestMeeting(V || { meetings: [] });
    if (x.lead) {
      if (ui.busy || x.lead === ui.id) return;
      Object.assign(ui, { id: x.lead, form: null, conv: null, convDraft: null, allTouches: false, edit: false, draft: null, noteDraft: null, ai: null, aiClosed: null });
      rail();
      $('#app').classList.add('loading');
      return reload().catch(fail);
    }
    if (x.status) {
      // "Qualified (Deal Created)" is true only after conversion, with the same rule as the Convert to Deal button
      if (norm(x.status) === 'qualified') {
        if (!R.can(V.user, 'raise')) return say('You cannot convert leads.', true);
        return R.meetingAccepted(V) ? openConvert() : say('Convert to Deal unlocks after the meeting invitation is sent or accepted.', true);
      }
      return run(() => db.saveFields(V, { status: x.status }), 'Lead status saved: ' + x.status + '.');
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
        if (V.live && V.isLead && V.heatField && !V.heat) return summarize(); // no temperature yet: an older summary is not enough
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
      case 'newLead': return db.createLead();
      case 'refresh':
        // After a conversion no lead is open, so only the list is read again
        if (!ui.id) return Promise.resolve(db.live && db.leads()).then(list => { if (list) ui.list = list; rail(); }).catch(fail);
        return run(async () => { if (db.live) ui.list = await db.leads(); }, 'Leads refreshed.');
      case 'touches': ui.allTouches = !ui.allTouches; return say(null);
      case 'optout': return run(() => db.optOut(V), V.contact.name + ' is opted out.');
      case 'call': return run(() => db.addCall(V), 'Call task added.');
      case 'toCold': return run(() => db.toCold(V, m), 'Returned to Cold after ' + C.maxReschedules + ' reschedules.');
      case 'email':
        if (V.live && !V.isLead) return say('Use Send Email on this record in CRM.');
        if (!V.contact.email) return say('This lead has no email address. Add it in Lead details first.', true);
        if (!m || m.outcome) return say('Book a meeting first. Send email then sends its invitation.', true);
        if (R.toDate(m.start) <= new Date()) return say('The meeting on ' + time(m.start) + ' has already started. Book a new meeting first.', true);
        ui.form = 'invite';
        return say(null);
      case 'invite':
        b.textContent = 'Sending, please wait';
        return run(() => db.invite(V, m), 'Meeting invitation sent to ' + V.contact.email + '.', 'Invitation not confirmed. ');
      case 'raise': return V.live && !V.isLead ? say('The deal form will come with the Deal widget.') : openConvert();
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
    if (kind === 'convert') return convert(f);
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
    if (!inCrm) { $('#app').innerHTML = '<div class="outside"><b>Open this widget inside Zoho CRM</b><p>It shows live CRM data only. There is no sample data.</p></div>'; return; }
    ui.id = await db.start();
    if (!ui.id) { // web tab: no record is open, so let the user pick
      ui.list = await db.leads();
      ui.rail = true;
      if (!ui.list.length) { $('#app').innerHTML = '<p class="mute">No leads found.</p>'; return; }
      ui.id = ui.list[0].id;
    }
    await reload();
  })().catch(fail);
})();
