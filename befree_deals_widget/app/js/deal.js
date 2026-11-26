// Deal widget screen
(function () {
  const C = window.BefreeConfig, R = window.BefreeRules;
  const inCrm = window.self !== window.top && C.mode !== 'demo';
  const db = inCrm ? window.BefreeCrm : window.BefreeSample;
  const ui = { id: null, user: C.users[0], form: null, msg: null, bad: false, busy: false, list: null, rail: false, shown: null };
  let V = null;

  const $ = s => document.querySelector(s);
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const date = d => R.toDate(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const money = (n, symbol) => n === null || n === undefined || n === '' ? 'Not set' : (symbol === undefined ? V.deal.symbol : symbol) + Math.round(n).toLocaleString('en-GB');
  const pill = (text, cls) => `<span class="pill ${cls || ''}">${esc(text)}</span>`;
  const opts = (list, blank) => `<option value="">${blank}</option>` + list.map(x => `<option>${esc(x)}</option>`).join('');
  const link = (entity, id, text) => V.live && id ? `<button class="link" data-entity="${entity}" data-record="${esc(id)}">${esc(text)}</button>` : esc(text);
  const missing = key => !!V.missing[key];
  const shapes = {
    money: '<circle cx="12" cy="12" r="9"/><path d="M15 9.2a3 3 0 0 0-3-1.7c-1.7 0-3 .9-3 2.2 0 3 6 1.6 6 4.6 0 1.3-1.3 2.2-3 2.2a3 3 0 0 1-3-1.7M12 5.6v12.8"/>',
    calendar: '<rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
    arrow: '<path d="M4 12h15M13 6l6 6-6 6"/>',
    deal: '<rect x="3" y="7.5" width="18" height="12.5" rx="2"/><path d="M8.5 7.5V5a1.5 1.5 0 0 1 1.5-1.5h4A1.5 1.5 0 0 1 15.5 5v2.5M3 13h18"/>',
    stop: '<circle cx="12" cy="12" r="9"/><path d="m5.7 5.7 12.6 12.6"/>',
    shield: '<path d="M12 3l8 3v6c0 4.6-3.2 7.8-8 9-4.8-1.2-8-4.4-8-9V6z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
    check: '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="m8 12.2 2.8 2.8L16.2 9"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.2l3.4 2"/>',
    card: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 10h10M7 14h6"/>',
    horn: '<path d="M4 10v4h3l8 4.5v-13L7 10zM18.5 9.5a4 4 0 0 1 0 5"/>',
    tag: '<path d="M3.5 11.5V4.5a1 1 0 0 1 1-1h7L20.5 12.5l-8 8z"/><circle cx="8" cy="8" r="1.4"/>',
    tick: '<path d="m6 12.5 4 4 8-9"/>',
    cross: '<path d="m7 7 10 10M17 7 7 17"/>',
    dash: '<path d="M7 12h10"/>'
  };
  const icon = n => `<svg viewBox="0 0 24 24" aria-hidden="true">${shapes[n]}</svg>`;
  const initials = n => { const w = String(n).replace(/\(.*?\)/g, '').trim().split(/\s+/); return ((w[0] || '?')[0] + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase(); };
  const block = (title, ic, body, cls) => `<section class="${cls || ''}"><h2>${icon(ic)}${title}</h2>${body}</section>`;
  const days = n => Math.abs(n) === 1 ? '1 day' : Math.abs(n) + ' days';

  /* ---------- header and stage bar ---------- */
  function header() {
    const d = V.deal;
    const lost = R.isLost(d.stage) ? ' ' + pill(d.stage, 'bad') : R.isWon(d.stage) ? ' ' + pill(d.stage, 'good') : '';
    return `<header class="ticket"><div class="who"><h1>${esc(d.name)}${lost}</h1>
      <p>${d.accountName ? link('Accounts', d.accountId, d.accountName) : 'No account'}<span class="sep"></span>${d.contactName ? link('Contacts', d.contactId, d.contactName) : 'No contact'}</p></div>
      <dl class="stub"><div><dt>Amount</dt><dd>${money(R.amounts(d).total)}</dd></div></dl><dl class="strip"><div><dt>Owner</dt><dd>${esc(d.owner || 'Unassigned')}</dd></div>
      <div><dt>Service</dt><dd>${esc(d.services.join(', ') || 'Not chosen')}</dd></div><div><dt>Probability</dt><dd>${d.prob === null ? 'Not set' : d.prob + '%'}</dd></div></dl></header>`;
  }
  function stageBar() {
    const d = V.deal, path = R.path(V.stages), at = path.indexOf(d.stage), won = R.isWon(d.stage), lost = R.isLost(d.stage);
    const shown = path.map((s, i) => {
      const b = R.befreeStage(s), done = won ? i <= at : at >= 0 && i < at, now = !won && i === at;
      const note = now ? 'Current' + (d.prob === null ? '' : ', ' + d.prob + '%') : b ? b.prob + '%' : '';
      return `<li class="${done ? 'done' : now ? 'next' : ''}"><span class="dot">${done ? icon('tick') : i + 1}</span><b>${esc(s).split('/').join('/<wbr>')}</b><small>${note}</small></li>`;
    }).join('');
    const off = V.stagesKnown && at < 0 && !lost ? `<p class="hint">The stage "${esc(d.stage || 'None')}" is not in the CRM stage list.</p>` : '';
    return `<ol class="journey ${lost ? 'lost' : ''}" style="--n:${path.length}" aria-label="Deal stages">${shown}</ol>${off}`;
  }
  function actions() {
    const d = V.deal, edit = R.can(V.user, 'edit'), closed = R.isClosed(d.stage), next = R.nextStage(d.stage, V.stages), b = [], notes = [];
    if (edit && !closed) {
      const open = R.gate(d).filter(g => g.state !== 'done');
      const held = d.acceptance === 'Pending' || d.acceptance === 'Rejected' || d.approval === 'Pending' || d.approval === 'Rejected';
      if (next) b.push(`<button class="primary" data-do="move" ${V.stagesKnown ? '' : 'disabled'}>${icon('arrow')}Move to ${esc(next)}</button>`);
      b.push(`<button data-show="next">${icon('check')}Update next step</button>`, `<button data-show="close">${icon('calendar')}Change close date</button>`,
        `<button class="quiet" data-show="lost" ${V.stagesKnown && R.lostStages(V.stages).length ? '' : 'disabled'}>${icon('stop')}Close as lost</button>`);
      if (!V.stagesKnown) notes.push('Stages cannot be changed here because the CRM stage list could not be read. ' + esc(V.metaWhy || ''));
      else if (next && open.length) notes.push('To move on, complete: ' + esc(open.map(g => g.label).join('; ')) + '.');
      else if (next && held) notes.push('The deal is on hold. See Approvals.');
    }
    if (V.user.role === 'View only') notes.push(`View only. The CRM profile "${esc(V.user.profile || 'unknown')}" is not matched to a Befree role in config.js.`);
    if (V.user.role === 'Admin' && V.notFound.length) notes.push('These API names in config.js are not in your Deals module: ' + esc(V.notFound.join(', ')) + '.');
    if (V.user.role === 'Admin' && V.stagesKnown && R.missingStages(V.stages).length) notes.push('Befree stages missing from CRM: ' + esc(R.missingStages(V.stages).join(', ')) + '.');
    const befree = R.befreeStage(d.stage);
    if (V.user.role === 'Admin' && befree && d.prob !== null && befree.prob !== d.prob) notes.push(`CRM has ${d.prob}% for ${esc(d.stage)}, but Befree's rule is ${befree.prob}%.`);
    return `<div class="actions">${b.join('') || `<span class="mute">${closed ? 'This deal is closed.' : 'View only'}</span>`}</div>${notes.map(n => `<p class="hint">${n}</p>`).join('')}${form()}`;
  }
  function form() {
    const d = V.deal, cancel = ' <button type="button" data-do="cancel">Cancel</button>';
    if (ui.form === 'move') { const to = R.nextStage(d.stage, V.stages); return `<form class="panel" data-form="move"><label>Evidence for ${esc(to)}<input name="evidence" required maxlength="1000"></label><p class="mute">Saved as a note on the deal.</p><button class="primary">Move to ${esc(to)}</button>${cancel}</form>`; }
    if (ui.form === 'blocked') {
      const to = R.nextStage(d.stage, V.stages), open = R.gate(d).filter(g => g.state !== 'done'), svc = V.service.editable && !d.services.length && !R.servicesLocked(d);
      const why = R.checkMove(d, to, '-', V.stages);
      const people = d.roles && d.roles.length && open.some(g => /^Decision/.test(g.label) && g.state === 'missing') ? `<p class="mute">In Contact Roles now: ${esc(d.roles.map(r => r.name + ' (' + (r.role || 'no role') + ')').join(', '))}. One needs a Decision Maker or Influencer role.</p>` : '';
      return `<div class="panel"><p><b>Not ready for ${esc(to)}</b></p>${open.length ? `<ul class="gate">${open.map(g => `<li class="${g.state}"><span class="mark">${icon(g.state === 'unknown' ? 'dash' : 'cross')}</span><span><b>${g.label}</b><small>${esc(g.note)}</small></span></li>`).join('')}</ul>${people}` : `<p>${esc(why || '')}</p>`}
        ${svc ? '<button type="button" data-do="services">Choose services</button> ' : ''}${V.live ? `<button type="button" data-entity="Deals" data-record="${esc(d.id)}">Open deal in CRM</button> ` : ''}<button type="button" class="primary" data-do="move">Check again</button>${cancel}</div>`;
    }
    if (ui.form === 'next') {
      const to = V.stagesKnown && R.nextStage(d.stage, V.stages), path = R.path(V.stages), at = path.indexOf(d.stage);
      const text = other => `<label id="nextText" ${other ? '' : 'hidden'}>Your next step<input name="text" value="${esc(d.nextStep)}" maxlength="100"></label>`;
      if (!to) return `<form class="panel" data-form="next">${text(true)}<button class="primary">Save</button>${cancel}</form>`;
      const step = R.isWon(to) ? null : to, picked = step && R.sameStage(d.nextStep, step), other = !!d.nextStep && !picked;
      const note = (x, n) => n < at ? ' (done)' : n === at ? ' (current stage)' : R.isWon(x) ? ' (use the Move button)' : x === step ? '' : ' (later)';
      return `<form class="panel" data-form="next"><label>Next step<select name="pick" required><option value="">Choose the next stage</option>${path.map((x, n) => `<option value="s:${esc(x)}" ${x === step ? picked ? 'selected' : '' : 'disabled'}>${esc(x + note(x, n))}</option>`).join('')}<option value="other" ${other ? 'selected' : ''}>Other (type your own)</option></select></label>${text(other)}
        <p class="mute">${step ? `Choose ${esc(step)} to move the deal to that stage. Stages move one at a time.` : 'Use the Move button to close this deal as won.'}</p><button class="primary">Save</button>${cancel}</form>`;
    }
    if (ui.form === 'close') return `<form class="panel" data-form="close"><label>Close date<input type="date" name="date" value="${esc(d.closeDate || '')}" required></label><button class="primary">Save</button>${cancel}</form>`;
    if (ui.form === 'lost') {
      const ls = R.lostStages(V.stages);
      return `<form class="panel" data-form="lost">${ls.length > 1 ? `<label>Lost stage<select name="stage">${opts(ls, 'Choose')}</select></label>` : `<input type="hidden" name="stage" value="${esc(ls[0] || '')}">`}
        ${V.reasons.length ? `<label>Reason for loss<select name="reason">${opts(V.reasons, 'Choose')}</select></label><button class="primary">Close as lost</button>` : '<p class="mute">Reason For Loss has no values in CRM. Add them first.</p>'}${cancel}</form>`;
    }
    return '';
  }

  /* ---------- top cards ---------- */
  function amountBlock() {
    const d = V.deal, a = R.amounts(d), n = a.list.length;
    const from = a.used ? `<p>${a.set < n ? 'Amount set for ' + a.set + ' of ' + n + ' services' : n === 1 ? 'Amount of 1 service' : 'Total of ' + n + ' services'}</p>` : '';
    return block('Amount', 'money', `<p class="big">${money(a.total)}</p>${from}<p>Expected revenue ${money(a.expected)}</p><p class="mute">${d.prob === null ? 'Probability not set' : 'At ' + d.prob + '% probability'}</p>`);
  }
  function closeBlock() {
    const d = V.deal, closed = R.isClosed(d.stage), n = d.closeDate ? R.daysBetween(V.now, d.closeDate) : null, p = R.pushes(d);
    let h = `<p class="big">${d.closeDate ? date(d.closeDate) : 'Not set'}</p>`;
    if (n !== null && !closed) h += n < 0 ? `<p>${pill(days(n) + ' overdue', 'bad')}</p>` : `<p>${n === 0 ? 'Today' : 'In ' + days(n)}</p>`;
    h += p === null ? '<p class="mute">Push count not available</p>' : `<p class="mute">${p === 0 ? 'Not pushed' : p === 1 ? 'Pushed once' : 'Pushed ' + p + ' times'}</p>`;
    if (R.needsReview(d)) h += `<p>${pill('Sales Manager review needed', 'bad')}</p>`;
    return block('Close date', 'calendar', h, R.needsReview(d) || (n !== null && n < 0 && !closed) ? 'is-hot' : '');
  }
  function approvalBlock() {
    const d = V.deal, need = R.needsApproval(d), a = R.acceptance(d, V.now);
    let h = `<p>${need ? `Timeline over ${C.approvalMonths} months: <b>Sales Manager approval</b>` : 'Sales Manager approval not needed'}</p>`;
    if (need) h += `<p>${missing('approval') ? '<span class="mute">Approval status is not set up yet</span>' : pill(d.approval || 'Not recorded', d.approval === 'Approved' ? 'good' : d.approval === 'Rejected' ? 'bad' : 'warm')}</p>`;
    if (missing('acceptance')) h += '<p class="mute">BDM acceptance is not set up yet</p>';
    else if (a.state === 'Pending') {
      h += `<p>${pill('Waiting for BDM', 'warm')}</p><p class="mute">${a.overdue ? 'Time passed, automatic acceptance is due' : 'Decide by ' + date(a.due)}</p>`;
      if (R.can(V.user, 'decide')) h += `<form data-form="decide"><div class="row"><button class="primary" name="go" value="accept">Accept</button><button name="go" value="reject">Reject</button></div><label>Reject reason<select name="reason">${opts(C.rejectReasons, 'Only if rejecting')}</select></label></form>`;
    } else if (a.state === 'Accepted') h += `<p>${pill('Accepted by BDM', 'good')}</p>`;
    else if (a.state === 'Rejected') h += `<p>${pill('Rejected by BDM', 'bad')} ${esc(d.rejectReason)}</p>`;
    else h += '<p class="mute">BDM acceptance not needed</p>';
    return block('Approvals', 'shield', h);
  }

  /* ---------- main blocks ---------- */
  function gateBlock() {
    const g = R.gate(V.deal), n = g.filter(x => x.state === 'done').length, text = { done: 'Done', missing: 'Missing', unknown: 'Not available' };
    const note = (x, i) => i === 3 && x.state === 'done' ? 'Closing date ' + date(V.deal.timeline) : x.note;
    return `<section><div class="svc-head"><h2>${icon('shield')}Qualification</h2><p class="mute">${n} of 5 complete</p></div>
      <div class="meter" aria-hidden="true">${g.map(x => `<i class="${x.state}"></i>`).join('')}</div>
      <ol class="gate steps">${g.map((x, i) => `<li class="${x.state}"><span class="mark">${icon({ done: 'tick', missing: 'cross', unknown: 'dash' }[x.state])}</span><span><b>${x.label}</b><small>${esc(note(x, i))}</small></span><em>${text[x.state]}</em></li>`).join('')}</ol></section>`;
  }
  function historyBlock() {
    const d = V.deal;
    if (!d.history) return block('Stage history', 'clock', `<p class="mute">Stage history is not available. ${esc(V.problems.history || '')}</p>`);
    const all = d.history.slice().sort((a, b) => R.toDate(b.at) - R.toDate(a.at)).slice(0, 8);
    const cls = s => R.isWon(s) ? 'meet' : R.isLost(s) ? 'high' : '';
    const items = all.map(h => `<tr class="${cls(h.stage)}"><td><time>${date(h.at)}</time></td><td><b>${esc(h.stage)}</b></td><td>${h.closeDate ? 'Close ' + date(h.closeDate) : ''}</td><td class="mute">${esc(h.by)}</td></tr>`);
    if (d.created) items.push(`<tr><td><time>${date(d.created)}</time></td><td><b>Deal created</b></td><td></td><td class="mute">${esc(d.createdBy)}</td></tr>`);
    return block('Stage history', 'clock', items.length ? `<table class="ledger" aria-label="Stage history"><tbody>${items.join('')}</tbody></table>` : '<p class="mute">No stage changes yet.</p>');
  }
  const allDeals = () => db.live ? ui.list : db.list(ui.user);
  // Services asked for in the website enquiry, used only while the deal has none saved
  const requested = () => V.deal.services.length || !V.service.field || R.servicesLocked(V.deal) ? [] : R.requestedServices(V.deal.description, V.service.options);

  // Only the services of this deal
  function servicesBlock() {
    const now = V.deal.services, ask = requested(), list = now.length ? now : ask;
    const head = text => `<div class="svc-head"><h2>${icon('tag')}Services</h2><p class="mute">${text}</p></div>`;
    if (!V.service.field) return `<section>${head('')}<p class="note bad">The field ${esc(C.deal.service)} was not found in Deals. Check its API name and that your profile can see it.</p></section>`;
    if (!list.length) return `<section>${head('')}<p class="mute">No service chosen for this deal yet.</p></section>`;
    const price = Object.fromEntries(R.amounts(V.deal).list.map(x => [x.name, x.amount]));
    const row = x => now.length
      ? `<li class="done"><span class="mark">${icon('tick')}</span><span><b>${esc(x)}</b></span><em class="${price[x] === null ? 'unset' : 'price'}">${price[x] === null ? 'Amount not set' : money(price[x])}</em></li>`
      : `<li class="unknown"><span class="mark">${icon('dash')}</span><span><b>${esc(x)}</b></span><em>Requested, not saved</em></li>`;
    return `<section>${head(`${list.length} ${list.length === 1 ? 'service' : 'services'} ${now.length ? 'on this deal' : 'in the website enquiry'}`)}<ul class="gate">${list.map(row).join('')}</ul></section>`;
  }
  function serviceForm() {
    const s = V.service, now = V.deal.services, ask = requested(), off = R.servicesLocked(V.deal) ? 'disabled' : '', tick = now.length ? now : s.multi ? ask : ask.slice(0, 1);
    if (!s.field) return '';
    if (!s.editable || !R.can(V.user, 'edit')) return `<div class="svc-form"><p class="mute">${esc(s.label)}</p><p><b>${esc(now.join(', ') || 'Not chosen')}</b></p></div>`;
    const choices = [...new Set(s.options.concat(now))];
    const field = s.multi
      ? '<div class="checks">' + choices.map(x => `<label><input type="checkbox" name="service" value="${esc(x)}" ${tick.includes(x) ? 'checked' : ''} ${off}> ${esc(x)}</label>`).join('') + '</div>'
      : `<select name="service" aria-label="${esc(s.label)}" ${off}><option value="">Not chosen</option>${choices.map(x => `<option ${tick.includes(x) ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>`;
    return `<form class="svc-form" data-form="service"><p class="mute">${esc(s.label)}</p><div class="row">${field}<button ${off}>Save</button></div>${off ? `<p class="mute">Services are locked from ${C.lockServicesAt}%.</p>` : ''}${ask.length ? '<p class="mute">Ticked from the website enquiry. Save to add to this deal.</p>' : ''}</form>`;
  }
  function detailBlock() {
    const d = V.deal;
    const rows = [['Type', d.type], ['Lead source', d.leadSource], ['Campaign', d.campaign], ['Created by', d.createdBy], ['Created', d.created && date(d.created)], ['Updated', d.modified && date(d.modified)], ['Description', d.description]];
    if (R.isLost(d.stage)) rows.unshift(['Reason for loss', d.lostReason || 'Not recorded']);
    return block('Deal details', 'card', serviceForm() + '<dl class="details">' + rows.filter(r => r[1]).map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('') + '</dl>');
  }
  function peopleBlock() {
    const d = V.deal;
    if (!d.roles) return block('Contact roles', 'card', `<p class="mute">Contact roles are not available. ${esc(V.problems.roles || '')}</p>`);
    return block('Contact roles', 'card', d.roles.length ? '<ul class="people">' + d.roles.map(p => `<li><span class="face" aria-hidden="true">${esc(initials(p.name))}</span><span><b>${esc(p.name)}</b><small>${esc(p.role || (p.unread ? 'Role ID ' + p.unread : 'No role'))}</small></span></li>`).join('') + '</ul>' : '<p class="mute">No contact roles on this deal.</p>');
  }
  function influenceBlock() {
    const d = V.deal, x = R.influence(d);
    let h = `<p class="mute">Sourced by</p><p><b>${missing('sourcedBy') ? 'Not set up yet' : esc(d.sourcedBy || 'Not set')}</b></p>`;
    if (missing('touches')) h += '<p class="foot">Marketing influence needs the Touches module.</p>';
    else if (!x) h += `<p class="foot">Touches could not be read. ${esc(V.problems.touches || '')}</p>`;
    else {
      h += `<p class="tags">${x.sourced ? pill('Sourced', 'good') : ''} ${x.influenced ? pill('Influenced', 'good') : pill('Not influenced')}</p>`;
      h += x.list.length ? `<p>${x.list.length} ${x.list.length === 1 ? 'touch' : 'touches'} in the ${C.influencedDays} days before creation: ${esc(x.channels.join(', '))}</p>` : `<p class="mute">No touches in the ${C.influencedDays} days before creation.</p>`;
    }
    return block('Marketing influence', 'horn', h);
  }

  /* ---------- page ---------- */
  function render() {
    if (!db.live) {
      $('#demo').hidden = false;
      $('#demo').innerHTML = `<span>Sample data</span><label>View as <select id="user">${C.users.map(u => `<option value="${u.id}" ${u === ui.user ? 'selected' : ''}>${u.name} (${u.role}${u.country ? ', ' + u.country : ''})</option>`).join('')}</select></label>`;
    }
    rail();
    $('#app').innerHTML = `<div class="hero ${ui.shown === ui.id ? '' : 'enter'}">` + header() + stageBar() + actions() + '</div>' + (ui.msg ? `<p class="note ${ui.bad ? 'bad' : 'good'}" role="status">${esc(ui.msg)}</p>` : '') +
      '<div class="stats">' + amountBlock() + closeBlock() + approvalBlock() + '</div>' +
      '<div class="cols"><div class="stack">' + gateBlock() + historyBlock() + servicesBlock() + '</div><div class="stack">' + detailBlock() + peopleBlock() + influenceBlock() + '</div></div>';
    ui.shown = ui.id;
  }
  function rail() {
    const list = allDeals();
    if (!list || (db.live && !ui.rail)) return;
    $('#rail').hidden = false;
    if (!$('#find')) $('#rail').innerHTML = '<div class="rail-top"><p>Deals <span id="count"></span></p><input id="find" type="search" placeholder="Search deal or account" aria-label="Search deal or account"></div><div id="items"></div>';
    const q = $('#find').value.trim().toLowerCase();
    const shown = list.filter(c => (c.name + ' ' + c.sub).toLowerCase().includes(q)), view = shown.slice(0, 200);
    const key = view.map(c => c.id + c.sub).join();
    $('#count').textContent = (shown.length === list.length ? '' : shown.length + ' of ') + (list.partial ? 'first ' : '') + list.length;
    if ($('#items').dataset.key !== key) {
      $('#items').dataset.key = key;
      $('#items').innerHTML = view.map(c => `<button data-deal="${esc(c.id)}" data-sub="${esc(c.sub)}"><span class="face" aria-hidden="true">${esc(initials(c.name))}</span><span class="txt"><b>${esc(c.name)}</b><small>${esc(c.sub)}</small></span></button>`).join('') || '<p class="mute">No deals match.</p>';
      if (shown.length > view.length) $('#items').insertAdjacentHTML('beforeend', '<p class="mute">Showing 200. Search to find others.</p>');
    }
    $('#items').querySelectorAll('button').forEach(b => b.setAttribute('aria-current', b.dataset.deal === ui.id ? 'true' : 'false'));
  }
  async function reload(msg, bad) {
    const id = ui.id, v = await db.load(id, ui.user);
    if (id !== ui.id) { ui.busy = false; return; } // another deal was picked meanwhile
    V = v;
    Object.assign(ui, { msg: msg || null, bad: !!bad, form: null, busy: false });
    const item = (ui.list || []).find(c => c.id === id); // keep the list in step with the saved deal
    if (item) Object.assign(item, { sub: [V.deal.accountName, V.deal.stage].filter(Boolean).join(', ') });
    $('#app').classList.remove('loading');
    render();
  }
  async function run(work, msg) {
    if (ui.busy) return;
    ui.busy = true;
    document.querySelectorAll('#app button').forEach(b => { b.disabled = true; });
    let out;
    try { out = await work(); } catch (e) { return reload('Not saved. ' + (e && e.message || 'Unknown error'), true).catch(fail); }
    await reload(typeof out === 'string' ? out : msg).catch(fail);
  }
  // Reads the deal again first, so what was completed in CRM meanwhile counts
  async function startMove() {
    if (ui.busy) return;
    ui.busy = true;
    document.querySelectorAll('#app button').forEach(b => { b.disabled = true; });
    try { await reload(); } catch (e) { return fail(e); }
    const to = R.nextStage(V.deal.stage, V.stages);
    if (!to || !V.stagesKnown) return;
    ui.form = R.checkMove(V.deal, to, '-', V.stages) ? 'blocked' : 'move';
    say(null);
  }
  function say(msg, bad) { ui.msg = msg; ui.bad = !!bad; render(); }
  function fail(e) { ui.busy = false; $('#app').classList.remove('loading'); $('#app').innerHTML = `<p class="note bad">Could not load the deal. ${esc(e && (e.message || e.code) || 'Unknown error')}</p>`; }

  document.addEventListener('change', e => {
    if (e.target.name === 'pick') {
      $('#nextText').hidden = e.target.value !== 'other';
      if (e.target.value === 'other') $('#nextText input').focus();
    }
    if (e.target.id !== 'user') return;
    ui.user = C.users.find(u => u.id === e.target.value);
    const list = db.list(ui.user);
    if (!list.some(c => c.id === ui.id)) ui.id = list.length ? list[0].id : null;
    if (ui.id) return reload().catch(fail);
    rail();
    $('#app').innerHTML = '<p class="mute">No deals for this user.</p>';
  });
  document.addEventListener('input', e => { if (e.target.id === 'find') rail(); });
  document.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    const x = b.dataset;
    if (x.deal) {
      if (ui.busy || x.deal === ui.id) return;
      ui.id = x.deal;
      rail();
      $('#app').classList.add('loading');
      return reload().catch(fail);
    }
    if (x.record) return db.open(x.entity, x.record);
    if (x.show) { ui.form = x.show; return say(null); }
    if (x.do === 'move') return startMove();
    if (x.do === 'services') {
      const f = $('form[data-form=service]');
      if (f) { f.scrollIntoView({ block: 'center', behavior: 'smooth' }); f.querySelector('input, select').focus({ preventScroll: true }); }
      return;
    }
    if (x.do === 'cancel') { ui.form = null; return say(null); }
  });
  document.addEventListener('submit', e => {
    e.preventDefault();
    const data = new FormData(e.target), f = Object.fromEntries(data), kind = e.target.dataset.form, d = V.deal;
    if (kind === 'service') {
      if (R.servicesLocked(d)) return;
      const chosen = data.getAll('service').filter(Boolean);
      return run(() => db.setService(V, chosen), 'Service saved: ' + (chosen.join(', ') || 'Not chosen') + '.');
    }
    if (kind === 'move') {
      const to = R.nextStage(d.stage, V.stages), err = R.checkMove(d, to, f.evidence, V.stages);
      return err ? say(err, true) : run(() => db.move(V, to, f.evidence.trim()), 'Moved to ' + to + '.');
    }
    if (kind === 'lost') {
      const err = R.checkLost(d, f.stage, f.reason, V.stages, V.reasons);
      return err ? say(err, true) : run(() => db.lose(V, f.stage, f.reason), 'Deal closed as lost: ' + f.reason + '.');
    }
    if (kind === 'next') {
      const text = (f.pick && f.pick.startsWith('s:') ? f.pick.slice(2) : f.text || '').trim();
      return run(async () => {
        const v = await db.load(ui.id, ui.user), step = v.stagesKnown ? R.nextStepMove(v.deal, text, v.stages) : null;
        await db.nextStep(v, text, step && step.to);
        return 'Next step saved.' + (!step ? '' : step.to ? ' Moved to ' + step.to + '.' : ' The stage did not change. ' + step.why);
      });
    }
    if (kind === 'close') {
      if (f.date === d.closeDate) return say('The close date is unchanged.', true);
      return run(() => db.closeDate(V, f.date), 'Close date saved.');
    }
    if (kind === 'decide') {
      const accept = e.submitter && e.submitter.value === 'accept';
      if (!accept && !f.reason) return say('A rejection needs a reason.', true);
      return run(() => db.decide(V, accept, f.reason), accept ? 'Deal accepted.' : 'Deal rejected: ' + f.reason + '.');
    }
  });

  (async () => {
    ui.id = db.live ? await db.start() : db.list(ui.user)[0].id;
    if (!ui.id) { // web tab: no record is open, so let the user pick
      ui.list = await db.deals();
      ui.rail = true;
      if (!ui.list.length) { $('#app').innerHTML = '<p class="mute">No deals found.</p>'; return; }
      ui.id = ui.list[0].id;
    }
    await reload();
  })().catch(fail);
})();
