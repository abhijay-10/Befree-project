// Reads and writes Zoho CRM. Same functions as sample.js.
(function (root) {
  const C = root.BefreeConfig, R = root.BefreeRules, D = C.deal, X = C.extra;
  const id = v => (v && typeof v === 'object' ? v.id : v) || null;
  const name = v => (v && typeof v === 'object' ? v.name || v.full_name : v) || '';
  const many = v => (Array.isArray(v) ? v : [v]).map(name).filter(x => x && x !== '-None-');
  const why = e => (e && (e.message || (e.data && e.data[0] && e.data[0].message) || e.code)) || 'Unknown error';
  const failed = r => r && r.status !== 204 && r.statusText !== 'nocontent' && (r.code || r.status === 'error');

  async function one(entity, recordId) {
    const r = await ZOHO.CRM.API.getRecord({ Entity: entity, RecordID: recordId });
    if (!r || !r.data || !r.data[0]) throw new Error(entity + ' record could not be read. ' + why(r));
    return r.data[0];
  }
  async function related(dealId, list) {
    const r = await ZOHO.CRM.API.getRelatedRecords({ Entity: 'Deals', RecordID: dealId, RelatedList: list, page: 1, per_page: 200 });
    if (r && r.data) return r.data;
    if (failed(r)) throw new Error(why(r));
    return [];
  }
  async function saved(call) {
    const r = await call;
    const x = r && r.data && r.data[0];
    if (!x || x.code !== 'SUCCESS') throw new Error(why(x || r));
  }
  const update = (v, data) => saved(ZOHO.CRM.API.updateRecord({ Entity: 'Deals', APIData: { id: v.deal.id, ...data }, Trigger: ['workflow', 'blueprint'] }));

  const isId = v => /^\d{8,}$/.test(v || '');
  const idNames = f => Object.fromEntries(((f && f.pick_list_values) || []).filter(p => p.id).map(p => [String(p.id), p.display_value || p.actual_value]));

  // Reads the real Deals fields from CRM, so stage names, reasons and services are never guessed
  let metaJob = null;
  const meta = () => metaJob || (metaJob = (async () => {
    const out = { read: false, stages: [], reasons: [], notFound: [], service: { field: D.service, label: 'Service', multi: false, editable: false, options: [] } };
    let fields = [];
    try {
      const r = await ZOHO.CRM.META.getFields({ Entity: 'Deals' });
      fields = (r && r.fields) || [];
    } catch (e) { out.why = why(e); }
    if (!fields.length) return { ...out, why: out.why || 'No fields were returned' };
    const by = n => fields.find(f => f.api_name === n);
    const values = f => ((f && f.pick_list_values) || []).filter(p => p.type !== 'unused').map(p => p.actual_value || p.display_value).filter(x => x && x !== '-None-');
    const s = by(D.service);
    return {
      read: true, stageIds: idNames(by(D.stage)), stages: values(by(D.stage)), reasons: values(by(D.lostReason)),
      notFound: Object.values(D).concat(Object.entries(X).filter(([k, n]) => n && !k.startsWith('touch')).map(e => e[1])).filter(n => !by(n)),
      service: s ? {
        field: s.api_name, label: s.field_label || 'Service', multi: s.data_type === 'multiselectpicklist',
        editable: s.data_type === 'picklist' || s.data_type === 'multiselectpicklist', options: values(s)
      } : { ...out.service, field: '' }
    };
  })());

  let userJob = null;
  const me = () => userJob || (userJob = ZOHO.CRM.CONFIG.getCurrentUser().then(r => {
    const u = (r && r.users && r.users[0]) || {}, profile = u.profile && u.profile.name;
    return { id: u.id, name: u.full_name || '', profile, role: C.profiles[profile] || 'View only', country: null };
  }));

  // CRM may give a contact role as an ID instead of its name, so the role list is read once
  let rolesJob = null;
  const roleList = () => rolesJob || (rolesJob = new Promise(done => {
    const timer = setTimeout(() => done({}), 4000);
    const finish = list => { clearTimeout(timer); done(Object.fromEntries((list || []).map(x => [x.id, x.name]))); };
    try {
      Promise.resolve(ZOHO.CRM.API.getRecord({ Entity: 'Contacts', RecordID: 'roles' })).then(r => finish(r && (r.contact_roles || (r.data && r.data.contact_roles) || [])), () => finish());
    } catch (e) { finish(); }
  }));
  async function readRoles(rows) {
    if (!rows) return null;
    const raw = x => name(x.Contact_Role) || id(x.Contact_Role) || name(x.Role);
    const known = C.contactRoles || {};
    const list = rows.some(x => isId(raw(x)) && !known[raw(x)]) ? await roleList() : {};
    return rows.map(x => {
      const v = raw(x), role = isId(v) ? known[v] || list[v] || '' : v;
      return { name: x.Full_Name || [x.First_Name, x.Last_Name].filter(Boolean).join(' ') || name(x.Contact_Name), role: role || '', unread: isId(v) && !role ? v : '' };
    });
  }

  // The stage history may give a stage as an ID. Its name is looked up in the fields, then the layouts, then config.js.
  let layoutJob = null;
  const layoutStages = () => layoutJob || (layoutJob = new Promise(done => {
    const timer = setTimeout(() => done({}), 4000);
    const finish = out => { clearTimeout(timer); done(out || {}); };
    try {
      Promise.resolve(ZOHO.CRM.META.getLayouts({ Entity: 'Deals' })).then(r => finish(Object.assign({}, ...((r && r.layouts) || []).flatMap(l => l.sections || []).flatMap(x => x.fields || []).filter(f => f.api_name === D.stage).map(idNames))), () => finish());
    } catch (e) { finish(); }
  }));
  async function readHistory(rows, fromFields) {
    if (!rows) return null;
    const known = { ...C.stageIds, ...fromFields }, raw = h => String(name(h.Stage) || id(h.Stage) || '');
    const more = rows.some(h => isId(raw(h)) && !known[raw(h)]) ? await layoutStages() : {};
    const stage = v => isId(v) ? known[v] || more[v] || 'Stage ID ' + v : v;
    return rows.map(h => ({ stage: stage(raw(h)), prob: h.Probability, closeDate: h.Close_Date || h.Closing_Date || null, at: h.Modified_Time || h.Last_Modified_Time || h.Created_Time, by: name(h.Modified_By) })).filter(h => h.at);
  }

  async function touches(accountId) {
    const q = `select ${X.touchType}, ${X.touchChannel}, ${X.touchDate} from ${X.touchModule} where ${X.touchAccount} = '${accountId}' order by ${X.touchDate} desc limit 0, 200`;
    const r = await ZOHO.CRM.API.coql({ select_query: q });
    if (r && r.data) return r.data.map(t => ({ type: t[X.touchType], channel: t[X.touchChannel], date: t[X.touchDate], who: '' }));
    if (failed(r)) throw new Error(why(r));
    return [];
  }
  const hasTouches = !!(X.touchModule && X.touchAccount && X.touchType && X.touchChannel && X.touchDate);

  root.BefreeCrm = {
    live: true,
    async load(dealId) {
      const problems = {};
      const safe = (key, p) => p.catch(e => { problems[key] = why(e); return null; });
      const [m, user, r] = await Promise.all([meta(), me(), one('Deals', dealId)]);
      const accountId = id(r[D.account]), createdById = id(r[D.createdBy]), ownerId = id(r[D.owner]);
      if (!R.canSee(user, { createdById, ownerId })) throw new Error('A BDE can open only the deals they raised or own.');
      const [account, roles, history, seen] = await Promise.all([
        accountId ? safe('account', one('Accounts', accountId)) : null,
        safe('roles', related(dealId, 'Contact_Roles')),
        safe('history', related(dealId, 'Stage_History')),
        hasTouches && accountId ? safe('touches', touches(accountId)) : null
      ]);
      const stage = r[D.stage] || '', befree = R.befreeStage(stage);
      const prob = r[D.probability] === null || r[D.probability] === undefined ? (befree ? befree.prob : null) : Number(r[D.probability]);
      return {
        live: true, now: new Date(), user, problems, notFound: m.notFound, service: m.service, metaWhy: m.why,
        stages: m.stages.length ? m.stages : C.stages.map(s => s.name), stagesKnown: m.stages.length > 0, reasons: m.reasons,
        missing: { sourcedBy: !X.sourcedBy, approval: !X.approval, acceptance: !X.acceptance, touches: !hasTouches },
        deal: {
          id: r.id, name: r[D.name] || 'No name', accountId, accountName: name(r[D.account]), accountOwner: account ? name(account.Owner) : accountId ? null : '',
          contactId: id(r[D.contact]), contactName: name(r[D.contact]), owner: name(r[D.owner]), ownerId, createdBy: name(r[D.createdBy]), createdById,
          stage, prob, amount: r[D.amount], expected: r[D.expected], symbol: typeof r.$currency_symbol === 'string' ? r.$currency_symbol : '',
          created: r.Created_Time, modified: r.Modified_Time, closeDate: r[D.closeDate] || null, timeline: r[C.timeline] || null, nextStep: r[D.nextStep] || '',
          nextStepUpdated: X.nextStepUpdated ? r[X.nextStepUpdated] : null, services: many(r[D.service]), lostReason: r[D.lostReason] || '',
          type: r[D.type], leadSource: r[D.leadSource], campaign: name(r[D.campaign]), description: r[D.description],
          sourcedBy: X.sourcedBy ? r[X.sourcedBy] || '' : '', approval: X.approval ? r[X.approval] || '' : '', acceptance: X.acceptance ? r[X.acceptance] || '' : '', rejectReason: X.rejectReason ? r[X.rejectReason] || '' : '',
          roles: await readRoles(roles),
          history: await readHistory(history, m.stageIds),
          touches: seen
        }
      };
    },
    // For the web tab, where no record is open
    async deals() {
      const [m, user] = await Promise.all([meta(), me()]), all = [];
      for (let page = 1; page <= 10; page++) { // CRM allows 2,000 records this way
        const r = await ZOHO.CRM.API.getAllRecords({ Entity: 'Deals', sort_order: 'desc', per_page: 200, page });
        if (r && r.data) all.push(...r.data);
        else if (failed(r)) throw new Error('Deals could not be read. ' + why(r));
        if (!r || !r.info || !r.info.more_records) break;
        if (page === 10) all.partial = true;
      }
      const list = all.filter(r => R.canSee(user, { createdById: id(r[D.createdBy]), ownerId: id(r[D.owner]) })).map(r => ({
        id: r.id, name: r[D.name] || 'No name', sub: [name(r[D.account]), r[D.stage]].filter(Boolean).join(', '), services: m.service.field ? many(r[D.service]) : [],
        amount: r[D.amount], symbol: typeof r.$currency_symbol === 'string' ? r.$currency_symbol : ''
      }));
      list.partial = !!all.partial;
      return list;
    },
    // The evidence is kept as a note on the deal, and saved before the stage changes
    async move(v, to, evidence) {
      await saved(ZOHO.CRM.API.addNotes({ Entity: 'Deals', RecordID: v.deal.id, Title: 'Evidence: ' + to, Content: evidence }));
      await update(v, { [D.stage]: to });
    },
    lose: (v, stage, reason) => update(v, { [D.stage]: stage, [D.lostReason]: reason }),
    // "to" is the stage the next step moves the deal to, if any
    async nextStep(v, text, to) {
      if (to) await saved(ZOHO.CRM.API.addNotes({ Entity: 'Deals', RecordID: v.deal.id, Title: 'Evidence: ' + to, Content: 'Moved from the next step: ' + text }));
      await update(v, { [D.nextStep]: text || null, ...(to ? { [D.stage]: to } : {}), ...(X.nextStepUpdated ? { [X.nextStepUpdated]: new Date().toLocaleDateString('en-CA') } : {}) });
    },
    closeDate: (v, date) => update(v, { [D.closeDate]: date }),
    setService: (v, list) => update(v, { [D.service]: v.service.multi ? list : list[0] || null }),
    decide: (v, accepted, reason) => update(v, { [X.acceptance]: accepted ? 'Accepted' : 'Rejected', ...(X.rejectReason && !accepted ? { [X.rejectReason]: reason } : {}) }),
    open: (entity, recordId) => ZOHO.CRM.UI.Record.open({ Entity: entity, RecordID: recordId }),
    // Resolves with the id of the deal page the widget sits on, or null in a web tab
    start: () => new Promise((resolve, reject) => {
      if (typeof ZOHO === 'undefined') return reject(new Error('The Zoho SDK did not load.'));
      const timer = setTimeout(() => reject(new Error('Zoho CRM did not respond.')), 10000);
      ZOHO.embeddedApp.on('PageLoad', d => {
        clearTimeout(timer);
        const recordId = d && (Array.isArray(d.EntityId) ? d.EntityId[0] : d.EntityId);
        if (!recordId) return resolve(null);
        if (d.Entity && d.Entity !== 'Deals') return reject(new Error('Place this widget on a Deals page.'));
        resolve(recordId);
      });
      ZOHO.embeddedApp.init();
    })
  };
})(this);
