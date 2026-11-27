// Run with: node --test test/lead-invite.test.js
// The meeting invitation: emailed with CRM's Send Mail API through the SDK's zrc client, then recorded in a note.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function setup(o = {}) {
  const calls = { mail: [], notes: [], updates: [] };
  const ZOHO = { CRM: { API: {
    getRecord: async () => ({ data: [{ id: 'M1', Event_Title: 'Intro call', Start_DateTime: '2026-12-01T10:00:00+05:30', End_DateTime: '2026-12-01T10:30:00+05:30', Participants: o.participants || [] }] }),
    updateRecord: async x => { calls.updates.push(x.APIData); return { data: [{ code: 'SUCCESS' }] }; },
    addNotes: async x => { calls.notes.push(x); return { data: [{ code: o.noteFails ? 'ERROR' : 'SUCCESS', message: 'note error' }] }; }
  } } };
  const zrc = o.noZrc ? undefined : { post: async (url, body) => {
    calls.mail.push({ url, body });
    if (o.mailFails) { const e = new Error('Request failed'); e.response = { data: { data: [{ code: 'INVALID_DATA', message: 'the from address is not verified', details: { api_name: 'from' } }] } }; throw e; }
    return { data: { data: [{ code: 'SUCCESS' }] } };
  } };
  const ctx = { ZOHO, zrc, console };
  ctx.BefreeConfig = require('../app/js/config.js');
  ctx.BefreeRules = require('../app/js/rules.js');
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app/js/crm.js'), 'utf8'), ctx);
  const v = { user: { email: 'sam@befree.example', label: 'Sam' }, contact: { id: 'L1', name: 'Jo Person', email: 'jo@acme.com.au', optedOut: !!o.optedOut } };
  return { crm: ctx.BefreeCrm, v, calls };
}

test('emails the invitation with CRM Send Mail, adds the lead to the meeting, then saves the note', async () => {
  const { crm, v, calls } = setup();
  await crm.invite(v, { id: 'M1', start: '2026-12-01T10:00:00+05:30' });
  assert.equal(calls.updates.length, 1, 'lead added as a participant');
  assert.equal(calls.updates[0].$send_notification, false, 'no second email from Zoho');
  assert.equal(calls.mail.length, 1);
  assert.equal(calls.mail[0].url, '/crm/v7/Leads/L1/actions/send_mail');
  const mail = calls.mail[0].body.data[0];
  assert.deepEqual(mail.from, { user_name: 'Sam', email: 'sam@befree.example' });
  assert.deepEqual(mail.to, [{ user_name: 'Jo Person', email: 'jo@acme.com.au' }]);
  assert.match(mail.subject, /^Meeting invitation: Intro call on /);
  assert.equal(mail.mail_format, 'html');
  assert.equal(calls.notes.length, 1);
  assert.equal(calls.notes[0].Title, 'Meeting invitation sent', 'the note that unlocks Convert to Deal');
});

test('a lead already on the meeting is not added again', async () => {
  const { crm, v, calls } = setup({ participants: [{ id: 'P1', type: 'lead', participant: { id: 'L1' } }] });
  await crm.invite(v, { id: 'M1' });
  assert.equal(calls.updates.length, 0);
  assert.equal(calls.mail.length, 1);
});

test('nothing is sent to an opted-out lead or a lead with no email', async () => {
  const opted = setup({ optedOut: true });
  await assert.rejects(opted.crm.invite(opted.v, { id: 'M1' }), /opted out/);
  assert.equal(opted.calls.mail.length, 0);
  const blank = setup();
  blank.v.contact.email = '';
  await assert.rejects(blank.crm.invite(blank.v, { id: 'M1' }), /no email address/);
  assert.equal(blank.calls.mail.length, 0);
});

test('a refused email shows CRM\'s reason and saves no note', async () => {
  const { crm, v, calls } = setup({ mailFails: true });
  await assert.rejects(crm.invite(v, { id: 'M1' }), /The invitation email was not sent: the from address is not verified \(from\)/);
  assert.equal(calls.notes.length, 0);
});

test('a note that cannot be saved says the email already went out', async () => {
  const { crm, v } = setup({ noteFails: true });
  await assert.rejects(crm.invite(v, { id: 'M1' }), /email was sent, but the note .* not saved/);
});
