// End-to-end test of the Database Migration & Portability Center API.
// Run against a DISPOSABLE database only: the replace strategy wipes application data.
//   API_BASE_URL=http://localhost:5061/api MONGODB_URI=mongodb://127.0.0.1:27017/spendwise_mc_test \
//   TEST_ADMIN_EMAIL=<an address listed in the API's ADMIN_EMAILS> node scripts/test-migration-center.js
require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') });
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { readZip, createZip } = require('../migration/zip');

const base = process.env.API_BASE_URL;
const adminEmail = process.env.TEST_ADMIN_EMAIL;
const dbName = new URL(process.env.MONGODB_URI.replace(/^mongodb(\+srv)?:/, 'http:')).pathname.slice(1);
if (!base || !adminEmail) throw new Error('Set API_BASE_URL and TEST_ADMIN_EMAIL');
if (!/test/i.test(dbName)) throw new Error(`Refusing to run against "${dbName}": use a disposable database whose name contains "test"`);

const PASS = 'correct horse battery staple';
async function call(path, { method = 'GET', token, body, raw, headers = {}, expect = 200, binary = false } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(raw ? { 'Content-Type': 'application/octet-stream' } : body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  if (binary && res.status === 200) return Buffer.from(await res.arrayBuffer());
  const payload = await res.json().catch(() => ({}));
  assert.equal(res.status, expect, `${method} ${path} -> ${res.status} ${JSON.stringify(payload).slice(0, 300)}`);
  return payload.data;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(token, id, done) {
  for (let i = 0; i < 300; i++) {
    const job = await call(`/admin/migration/jobs/${id}`, { token });
    if (done(job)) return job;
    if (['failed', 'interrupted'].includes(job.status)) throw new Error(`job ${id} ${job.status}: ${job.error || ''}`);
    await sleep(250);
  }
  throw new Error(`job ${id} did not finish`);
}
const M = '/admin/migration';

(async () => {
  const stamp = crypto.randomBytes(3).toString('hex');
  const reg = (email) => call('/auth/register', { method: 'POST', body: { name: 'MC', email, password: 'migration-pass-1' }, expect: 201 });
  let admin;
  try {
    admin = await reg(adminEmail);
  } catch {
    admin = await call('/auth/login', { method: 'POST', body: { email: adminEmail, password: 'migration-pass-1' } });
  }
  const user = await reg(`mc-user-${stamp}@example.test`);
  const A = admin.token;
  const U = user.token;

  // Access control
  assert.equal((await call(`${M}/access`, { token: U })).isAdmin, false);
  await call(`${M}/overview`, { token: U, expect: 403 });
  await call(`${M}/exports`, { token: U, method: 'POST', body: { passphrase: PASS }, expect: 403 });
  await call(`${M}/overview`, { expect: 401 });
  assert.equal((await call(`${M}/access`, { token: A })).isAdmin, true);
  const overview = await call(`${M}/overview`, { token: A });
  const app = overview.databases.find((d) => d.key === 'application');
  assert.equal(app.type, 'mongodb');
  assert.equal(app.database, dbName);
  assert(!JSON.stringify(overview).includes('mongodb://'), 'connection string leaked');
  assert(!JSON.stringify(overview).includes('postgresql://'), 'connection string leaked');

  // Data the user owns before the export
  const today = new Date().toISOString();
  const expenseA = await call('/expenses', { token: U, method: 'POST', body: { date: today, amount: '40.00', item: 'MC lunch', subtypes: [{ type: 'drink', amount: '5.25' }], hasSubtypes: true }, expect: 201 });
  const incomeB = await call('/income', { token: U, method: 'POST', body: { date: today, amount: '900.00', source: 'MC salary' }, expect: 201 });
  await call('/reminders', { token: U, method: 'POST', body: { title: 'MC rent', dueDate: today, amount: '100' }, expect: 201 });

  // Export
  await call(`${M}/exports`, { token: A, method: 'POST', body: { passphrase: 'short' }, expect: 400 });
  const exportJob = await call(`${M}/exports`, { token: A, method: 'POST', body: { source: 'application', passphrase: PASS }, expect: 201 });
  assert.equal(exportJob.status, 'completed');
  assert(exportJob.counts.users >= 2 && exportJob.counts.expenses >= 1);
  const pkg = await call(`${M}/jobs/${exportJob.id}/package`, { token: A, binary: true });
  const files = readZip(pkg, { allowed: ['manifest.json', 'data.enc', 'README.txt'] });
  const manifest = JSON.parse(files['manifest.json']);
  assert.equal(manifest.format, 'spendwise-migration-package');
  assert.equal(manifest.source.databaseType, 'mongodb');
  assert.equal(manifest.entities.users.count, exportJob.counts.users);
  assert(!pkg.includes(Buffer.from('$2a$')) && !pkg.includes(Buffer.from('MC lunch')), 'package is not encrypted');
  const report = await call(`${M}/jobs/${exportJob.id}/report`, { token: A, binary: true });
  assert.equal(JSON.parse(report).totalRecords, exportJob.totals.records);

  // Upload validation
  await call(`${M}/imports`, { token: A, method: 'POST', raw: Buffer.from('not a zip at all'), expect: 400 });
  await call(`${M}/imports`, { token: A, method: 'POST', raw: createZip([{ name: 'x.txt', data: Buffer.from('x') }]), expect: 400 });
  const corrupt = Buffer.from(pkg);
  corrupt[200] ^= 0xff;
  await call(`${M}/imports`, { token: A, method: 'POST', raw: corrupt, expect: 400 });
  const forgedManifest = { ...manifest, entities: { ...manifest.entities, users: { ...manifest.entities.users, count: 999 } } };
  const forged = createZip([{ name: 'manifest.json', data: Buffer.from(JSON.stringify(forgedManifest)) }, { name: 'data.enc', data: files['data.enc'] }]);
  const forgedJob = await call(`${M}/imports`, { token: A, method: 'POST', raw: forged, headers: { 'x-file-name': 'forged.zip' }, expect: 201 });
  await call(`${M}/imports/${forgedJob.id}/analyze`, { token: A, method: 'POST', body: { passphrase: PASS }, expect: 400 });
  await call(`${M}/imports/${forgedJob.id}/discard`, { token: A, method: 'POST' });

  // Destination changes after the export: A edited, B deleted, C created.
  await call(`/expenses/${expenseA._id}`, { token: U, method: 'PUT', body: { date: today, amount: '55.00', item: 'MC lunch edited' } });
  await call(`/income/${incomeB._id}`, { token: U, method: 'DELETE' });
  const expenseC = await call('/expenses', { token: U, method: 'POST', body: { date: today, amount: '7.00', item: 'MC coffee after export' }, expect: 201 });

  const upload = async () => {
    const job = await call(`${M}/imports`, { token: A, method: 'POST', raw: pkg, headers: { 'x-file-name': 'export.swpkg.zip' }, expect: 201 });
    assert.equal(job.source.type, 'mongodb');
    assert.equal(job.package.formatVersion, 1);
    await call(`${M}/imports/${job.id}/analyze`, { token: A, method: 'POST', body: { passphrase: 'wrong passphrase here' }, expect: 400 });
    await call(`${M}/imports/${job.id}/analyze`, { token: A, method: 'POST', body: { passphrase: PASS, destination: 'application' } });
    return waitFor(A, job.id, (j) => j.status === 'ready');
  };

  // Analysis + previews
  const job1 = await upload();
  assert.equal(job1.analysis.summary.incomes.new, 1, 'deleted income should be new');
  assert(job1.analysis.summary.expenses.conflicts >= 1, 'edited expense should conflict');
  const skipPlan = await call(`${M}/imports/${job1.id}/preview?strategy=skip`, { token: A });
  assert.equal(skipPlan.destructive, false);
  assert.equal(skipPlan.entities.incomes.insert, 1);
  const mergePlan = await call(`${M}/imports/${job1.id}/preview?strategy=merge`, { token: A });
  assert.equal(mergePlan.destructive, true);
  assert(mergePlan.entities.expenses.update >= 1);
  const replacePlan = await call(`${M}/imports/${job1.id}/preview?strategy=replace`, { token: A });
  assert(replacePlan.entities.expenses.remove >= 1);

  // Manual resolution: keep the incoming (exported) version of expense A only.
  const conflicts = await call(`${M}/imports/${job1.id}/conflicts?entity=expenses`, { token: A });
  const conflictA = conflicts.items.find((c) => c.key === expenseA._id);
  assert(conflictA, 'expense A conflict listed');
  assert(conflictA.fields.some((f) => f.field === 'amount' && f.existing === '55.00' && f.incoming === '40.00'));
  await call(`${M}/imports/${job1.id}/decisions`, { token: A, method: 'POST', body: { decisions: { [conflictA.cid]: 'incoming' } } });
  const manualPlan = await call(`${M}/imports/${job1.id}/preview?strategy=manual`, { token: A });
  assert.equal(manualPlan.entities.expenses.update, 1);
  await call(`${M}/imports/${job1.id}/execute`, { token: A, method: 'POST', body: { strategy: 'manual' }, expect: 400 });
  await call(`${M}/imports/${job1.id}/execute`, { token: A, method: 'POST', body: { strategy: 'manual', confirmation: manualPlan.confirmationPhrase } });
  const done1 = await waitFor(A, job1.id, (j) => j.status.startsWith('completed'));
  assert.equal(done1.status, 'completed');
  assert(done1.backupId, 'safety backup recorded');
  assert.equal(done1.progress.updated, 1);
  assert.equal(done1.progress.inserted, 1);
  assert.equal(done1.verification.mismatched, 0);
  const restoredA = await call(`/expenses/${expenseA._id}`, { token: U });
  assert.equal(restoredA.amount, 40);
  assert.equal(restoredA.subtypes[0].amount, 5.25);
  assert((await call('/income', { token: U })).some((i) => i._id === incomeB._id), 'income B re-imported');
  assert((await call('/expenses', { token: U })).some((e) => e._id === expenseC._id), 'merge kept C');
  await call(`${M}/imports/${job1.id}/execute`, { token: A, method: 'POST', body: { strategy: 'skip' }, expect: 409 });
  JSON.parse(await call(`${M}/jobs/${job1.id}/report`, { token: A, binary: true }));

  // Replace, then recover from the automatic backup.
  const job2 = await upload();
  const plan2 = await call(`${M}/imports/${job2.id}/preview?strategy=replace`, { token: A });
  await call(`${M}/imports/${job2.id}/execute`, { token: A, method: 'POST', body: { strategy: 'replace', confirmation: 'yes' }, expect: 400 });
  await call(`${M}/imports/${job2.id}/execute`, { token: A, method: 'POST', body: { strategy: 'replace', confirmation: plan2.confirmationPhrase } });
  const done2 = await waitFor(A, job2.id, (j) => j.status.startsWith('completed'));
  assert.equal(done2.status, 'completed');
  assert(!(await call('/expenses', { token: U })).some((e) => e._id === expenseC._id), 'replace removed C');
  const after = await call(`${M}/overview`, { token: A });
  const appAfter = after.databases.find((d) => d.key === 'application');
  for (const [name, count] of Object.entries(manifest.entities))
    if (name !== 'auditLog') assert.equal(appAfter.counts[name], count.count, `${name} count after replace`);

  const backups = await call(`${M}/backups`, { token: A });
  const preReplace = backups.find((b) => b.jobId === done2.id || String(b.jobId) === done2.id);
  assert(preReplace?.available && preReplace.verified, 'pre-replace backup available');
  await call(`${M}/backups/${preReplace.id}/restore`, { token: A, method: 'POST', body: { confirmation: 'nope' }, expect: 400 });
  const restoreJob = await call(`${M}/backups/${preReplace.id}/restore`, { token: A, method: 'POST', body: { confirmation: `RESTORE ${dbName}` } });
  const restored = await waitFor(A, restoreJob.id, (j) => j.status.startsWith('completed'));
  assert.equal(restored.status, 'completed');
  assert((await call('/expenses', { token: U })).some((e) => e._id === expenseC._id), 'recovery brought C back');

  // PostgreSQL as a source (read-only export), when connected.
  if (overview.databases.some((d) => d.key === 'postgresql' && d.connected)) {
    const pgExport = await call(`${M}/exports`, { token: A, method: 'POST', body: { source: 'postgresql', passphrase: PASS }, expect: 201 });
    assert.equal(pgExport.source.type, 'postgresql');
    const pgPkg = await call(`${M}/jobs/${pgExport.id}/package`, { token: A, binary: true });
    const pgJob = await call(`${M}/imports`, { token: A, method: 'POST', raw: pgPkg, headers: { 'x-file-name': 'pg.zip' }, expect: 201 });
    assert.equal(pgJob.source.type, 'postgresql');
    await call(`${M}/imports/${pgJob.id}/analyze`, { token: A, method: 'POST', body: { passphrase: PASS } });
    const pgReady = await waitFor(A, pgJob.id, (j) => j.status === 'ready');
    assert.equal(pgReady.analysis.totals.invalid, 0, 'PostgreSQL export validates cleanly');
    const pgSkip = await call(`${M}/imports/${pgJob.id}/preview?strategy=skip`, { token: A });
    assert.equal(pgSkip.destructive, false);
    await call(`${M}/imports/${pgJob.id}/discard`, { token: A, method: 'POST' });
  }

  // History and audit trail
  const history = await call(`${M}/jobs`, { token: A });
  assert(history.some((j) => j.type === 'export') && history.some((j) => j.type === 'import') && history.some((j) => j.type === 'restore'));
  const audit = await call(`${M}/audit`, { token: A });
  const actions = new Set(audit.items.map((i) => i.action));
  for (const action of ['access.denied', 'export.completed', 'export.downloaded', 'import.destructive.confirmed', 'backup.created', 'restore.confirmed', 'import.completed', 'import.conflicts.resolved'])
    assert(actions.has(action), `audit log missing ${action}`);
  console.log('Migration center tests passed: access control, export, encryption, upload validation, tamper detection, analysis, previews, manual/merge/skip/replace, confirmations, backups, recovery, PostgreSQL source, history, audit log.');
})().catch((error) => {
  console.error('Migration center test failed:', error.stack || error.message);
  process.exitCode = 1;
});
