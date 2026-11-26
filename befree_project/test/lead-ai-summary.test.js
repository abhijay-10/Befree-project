// Run with: node --test test/lead-ai-summary.test.js
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { load, wrap } = require('./deluge.js');
const summary = load(path.join(__dirname, '../crm_functions/lead_ai_summary.dg'), 'lead_ai_summary', ['lead_id']);

const now = new Date('2026-11-25T10:00:00Z');
const iso = days => new Date(now - days * 864e5).toISOString().slice(0, 19) + '+00:00';
const base = { id: '1', Full_Name: 'Jo Person', Company: 'Acme', Website: 'https://acme.com.au', Email: 'jo@acme.com.au', Phone: '0400111222', Country: 'Australia', Industry: null, No_of_Employees: null, Services_List: [], Lead_Status: 'Contacted', Email_Opt_Out: false, Description: '', Lead_Temperature: null, AI_Enrichment_Status: null, AI_Confidence: null, AI_Lead_Summary: null, AI_Industry: null, AI_Data_Sources: null };
const S = 'https://acme.com.au/about', N = 'https://news.example.org/acme';
const src = (...f) => f.map(x => ({ fact: x, url: S + '/' }));
const facts = o => ({ match: 'sure', employees_min: 100, employees_max: 200, industry_group: 'accounting', country_code: 'AU', growth: 'some', growth_detail: 'Hiring staff', funding: '', risk: 'unknown', risk_detail: '', service_need: 'clear', service_detail: 'Short of accountants', sources: src('employees', 'industry', 'country', 'growth', 'service_need'), ...o });
const none = { match: 'unsure', employees_min: 0, employees_max: 0, industry_group: 'unknown', country_code: 'unknown', growth: 'unknown', growth_detail: '', funding: '', risk: 'unknown', risk_detail: '', service_need: 'unknown', service_detail: '', sources: [] };
const ai = (o, r) => ({ verdict: 'too_early', evidence: 'low', summary: 'A lead.', for_deal: [], concerns: [], next_step: 'Call', company: { website: '', industry: 'Accounting', headquarters: '', company_size: '', year_founded: 0, company_summary: '', main_business: '', sources: [S] }, research: r || facts(), ...o });
const reply = f => ({ code: 200, body: { status: 'completed', output: [{ type: 'web_search_call', action: { type: 'search', sources: [{ url: S + '?utm_source=openai' }, { url: N }] } }, { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(f) }] }] } });

function go(lead, o = {}) {
  const rec = { ...base, ...lead }, saves = [], calls = [], logs = [], replies = [].concat(o.reply || reply(ai()));
  const world = {
    now, logs,
    crm: {
      getOrgVariable: () => o.key === undefined ? 'sk-x' : o.key,
      getRecordById: () => o.missing ? null : wrap({ ...rec }),
      getRelatedRecords: list => {
        if (list === 'Events_History' || (o.noMeetings && list === 'Events')) throw Error('none');
        return wrap(list === 'Events' ? o.meetings || [] : list === 'Notes' ? o.notes || [] : []);
      },
      updateRecord: (m, id, d) => { const x = JSON.parse(d.toString()); saves.push(x); if (o.saveFail && x.Lead_Temperature) return wrap({ status: 'error' }); Object.assign(rec, x); return wrap({ id }); }
    },
    invoke: r => { calls.push(JSON.parse(r.parameters)); const a = replies.length > 1 ? replies.shift() : replies[0]; if (a === 'timeout') throw Error('socket timeout'); return wrap({ responseCode: a.code, responseText: JSON.stringify(a.body || {}) }); }
  };
  const out = summary(world, o.id === undefined ? '1' : o.id);
  return { out, t: out.temperature, rec, saves, calls, logs };
}
const heat = (lead, verdict, o = {}) => go({ Website: null, ...lead }, { ...o, reply: reply(ai({ verdict: verdict || 'too_early' }, o.research || none)) });
const meeting = (days, o) => [{ Event_Title: 'Call', Start_DateTime: iso(days), Created_Time: iso(days + 2), ...o }];
const fit = { No_of_Employees: 200, Industry: 'Accounting' };
const note = [{ Note_Title: 'Call', Note_Content: 'wants help', Created_Time: iso(1) }];

