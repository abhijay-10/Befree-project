// Reads and writes Zoho CRM.
(function (root) {
  const C = root.BefreeConfig, F = C.fields, M = C.modules;
  const id = v => (v && typeof v === 'object' ? v.id : v) || null;
  const name = v => (v && typeof v === 'object' ? v.name : v) || '';
  const countries = { AUSTRALIA: 'AU', 'UNITED KINGDOM': 'UK', GB: 'UK', 'UNITED STATES': 'US', 'UNITED STATES OF AMERICA': 'US', USA: 'US' };
  const country = v => countries[String(v || '').toUpperCase()] || v || '';
  const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  function stamp(d) { // ISO date-time with the user's own UTC offset
    const o = -d.getTimezoneOffset(), p = n => String(Math.floor(Math.abs(n))).padStart(2, '0');
    return ymd(d) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':00' + (o < 0 ? '-' : '+') + p(o / 60) + ':' + p(o % 60);
  }
  const why = e => (e && (e.message || (e.data && e.data[0] && e.data[0].message) || e.code)) || 'Unknown error';

  async function one(entity, recordId) {
    const r = await ZOHO.CRM.API.getRecord({ Entity: entity, RecordID: recordId });
    if (!r || !r.data || !r.data[0]) throw new Error(entity + ' record could not be read. ' + why(r));
    return r.data[0];
  }
  async function rows(module, fields, where, orderBy) {
    const all = [];
    for (let offset = 0; offset < 2000; offset += 200) {
      const r = await ZOHO.CRM.API.coql({ select_query: `select ${['id', ...fields].join(', ')} from ${module} where ${where} order by ${orderBy} limit ${offset}, 200` });
      if (r && r.data) all.push(...r.data);
      else if (r && (r.code || r.status === 'error')) throw new Error(why(r));
      if (!r || !r.info || !r.info.more_records) break;
    }
    return all;
  }
  // Related records of a lead. "optional" lists may not exist in every CRM.
  async function related(leadId, list, optional) {
    try {
      const r = await ZOHO.CRM.API.getRelatedRecords({ Entity: 'Leads', RecordID: leadId, RelatedList: list, page: 1, per_page: 200 });
      if (r && r.data) return r.data;
      if (r && r.status !== 204 && r.statusText !== 'nocontent' && (r.code || r.status === 'error')) throw new Error(why(r));
      return [];
    } catch (e) {
      if (optional) return [];
      throw e;
    }
  }
  const quote = v => "'" + String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
  const person = r => [r[C.lead.firstName], r[C.lead.lastName]].filter(Boolean).join(' ') || 'No name';
  const only = data => { delete data['']; return data; }; // drops fields that are not set up
  let entity = 'Leads';
  const many = v => (Array.isArray(v) ? v : [v]).map(x => name(x)).filter(x => x && x !== '-None-');

  // Reads the real Leads fields from CRM, so API names are never guessed
  let metaJob = null;
  const meta = () => metaJob || (metaJob = (async () => {
    const none = { field: C.lead.service, label: 'Service', multi: false, editable: false, options: [], notFound: [] };
    let fields = [];
    try {
      const r = await ZOHO.CRM.META.getFields({ Entity: 'Leads' });
      fields = (r && r.fields) || [];
    } catch (e) { return { ...none, unread: why(e) }; }
    if (!fields.length) return { ...none, unread: 'No fields were returned' };
    const has = new Set(fields.map(f => f.api_name));
    const skip = ['touchModule', 'touchLookup', 'selfBooked', 'outcome', 'reason', 'reschedules', 'taskType'];
    const notFound = Object.keys(C.lead).filter(k => C.lead[k] && !skip.includes(k) && !has.has(C.lead[k])).map(k => C.lead[k]);
    const f = fields.find(x => C.lead.service ? x.api_name === C.lead.service : /^services?(\s*lines?)?$/i.test(String(x.field_label || '').trim()));
    if (!f) return { ...none, field: '', notFound, fields };
    return {
      fields,
      field: f.api_name, label: f.field_label, notFound,
      multi: f.data_type === 'multiselectpicklist',
      editable: f.data_type === 'picklist' || f.data_type === 'multiselectpicklist',
      options: (f.pick_list_values || []).map(p => p.actual_value || p.display_value).filter(x => x && x !== '-None-')
    };
  })());

  // Fields the user may edit in the widget. Types and choices come from CRM.
  const editKeys = ['firstName', 'lastName', 'company', 'title', 'status', 'email', 'phone', 'mobile', 'source', 'industry', 'rating', 'staff', 'country', 'city', 'website'];
  function editable(fields, record) {
    if (!fields) return null;
    return editKeys.map(key => {
      const f = fields.find(x => x.api_name === C.lead[key]);
      if (!f || f.read_only === true || f.field_read_only === true) return null;
      const type = f.data_type === 'picklist' ? 'select' : f.data_type === 'email' ? 'email' : ['integer', 'bigint', 'double', 'currency'].includes(f.data_type) ? 'number' : 'text';
      return {
        key, type, label: f.field_label || key, value: record[f.api_name], required: ['lastName', 'company'].includes(key) || f.system_mandatory === true,
        options: type === 'select' ? (f.pick_list_values || []).filter(p => p.type !== 'unused').map(p => p.actual_value || p.display_value).filter(x => x && x !== '-None-') : null
      };
    }).filter(Boolean);
  }

  // Website form records count as Website: a web form Lead Source, or the enquiry text in Description (same rule as the Admin widget)
  const webSource = (source, description) => /^web\s*-?\s*(site\s*)?forms?$/i.test(String(source || '').trim()) || (/services?\s+requested\s*(?:\(\d+\))?\s*:/i.test(description || '') && !/^(email|webinars?|events?|linkedin|google|social)/i.test(source || '')) ? 'Website' : source || '';
  // The lead among the participants of a meeting
  const guestOf = (meeting, leadId, email) => (meeting.Participants || []).find(p => String(id(p.participant)) === String(leadId) ||
    (email && String(p.Email || p.participant || '').toLowerCase() === String(email).toLowerCase())) || null;
  const isInvited = guest => !!guest && guest.invited === true;

  async function loadLead(leadId) {
    const L = C.lead, T = F.touch, problems = {};
    const service = await meta();
    const safe = (key, p) => p.catch(e => { problems[key] = why(e); return []; });
    const c = await one('Leads', leadId);
    const hasTouches = !!(L.touchModule && L.touchLookup);
    const self = [{ id: c.id, name: person(c) }];
    // Leads have no account lookup, so colleagues are leads with the same Company text
    const colleagues = () => rows('Leads', [L.firstName, L.lastName], `${L.company} = ${quote(c[L.company])}`, 'id asc').then(x => x.map(r => ({ id: r.id, name: person(r) })));
    const [me, team, tasks, next, past, notes] = await Promise.all([
      ZOHO.CRM.CONFIG.getCurrentUser(),
      hasTouches && c[L.company] ? safe('contacts', colleagues()) : self,
      safe('tasks', related(leadId, 'Tasks')),
      safe('meetings', related(leadId, 'Events')),
      related(leadId, 'Events_History', true),
      safe('notes', related(leadId, 'Notes'))
    ]);
    const people = team.length ? team : self;
    const ids = people.slice(0, 50).map(p => "'" + p.id + "'").join(', ');
    const touches = hasTouches ? await safe('touches', rows(L.touchModule, [L.touchLookup, T.type, T.channel, T.date], `${L.touchLookup} in (${ids})`, T.date + ' desc')) : [];
    const u = (me && me.users && me.users[0]) || {};
    const deal = c[L.convertedDeal];
    const seen = new Set();
    const meetings = next.concat(past).filter(r => r.Start_DateTime && !seen.has(r.id) && seen.add(r.id)).map(r => ({
      id: r.id, start: r.Start_DateTime, bookedOn: r.Created_Time || r.Start_DateTime, selfBooked: !!(L.selfBooked && r[L.selfBooked]),
      outcome: (L.outcome && r[L.outcome]) || '', reason: (L.reason && r[L.reason]) || '', reschedules: (L.reschedules && r[L.reschedules]) || 0
    }));
    // The invitation of the latest meeting: from its participants, with the note as the record of when it was sent
    const latest = root.BefreeRules.latestMeeting({ meetings });
    if (latest) {
      const sent = notes.filter(n => n.Note_Title === C.inviteNote && new Date(n.Created_Time) >= new Date(latest.bookedOn)).sort((a, b) => new Date(b.Created_Time) - new Date(a.Created_Time))[0];
      const guest = await one(M.meeting, latest.id).then(r => guestOf(r, c.id, c[L.email]), () => null);
      Object.assign(latest, { invited: !!sent || isInvited(guest), invitedOn: sent ? sent.Created_Time : null, reply: guest ? String(guest.status || '').toLowerCase() : '' });
    }
    return {
      live: true, isLead: true, now: new Date(), problems, service, created: c.Created_Time, modified: c.Modified_Time, described: c.Description || '', website: c[L.website] || '',
      aiField: !!(service.fields && service.fields.some(f => f.api_name === C.ai.savedField)), aiSaved: c[C.ai.savedField] || '',
      heatField: !!(service.fields && service.fields.some(f => f.api_name === C.ai.temperatureField)), heat: c[C.ai.temperatureField] || '',
      editable: editable(service.fields, c),
      notes: notes.map(n => ({ id: n.id, title: n.Note_Title || '', text: n.Note_Content || '', at: n.Created_Time || n.Modified_Time, by: name(n.Created_By) || name(n.Owner) })).sort((a, b) => new Date(b.at) - new Date(a.at)),
      details: [
        ['Email', c[L.email]], ['Phone', c[L.phone]], ['Mobile', c[L.mobile]], ['Lead source', webSource(c[L.source], c.Description)], ['Industry', c[L.industry]],
        ['Rating', c[L.rating]], ['Employees', c[L.staff]], ['City', c[L.city]], ['Website', c[L.website]]
      ],
      missing: { touches: !hasTouches, outcome: !L.outcome, reschedules: !L.reschedules || !L.backToColdOn || !L.outcome },
      user: { id: u.id, name: u.id, label: u.full_name || '', role: C.profiles[u.profile && u.profile.name] || 'View only', profile: u.profile && u.profile.name, country: null },
      contact: {
        id: c.id, name: person(c), services: service.field ? many(c[service.field]) : [], title: c[L.title], email: c[L.email], lifecycle: L.lifecycle ? c[L.lifecycle] || '' : '', status: c[L.status] || '',
        optedOut: !!c[L.optedOut], backToColdOn: (L.backToColdOn && c[L.backToColdOn]) || null
      },
      account: { id: null, name: c[L.company] || 'No company', country: country(c[L.country]), staff: c[L.staff], owner: name(c[L.owner]), ownerId: id(c[L.owner]) },
      contacts: people,
      touches: touches.map(r => ({ id: r.id, contactId: id(r[L.touchLookup]), contactName: (people.find(p => p.id === id(r[L.touchLookup])) || {}).name || '', type: r[T.type], channel: r[T.channel], date: r[T.date] })),
      tasks: tasks.map(r => ({ id: r.id, type: (L.taskType && r[L.taskType]) || r.Subject, owner: name(r.Owner), due: r.Due_Date, open: !C.closedTaskStatus.includes(r.Status) })),
      meetings,
      deals: deal ? [{ id: id(deal), name: name(deal), stage: '', raisedBy: u.id }] : []
    };
  }

  async function saved(call) {
    const r = await call;
    const x = r && r.data && r.data[0];
    if (!x || x.code !== 'SUCCESS') throw new Error(why(x || r));
  }
  const update = (entity, data) => saved(ZOHO.CRM.API.updateRecord({ Entity: entity, APIData: data, Trigger: ['workflow'] }));
  const insert = (entity, data) => saved(ZOHO.CRM.API.insertRecord({ Entity: entity, APIData: data, Trigger: ['workflow'] }));

  const about = v => v.isLead ? { What_Id: v.contact.id, $se_module: 'Leads' } : ({ Who_Id: v.contact.id, What_Id: v.account.id, $se_module: M.account });

  root.BefreeCrm = {
    live: true,
    async load(contactId) {
      if (entity === 'Leads') return loadLead(contactId);
      const c = await one(M.contact, contactId);
      const accountId = id(c[F.contact.account]);
      if (!accountId) throw new Error('This contact has no account. Link it to an account first.');
      const problems = {}; // one missing module must not break the whole widget
      const safe = (key, p) => p.catch(e => { problems[key] = why(e); return []; });
      const f = F;
      const [a, me, team, touches, tasks, meetings, deals] = await Promise.all([
        one(M.account, accountId),
        ZOHO.CRM.CONFIG.getCurrentUser(),
        safe('contacts', rows(M.contact, [f.contact.name], `${f.contact.account} = '${accountId}'`, 'id asc')),
        safe('touches', rows(M.touch, [f.touch.contact, f.touch.contact + '.' + f.contact.name, f.touch.type, f.touch.channel, f.touch.date], `${f.touch.account} = '${accountId}'`, f.touch.date + ' desc')),
        safe('tasks', rows(M.task, [f.task.subject, f.task.type, f.task.owner + '.last_name', f.task.due, f.task.status], `${f.task.contact} = '${contactId}'`, f.task.due + ' asc')),
        safe('meetings', rows(M.meeting, [f.meeting.start, 'Created_Time', f.meeting.selfBooked, f.meeting.outcome, f.meeting.reason, f.meeting.reschedules], `${f.meeting.contact} = '${contactId}'`, f.meeting.start + ' desc')),
        safe('deals', rows(M.deal, [f.deal.name, f.deal.stage, f.deal.createdBy], `${f.deal.account} = '${accountId}'`, 'id desc'))
      ]);
      const u = (me && me.users && me.users[0]) || {};
      return {
        live: true, now: new Date(), problems, created: c.Created_Time, modified: c.Modified_Time,
        user: { id: u.id, name: u.id, label: u.full_name || '', role: C.profiles[u.profile && u.profile.name] || 'View only', country: null },
        contact: {
          id: c.id, name: c[f.contact.name], title: c[f.contact.title], email: c[f.contact.email], lifecycle: c[f.contact.lifecycle] || '',
          optedOut: !!c[f.contact.optedOut], backToColdOn: c[f.contact.backToColdOn] || null
        },
        account: { id: a.id, name: a[f.account.name], country: country(a[f.account.country]), staff: a[f.account.staff], owner: name(a[f.account.owner]) },
        contacts: team.map(r => ({ id: r.id, name: r[f.contact.name] })),
        touches: touches.map(r => ({ id: r.id, contactId: id(r[f.touch.contact]), contactName: r[f.touch.contact + '.' + f.contact.name] || name(r[f.touch.contact]), type: r[f.touch.type], channel: r[f.touch.channel], date: r[f.touch.date] })),
        tasks: tasks.map(r => ({ id: r.id, type: r[f.task.type] || r[f.task.subject], owner: r[f.task.owner + '.last_name'] || '', due: r[f.task.due], open: !C.closedTaskStatus.includes(r[f.task.status]) })),
        meetings: meetings.map(r => ({ id: r.id, start: r[f.meeting.start], bookedOn: r.Created_Time, selfBooked: !!r[f.meeting.selfBooked], outcome: r[f.meeting.outcome] || '', reason: r[f.meeting.reason] || '', reschedules: r[f.meeting.reschedules] || 0 })),
        // Deals are matched to the signed-in user by user id, not by name
        deals: deals.map(r => ({ id: r.id, name: r[f.deal.name], stage: r[f.deal.stage], raisedBy: id(r[f.deal.createdBy]) }))
      };
    },
    // For the web tab, where no record is open
    async leads() {
      const service = await meta(), all = [];
      for (let page = 1; page <= 10; page++) { // CRM allows 2,000 records this way
        const r = await ZOHO.CRM.API.getAllRecords({ Entity: 'Leads', sort_order: 'desc', per_page: 200, page });
        if (r && r.data) all.push(...r.data);
        else if (r && r.status !== 204 && r.statusText !== 'nocontent' && (r.code || r.status === 'error')) throw new Error('Leads could not be read. ' + why(r));
        if (!r || !r.info || !r.info.more_records) break;
        if (page === 10) all.partial = true;
      }
      const list = all.map(x => ({ id: x.id, name: person(x), sub: x[C.lead.company] || '', status: x[C.lead.status] || '', services: service.field ? many(x[service.field]) : [], country: country(x[C.lead.country]), source: webSource(x[C.lead.source], x.Description), temperature: x[C.ai.temperatureField] || '', optedOut: !!x[C.lead.optedOut] }));
      list.partial = !!all.partial;
      return list;
    },
    async users() {
      const all = [];
      for (let page = 1; page <= 10; page++) {
        const r = await ZOHO.CRM.API.getAllUsers({ Type: 'ActiveUsers', page, per_page: 200 });
        if (r && r.users) all.push(...r.users);
        else if (r && (r.code || r.status === 'error')) throw new Error(why(r));
        if (!r || !r.info || !r.info.more_records) break;
      }
      return all.map(u => ({ id: u.id, name: u.full_name || u.email || u.id }));
    },
    setOwner: (v, userId) => update('Leads', { id: v.contact.id, [C.lead.owner]: { id: userId } }),
    saveFields: (v, changes) => update('Leads', Object.entries(changes).reduce((d, [key, value]) => { d[C.lead[key]] = value; return d; }, { id: v.contact.id })),
    addNote: (v, title, text) => saved(ZOHO.CRM.API.addNotes({ Entity: 'Leads', RecordID: v.contact.id, Title: title, Content: text })),
    addTask: (v, subject, due) => insert(M.task, { ...about(v), [F.task.subject]: subject, [F.task.due]: due, [F.task.status]: 'Not Started' }),
    closeTask: (v, taskId) => update(M.task, { id: taskId, [F.task.status]: 'Completed' }),
    createLead: () => ZOHO.CRM.UI.Record.create({ Entity: 'Leads' }),
    setService: (v, list) => update('Leads', { id: v.contact.id, [v.service.field]: v.service.multi ? list : list[0] || null }),
    optOut: v => v.isLead ? update('Leads', only({ id: v.contact.id, [C.lead.optedOut]: true, [C.lead.lifecycle]: 'Opted out' })) : update(M.contact, { id: v.contact.id, [F.contact.optedOut]: true, [F.contact.lifecycle]: 'Opted out' }),
    addCall: v => insert(M.task, only({ ...about(v), [F.task.subject]: 'Call ' + v.contact.name, [v.isLead ? C.lead.taskType : F.task.type]: 'Call', [F.task.due]: ymd(root.BefreeRules.addBusinessDays(new Date(), 0)), [F.task.status]: 'Not Started' })),
    async book(v, start, reschedules) {
      await insert(M.meeting, only({ ...about(v), [F.meeting.title]: 'Meeting with ' + v.contact.name, [F.meeting.start]: stamp(start), [F.meeting.end]: stamp(new Date(start.getTime() + 1800000)), [v.isLead ? C.lead.reschedules : F.meeting.reschedules]: reschedules }));
      if (!v.isLead) await update(M.contact, { id: v.contact.id, [F.contact.lifecycle]: 'Meeting booked' });
      else if (C.lead.lifecycle) await update('Leads', { id: v.contact.id, [C.lead.lifecycle]: 'Meeting booked' });
    },
    // Adds the lead to the meeting and lets CRM email its own invitation. The meeting is read again to confirm it.
    async invite(v, m) {
      const meeting = await one(M.meeting, m.id);
      const guests = (meeting.Participants || []).map(p => ({ id: p.id, type: p.type, participant: id(p.participant) }));
      if (!guestOf(meeting, v.contact.id, v.contact.email)) guests.push({ type: 'lead', participant: v.contact.id });
      await update(M.meeting, { id: m.id, Participants: guests, $send_notification: true });
      // CRM marks the invitation a moment after saving the meeting, so the meeting is read a few times
      let guest = null;
      for (const wait of C.inviteChecks) {
        await new Promise(done => setTimeout(done, wait));
        guest = await one(M.meeting, m.id).then(r => guestOf(r, v.contact.id, v.contact.email), () => guest);
        if (guest && guest.invited !== false) break;
      }
      if (!guest) throw new Error('CRM did not add this lead to the meeting.');
      if (guest.invited === false) throw new Error('CRM added this lead to the meeting but has not marked it as invited yet. Reload this lead in a minute to check, or send the invitation from the meeting in CRM.');
      await saved(ZOHO.CRM.API.addNotes({ Entity: 'Leads', RecordID: v.contact.id, Title: C.inviteNote, Content: 'To ' + v.contact.email + ' for the meeting on ' + new Date(m.start).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) + '.' }));
    },
    move: (v, m, start) => update(M.meeting, { id: m.id, [F.meeting.start]: stamp(start), [F.meeting.end]: stamp(new Date(start.getTime() + 1800000)), [v.isLead ? C.lead.reschedules : F.meeting.reschedules]: m.reschedules + 1 }),
    outcome: (v, m, f) => update(M.meeting, only({ id: m.id, [v.isLead ? C.lead.outcome : F.meeting.outcome]: f.outcome, [v.isLead ? C.lead.reason : F.meeting.reason]: f.outcome === 'Rejected' ? f.reason : null })),
    async toCold(v, m) {
      if (!m.outcome) await update(M.meeting, { id: m.id, [v.isLead ? C.lead.outcome : F.meeting.outcome]: 'No-show' });
      if (v.isLead) return update('Leads', only({ id: v.contact.id, [C.lead.backToColdOn]: ymd(new Date()), [C.lead.lifecycle]: 'Working' }));
      await update(M.contact, { id: v.contact.id, [F.contact.backToColdOn]: ymd(new Date()), [F.contact.lifecycle]: 'Working' });
    },
    // Keeps the last summary on the lead. No workflows are triggered.
    saveAi: (v, text) => saved(ZOHO.CRM.API.updateRecord({ Entity: 'Leads', APIData: { id: v.contact.id, [C.ai.savedField]: text }, Trigger: [] })),
    // Is this company already an account, or this email already on a contact or another lead?
    async duplicates(v) {
      const L = C.lead, A = F.account, email = String(v.contact.email || '').trim(), company = v.account.name === 'No company' ? '' : String(v.account.name || '').trim();
      const domains = [...new Set([root.BefreeRules.domainOf(v.website), root.BefreeRules.domainOf(email)].filter(Boolean))], failed = [];
      const ask = (label, run) => run().catch(() => { if (!failed.includes(label)) failed.push(label); return []; });
      const [named, contacts, leads, ...sites] = await Promise.all([
        company ? ask('accounts', () => rows(M.account, [A.name], `${A.name} = ${quote(company)}`, 'id asc')) : [],
        email ? ask('contacts', () => rows(M.contact, [L.firstName, L.lastName, F.contact.account, F.contact.account + '.' + A.name], `${L.email} = ${quote(email)}`, 'id asc')) : [],
        email ? ask('leads', () => rows('Leads', [L.firstName, L.lastName], `${L.email} = ${quote(email)}`, 'id asc')) : [],
        ...domains.map(d => ask('accounts', () => rows(M.account, [A.name, L.website], `${L.website} like ${quote('%' + d + '%')}`, 'id asc').then(x => x.filter(r => root.BefreeRules.domainOf(r[L.website]) === d))))
      ]);
      const accounts = [];
      named.forEach(r => accounts.push({ id: r.id, name: r[A.name], by: 'same name' }));
      sites.flat().forEach(r => { if (!accounts.some(a => a.id === r.id)) accounts.push({ id: r.id, name: r[A.name], by: 'same website' }); });
      return { email, accounts, failed, contacts: contacts.map(r => ({ id: r.id, name: person(r), accountId: id(r[F.contact.account]), accountName: r[F.contact.account + '.' + A.name] || name(r[F.contact.account]) })), leads: leads.filter(r => r.id !== v.contact.id).map(r => ({ id: r.id, name: person(r) })) };
    },
    // Stage choices as set up in the Deals module
    async dealStages() {
      let stage;
      try {
        const r = await ZOHO.CRM.META.getFields({ Entity: M.deal });
        stage = ((r && r.fields) || []).find(f => f.api_name === F.deal.stage);
      } catch (e) { throw new Error('The Deal stages could not be read from CRM. ' + why(e)); }
      const list = ((stage && stage.pick_list_values) || []).filter(p => p.type !== 'unused').map(p => p.actual_value || p.display_value).filter(x => x && x !== '-None-');
      if (!list.length) throw new Error('No Deal stages were returned by CRM.');
      return list;
    },
    // Contact roles and campaigns are choices only, so a list that cannot be read is left out (null)
    async contactRoles() {
      try {
        const r = await Promise.race([ZOHO.CRM.API.getRecord({ Entity: 'Contacts', RecordID: 'roles' }), new Promise(done => setTimeout(done, 5000))]);
        const list = r && (r.contact_roles || (r.data && r.data.contact_roles));
        return list && list.length ? list.map(x => ({ id: x.id, name: x.name })) : null;
      } catch (e) { return null; }
    },
    async campaigns() {
      try {
        const r = await ZOHO.CRM.API.getAllRecords({ Entity: 'Campaigns', sort_order: 'desc', per_page: 200, page: 1 });
        return ((r && r.data) || []).map(x => ({ id: x.id, name: x.Campaign_Name || x.id }));
      } catch (e) { return []; }
    },
    // Converts the lead with CRM's own lead conversion, run by a CRM function
    async convert(v, f) {
      const fn = C.convert.functionName;
      const make = !!f.createDeal;
      const details = {
        create_deal: String(make), deal_name: make ? f.dealName.trim() : '', stage: make ? f.stage : '', closing_date: make ? f.closingDate : '', amount: make ? f.amount || '' : '',
        campaign_id: make ? f.campaignId || '' : '', contact_role: make ? f.contactRole || '' : '', owner_id: f.ownerId || '', account_id: f.accountId || '', contact_id: f.contactId || ''
      };
      let r;
      try {
        r = await ZOHO.CRM.FUNCTIONS.execute(fn, { arguments: JSON.stringify({ lead_id: String(v.contact.id), details: JSON.stringify(details) }) });
      } catch (e) { throw new Error(`The CRM function ${fn} could not be run. ${why(e)}`); }
      let out = r && r.details && r.details.output;
      if (!out) throw new Error(`The CRM function ${fn} did not return an answer. Check in CRM whether the lead was converted before trying again.`);
      try {
        if (typeof out === 'string') out = JSON.parse(out);
      } catch (e) { throw new Error('The CRM function returned an answer that could not be read. Check in CRM whether the lead was converted.'); }
      if (String(out.ok) !== 'true') throw new Error(out.error || 'The CRM function reported an error.');
      return { dealId: out.deal_id || '', accountId: out.account_id || '', contactId: out.contact_id || '', roleSet: String(out.role_set) !== 'false' };
    },
    // The temperature as it is now in CRM
    temperature: v => one('Leads', v.contact.id).then(r => r[C.ai.temperatureField] || ''),
    // Runs the CRM function that calls OpenAI. The API key stays in CRM and never reaches this page.
    async summarize(v) {
      let timer;
      const late = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('The AI took too long to answer. Please try again.')), 75000); });
      try {
        const r = await Promise.race([ZOHO.CRM.FUNCTIONS.execute(C.ai.functionName, { arguments: JSON.stringify({ lead_id: String(v.contact.id) }) }), late]);
        let out = r && r.details && r.details.output;
        if (!out) throw new Error(`The CRM function ${C.ai.functionName} did not return an answer. ${r && r.code === 'success' ? '' : why(r)}`.trim());
        try {
          if (typeof out === 'string') out = JSON.parse(out);
        } catch (e) { throw new Error('The CRM function returned an answer that could not be read.'); }
        if (String(out.ok) !== 'true') throw new Error(out.error || 'The CRM function reported an error.');
        try { return { ...(typeof out.text === 'string' ? JSON.parse(out.text) : out.text), temperature: out.temperature || null }; } catch (e) { throw new Error('The AI answer could not be read. Please try again.'); }
      } catch (e) {
        throw e instanceof Error ? e : new Error(`The CRM function ${C.ai.functionName} could not be run. ${why(e)}`);
      } finally { clearTimeout(timer); }
    },
    open: (entity, recordId) => ZOHO.CRM.UI.Record.open({ Entity: entity, RecordID: recordId }),
    // Resolves with the id of the lead or contact page the widget sits on, or null in a web tab
    start: () => new Promise((resolve, reject) => {
      if (typeof ZOHO === 'undefined') return reject(new Error('The Zoho SDK did not load.'));
      const timer = setTimeout(() => reject(new Error('Zoho CRM did not respond.')), 10000);
      ZOHO.embeddedApp.on('PageLoad', d => {
        clearTimeout(timer);
        const recordId = d && (Array.isArray(d.EntityId) ? d.EntityId[0] : d.EntityId);
        if (!recordId) return resolve(null);
        if (d.Entity && d.Entity !== 'Leads' && d.Entity !== M.contact) return reject(new Error('Place this widget on a Leads or Contacts page.'));
        entity = d.Entity || 'Leads';
        resolve(recordId);
      });
      ZOHO.embeddedApp.init();
    })
  };
})(this);