test('one click gives the summary and the temperature, with one OpenAI call', () => {
  const x = go({});
  assert.ok(x.out.ok && x.out.text.summary === 'A lead.');
  assert.equal(x.calls.length, 1);
  assert.equal(x.calls[0].max_tool_calls, 1);
  // size 20, industry 12, need 10, country 8, growth 8 of 12; no service 0 of 8, no meeting 0 of 12: 58 of 82
  assert.deepEqual([x.t.value, x.t.score, x.t.judged, x.t.confidence, x.t.saved], ['Hot', 71, 82, 'Medium', true]);
  assert.equal(x.rec.Lead_Temperature, 'Hot');
  assert.equal(x.t.good.length, 3);
  assert.deepEqual(x.t.sources[0], { fact: 'employees', url: S });
  assert.equal(x.rec.AI_Lead_Summary, 'A lead.');
  assert.equal(x.rec.AI_Data_Sources, S);
});
test('a temperature from CRM is saved before OpenAI is called', () => {
  const x = go(fit, { reply: 'timeout' });
  assert.equal(x.out.ok, false);
  assert.deepEqual(x.saves.map(s => s.Lead_Temperature), ['Warm']);
  assert.equal(x.t.value, 'Warm');
  const before = go({ ...fit, Lead_Temperature: 'Hot' }, { reply: 'timeout' });
  assert.equal(before.rec.Lead_Temperature, 'Hot'); // an earlier AI result is not lost
  assert.equal(before.saves.length, 0);
});
test('score limits: Hot from 70, Warm from 40, Cold below', () => {
  const t = (...a) => { const x = heat(...a); return [x.t.score, x.t.value, x.t.judged]; };
  assert.deepEqual(t({ ...fit, Country: 'UK', Services_List: ['Tax'] }), [80, 'Hot', 60]);
  assert.deepEqual(t({ ...fit, Country: 'UK' }), [67, 'Warm', 60]);
  assert.deepEqual(t({ No_of_Employees: 5, Industry: 'Retail', Country: 'India' }), [23, 'Cold', 60]);
  assert.deepEqual(t({ No_of_Employees: 5, Industry: 'Retail', Services_List: ['Tax'], Country: 'India' }, 'possible'), [40, 'Warm', 70]); // 28 of 70
});
test('the AI answer changes the temperature', () => {
  const lead = { ...fit, Country: 'India', Description: 'Enquiry' };
  assert.deepEqual(['interested', 'possible', 'too_early', 'not_interested'].map(v => heat(lead, v).t.score), [63, 57, 57, 49]);
  assert.equal(heat(lead, 'not_interested').t.value, 'Cold');
  assert.deepEqual(heat({ Services_List: ['Tax'], Description: 'Website enquiry' }, 'possible').t.value, 'Warm');
  assert.equal(heat({ Services_List: ['Tax'], Description: 'Website enquiry' }, 'possible', { meetings: meeting(-2) }).t.value, 'Hot');
});
test('the same checks as the summary apply to the verdict', () => {
  assert.ok(!heat(fit, 'not_interested').t.bad.join().includes('Not interested')); // nothing on record shows a clear no
  assert.ok(heat({}, 'interested').t.good.includes('Shows possible interest'));
  assert.ok(heat({}, 'interested', { notes: note }).t.good.includes('Shows clear interest'));
});
test('size bands', () => {
  const t = n => heat({ No_of_Employees: n, Industry: 'Accounting', Country: 'US' }).t;
  assert.deepEqual([1, 9, 10, 49, 50, 999, 1000].map(n => Math.round(t(n).score * 60 / 100) - 20), [6, 6, 12, 12, 20, 20, 16]);
});
test('missing data is not negative, and too little data is not Cold', () => {
  const x = heat({});
  assert.deepEqual([x.t.value, x.t.judged, x.rec.Lead_Temperature], ['Not enough data', 28, 'Not enough data']);
  assert.equal(heat({ Country: null }).t.value, 'Not enough data');
  assert.equal(heat({ Industry: '-None-' }).t.judged, 28);
  assert.equal(heat({}, 'too_early', { noMeetings: true }).t.judged, 16); // meetings that could not be read are not judged
});
test('opted-out, junk and lost leads are never Hot or Warm', () => {
  for (const o of [{ Email_Opt_Out: true }, { Lead_Status: 'Junk Lead' }, { Lead_Status: 'Lost Lead' }, { Lead_Status: 'Not Qualified' }]) {
    const x = heat({ ...fit, Services_List: ['Tax'], Description: 'x', Lead_Temperature: 'Hot', ...o }, 'interested', { meetings: meeting(1, { Self_Booked: true, Meeting_Outcome: 'Accepted' }) });
    assert.deepEqual([x.t.value, x.rec.Lead_Temperature, x.saves[0].Lead_Temperature], ['Cold', 'Cold', 'Cold'], JSON.stringify(o)); // also before OpenAI
  }
});
test('the engagement rules come first: self-booked is Hot, back to Cold is Cold', () => {
  const self = meeting(0, { Start_DateTime: iso(-2), Created_Time: iso(2), Self_Booked: true });
  assert.equal(heat({}, '', { meetings: self }).t.value, 'Hot');
  assert.equal(heat({ ...fit, Back_To_Cold_On: '2026-11-24' }, '', { meetings: self }).t.value, 'Cold');
  assert.equal(heat({ Back_To_Cold_On: '2026-11-20' }, '', { meetings: self }).t.value, 'Hot');
  assert.equal(heat({ No_of_Employees: 5, Industry: 'Retail' }, '', { meetings: [{ ...self[0], Created_Time: iso(40) }] }).t.value, 'Warm');
});
test('meetings: accepted, on record, rejected', () => {
  const t = o => heat(fit, '', { meetings: meeting(3, o) }).t;
  assert.ok(t({ Meeting_Outcome: 'Accepted' }).score > t({}).score && t({}).score > t({ Meeting_Outcome: 'No-show' }).score);
  assert.equal(t({ Meeting_Outcome: 'Rejected' }).bad[0], 'A meeting ended as Rejected');
});
test('a fact counts only with a page the search returned, and only for the right company', () => {
  assert.ok(!go({}, { reply: reply(ai({}, facts({ sources: [{ fact: 'employees', url: 'https://invented.com/x' }] }))) }).t.good.join().includes('staff'));
  const wrong = go({}, { reply: reply(ai({}, facts({ match: 'unsure' }))) });
  assert.deepEqual([wrong.t.value, wrong.t.sources.length], ['Not enough data', 0]);
  const need = r => go({ Website: null, ...r }, { reply: reply(ai({}, { ...none, service_need: 'clear', service_detail: 'Payroll help', sources: [{ fact: 'service_need', url: 'CRM' }] })) }).t.good;
  assert.ok(need({ Description: 'Needs payroll help' }).includes('Clear need: Payroll help'));
  assert.ok(!need({}).join().includes('need')); // nothing is written in CRM
});
test('values typed in CRM come before the research and are never overwritten', () => {
  const x = go({ No_of_Employees: 5, Industry: 'Retail', Country: 'India', Services_List: ['Tax'] });
  assert.ok(x.t.bad.includes('Very small, about 5 staff') && x.t.bad.includes('Not one of our main industries'));
  for (const s of x.saves) for (const k of Object.keys(s)) assert.ok(/^(AI_|Lead_Temperature$)/.test(k), k);
});
test('confidence is High only when two sites support the same fact', () => {
  const two = src('employees', 'industry', 'country').concat({ fact: 'employees', url: N });
  assert.equal(go({}, { reply: reply(ai({}, facts({ sources: two }))) }).t.confidence, 'High');
  assert.equal(go({}, { reply: reply(ai({}, facts({ employees_min: 10, employees_max: 500, sources: two }))) }).t.confidence, 'Medium');
  assert.equal(heat({}).t.confidence, 'Low');
});
test('risk lowers the score and is listed first', () => {
  const x = go({}, { reply: reply(ai({}, facts({ risk: 'serious', risk_detail: 'In administration', sources: src('employees', 'industry', 'country', 'growth', 'service_need', 'risk') }))) });
  assert.deepEqual([x.t.bad[0], x.t.score], ['Risk: In administration', 59]);
});
test('the five kinds of test lead', () => {
  const big = go({}, { reply: reply(ai({}, facts({ employees_min: 4000, employees_max: 6000 }))) });
  const small = go({}, { reply: reply(ai({}, facts({ employees_min: 2, employees_max: 8, industry_group: 'other_business', growth: 'unknown', service_need: 'unknown' }))) });
  const free = heat({ Email: 'a@gmail.com', Company: 'Jo' });
  const wrong = go({ Website: 'wrong.example' }, { reply: reply(ai({}, none)) });
  const similar = go({}, { reply: reply(ai({}, facts({ match: 'unsure' }))) });
  assert.deepEqual([big, small, free, wrong, similar].map(x => x.t.value), ['Warm', 'Cold', 'Not enough data', 'Not enough data', 'Not enough data']);
});
test('a temperature problem never hides the summary, and errors are reported', () => {
  const x = go({}, { saveFail: true });
  assert.ok(x.out.ok && x.t.saved === false);
  const odd = go({}, { reply: reply(ai({}, { match: 'sure', employees_min: 'many', sources: src('employees') })) });
  assert.ok(odd.out.ok);
  const old = go({}, { reply: reply({ ...ai(), research: null }) });
  assert.ok(old.out.ok && old.t.value === 'Not enough data');
  assert.match(go({}, { reply: { code: 401 } }).out.error, /API key/);
  assert.match(go({}, { key: '' }).out.error, /openai_key/);
  assert.match(go({}, { id: '' }).out.error, /lead_id/);
  const second = go({}, { reply: [{ code: 500 }, reply(ai({}, none))] });
  assert.ok(second.out.ok && second.calls.length === 2);
});
test('the contact fields stay out of the request, and the request is valid', () => {
  const c = go({ Company: 'A "B" \\ C' }).calls[0];
  assert.ok(!/jo@acme|0400111222/.test(JSON.stringify(c)));
  assert.equal(c.store, false);
  const check = s => { if (s.type === 'object') { assert.deepEqual(Object.keys(s.properties).sort(), s.required.slice().sort()); assert.equal(s.additionalProperties, false); Object.values(s.properties).forEach(check); } if (s.type === 'array') check(s.items); };
  check(c.text.format.schema);
});
