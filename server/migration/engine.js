// Migration engine: export, upload, analysis (dry run), conflict resolution, execution with
// checkpoints and backups, recovery, and reporting. Database-independent: all storage access goes
// through adapters that speak the portable model.
const { ObjectId } = require('mongodb');
const { adapter } = require('./adapters');
const store = require('./store');
const { buildPackage, readManifest, openPackage } = require('./package');
const { encryptForServer, decryptFromServer, sha256, checkPassphrase } = require('./crypto');
const { ENTITIES, ENTITY, ENTITY_NAMES, validateRecord, normalize, keyOf, uniqueKeyOf, sameRecord } = require('./model');

const BATCH = 200;
const STALE_MS = 45_000;
const active = new Set(); // jobs being processed by this server process
const fail = (status, message) => Object.assign(new Error(message), { status });
const OWNED = ENTITIES.filter((e) => e.owner).map((e) => e.name);

// ---------------------------------------------------------------- job helpers
const jobs = () => store.collection(store.JOBS);
async function getJob(id) {
  if (!ObjectId.isValid(id)) throw fail(404, 'Migration job not found');
  const job = await jobs().findOne({ _id: new ObjectId(id) });
  if (!job) throw fail(404, 'Migration job not found');
  return job;
}
async function patchJob(id, set, extra = {}) {
  await jobs().updateOne({ _id: id }, { $set: { ...set, updatedAt: new Date() }, ...extra });
}
function isInterrupted(job) {
  return (
    ['running', 'analyzing'].includes(job.status) &&
    !active.has(String(job._id)) &&
    Date.now() - new Date(job.heartbeatAt || job.updatedAt).getTime() > STALE_MS
  );
}
function present(job) {
  const { checkpointData, ...rest } = job;
  return { ...rest, id: String(job._id), status: isInterrupted(job) ? 'interrupted' : job.status };
}
async function heartbeat(id) {
  await jobs().updateOne({ _id: id }, { $set: { heartbeatAt: new Date() } });
}
function startHeartbeat(id) {
  const timer = setInterval(() => heartbeat(id).catch(() => {}), 10_000);
  timer.unref?.();
  return () => clearInterval(timer);
}
async function assertNoRunningImport(exceptId) {
  const running = await jobs()
    .find({ type: { $in: ['import', 'restore'] }, status: 'running' })
    .toArray();
  const busy = running.find((job) => String(job._id) !== String(exceptId) && !isInterrupted(job));
  if (busy) throw fail(409, 'Another import is already running. Wait for it to finish.');
}
const actorOf = (user) => ({ id: user.id, email: user.email, name: user.name || null });

// ---------------------------------------------------------------- export
async function startExport({ sourceKey, passphrase, actor }) {
  checkPassphrase(passphrase);
  const source = adapter(sourceKey);
  const info = await source.info();
  const job = {
    _id: new ObjectId(),
    type: 'export',
    status: 'running',
    stage: 'Reading data',
    source: info,
    createdBy: actorOf(actor),
    createdAt: new Date(),
    updatedAt: new Date(),
    heartbeatAt: new Date(),
    progress: { processed: 0, total: 0 },
  };
  await jobs().insertOne(job);
  await store.audit(actor, 'export.started', { jobId: String(job._id), source: info.typeLabel, database: info.database });
  try {
    const entities = await source.exportAll(ENTITY_NAMES.filter((name) => source.supports(name)));
    const total = Object.values(entities).reduce((sum, list) => sum + list.length, 0);
    await patchJob(job._id, { stage: 'Encrypting package', progress: { processed: total, total } });
    const { manifest, buffer } = buildPackage({ entities, source: info, createdBy: actor, passphrase });
    const filename = `spendwise-${info.type}-${manifest.createdAt.slice(0, 19).replace(/[:T]/g, '-')}.swpkg.zip`;
    const fileId = await store.putFile(buffer, filename, { kind: 'package', jobId: String(job._id) });
    const counts = Object.fromEntries(Object.entries(entities).map(([name, list]) => [name, list.length]));
    const report = {
      title: 'Export report',
      jobId: String(job._id),
      packageId: manifest.packageId,
      formatVersion: manifest.formatVersion,
      source: info,
      createdBy: actorOf(actor),
      createdAt: manifest.createdAt,
      counts,
      totalRecords: total,
      bytes: buffer.length,
      sha256: sha256(buffer),
      encrypted: true,
    };
    const reportId = await store.putFile(Buffer.from(JSON.stringify(report, null, 2)), `export-report-${job._id}.json`, { kind: 'report' });
    await patchJob(job._id, {
      status: 'completed',
      stage: 'Completed',
      completedAt: new Date(),
      files: { package: fileId, report: reportId },
      package: { filename, bytes: buffer.length, packageId: manifest.packageId, formatVersion: manifest.formatVersion, sha256: report.sha256 },
      counts,
      totals: { records: total },
    });
    await store.audit(actor, 'export.completed', { jobId: String(job._id), records: total, packageId: manifest.packageId });
  } catch (error) {
    await patchJob(job._id, { status: 'failed', stage: 'Failed', error: error.message });
    await store.audit(actor, 'export.failed', { jobId: String(job._id), error: error.message });
    throw error;
  }
  return present(await getJob(job._id));
}

// ---------------------------------------------------------------- upload
async function registerUpload({ buffer, filename, actor }) {
  const { manifest } = readManifest(buffer); // validates format, version and structure
  const safeName = String(filename || 'package.zip').replace(/[^\w.\- ]+/g, '_').slice(0, 120);
  const fileId = await store.putFile(buffer, safeName, { kind: 'upload' });
  const job = {
    _id: new ObjectId(),
    type: 'import',
    status: 'uploaded',
    stage: 'Uploaded',
    upload: { filename: safeName, bytes: buffer.length, sha256: sha256(buffer) },
    source: {
      type: manifest.source?.databaseType || 'unknown',
      typeLabel: manifest.source?.databaseLabel || manifest.source?.databaseType || 'Unknown',
      version: manifest.source?.databaseVersion || null,
      database: manifest.source?.database || null,
    },
    package: {
      packageId: manifest.packageId,
      formatVersion: manifest.formatVersion,
      modelVersion: manifest.modelVersion,
      createdAt: manifest.createdAt,
      createdBy: manifest.createdBy || null,
      counts: Object.fromEntries(Object.entries(manifest.entities || {}).map(([name, e]) => [name, e.count])),
    },
    files: { upload: fileId },
    createdBy: actorOf(actor),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  await jobs().insertOne(job);
  await store.audit(actor, 'import.uploaded', { jobId: String(job._id), filename: safeName, packageId: manifest.packageId, source: job.source.typeLabel });
  return present(job);
}

// ---------------------------------------------------------------- analysis (dry run)
const SENSITIVE = (entity, field) => (entity.sensitive || []).includes(field);
function display(entity, field, value) {
  if (value === null || value === undefined) return '—';
  if (SENSITIVE(entity, field)) return '•••• (protected)';
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? '' : 's'}`;
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return text.length > 120 ? `${text.slice(0, 117)}…` : text;
}
function describe(entity, record) {
  if (!record) return '';
  switch (entity.name) {
    case 'users': return `${record.name || 'Unnamed'} <${record.email}>`;
    case 'expenses': return `${record.item || record.description || 'Expense'} · ${record.amount} · ${record.date.slice(0, 10)}`;
    case 'incomes': return `${record.source} · ${record.amount} · ${record.date.slice(0, 10)}`;
    case 'budgets': return `${record.year}-${String(record.month).padStart(2, '0')} · limit ${record.limit}`;
    case 'reminders': return `${record.title} · due ${record.dueDate.slice(0, 10)}`;
    case 'passwordVaults': return 'Encrypted password vault';
    case 'scheduledMessages': return `${record.contactName} · ${record.frequency}`;
    case 'hiddenRecoveryEmails': return `PIN recovery email · ${record.expiresAt.slice(0, 10)}`;
    default: return record.action || keyOf(entity, record);
  }
}

// Validates package records. Returns { staged: {name: [normalized]}, invalid: [{entity,key,reason}] }.
function validatePackage(entities, onProgress) {
  const staged = {};
  const invalid = [];
  let processed = 0;
  for (const entity of ENTITIES) {
    const list = entities[entity.name];
    if (!list) continue;
    staged[entity.name] = [];
    const seenKeys = new Set();
    const seenUnique = (entity.unique || []).map(() => new Set());
    for (const raw of list) {
      processed += 1;
      const key = raw && raw[entity.key] != null ? String(raw[entity.key]) : `#${processed}`;
      const problems = validateRecord(entity, raw);
      if (problems.length) {
        invalid.push({ entity: entity.name, key, reason: problems.slice(0, 3).join('; ') });
        continue;
      }
      const record = normalize(entity, raw);
      if (seenKeys.has(key)) {
        invalid.push({ entity: entity.name, key, reason: 'appears more than once in the package' });
        continue;
      }
      const clash = (entity.unique || []).findIndex((fields, i) => seenUnique[i].has(uniqueKeyOf(fields, record)));
      if (clash >= 0) {
        invalid.push({ entity: entity.name, key, reason: `duplicates another record's ${entity.unique[clash].join(' + ')}` });
        continue;
      }
      seenKeys.add(key);
      (entity.unique || []).forEach((fields, i) => seenUnique[i].add(uniqueKeyOf(fields, record)));
      staged[entity.name].push(record);
      if (processed % 500 === 0) onProgress?.(processed);
    }
  }
  return { staged, invalid };
}

function indexDestination(snapshot) {
  const index = {};
  for (const entity of ENTITIES) {
    const list = snapshot[entity.name] || [];
    index[entity.name] = {
      byKey: new Map(list.map((r) => [keyOf(entity, r), r])),
      unique: (entity.unique || []).map((fields) => new Map(list.map((r) => [uniqueKeyOf(fields, r), keyOf(entity, r)]))),
    };
  }
  return index;
}

// Classifies each staged record against the destination: new | identical | conflict.
function classify(staged, snapshot, supports) {
  const index = indexDestination(snapshot);
  const result = {};
  for (const entity of ENTITIES) {
    const list = staged[entity.name];
    if (!list) continue;
    result[entity.name] = list.map((record) => {
      const key = keyOf(entity, record);
      if (!supports(entity.name)) return { key, record, kind: 'unsupported' };
      const existing = index[entity.name].byKey.get(key);
      if (existing)
        return sameRecord(existing, record) || entity.appendOnly
          ? { key, record, kind: 'identical' }
          : { key, record, kind: 'conflict', conflict: 'record', existingKey: key, existing };
      for (const [i, fields] of (entity.unique || []).entries()) {
        const otherKey = index[entity.name].unique[i].get(uniqueKeyOf(fields, record));
        if (otherKey)
          return { key, record, kind: 'conflict', conflict: 'unique', fields, existingKey: otherKey, existing: index[entity.name].byKey.get(otherKey) };
      }
      return { key, record, kind: 'new' };
    });
  }
  return result;
}

async function loadStaged(job) {
  if (!job.files?.staging) throw fail(409, 'This package has not been analysed yet');
  return JSON.parse(decryptFromServer(await store.getFile(job.files.staging)).toString('utf8'));
}

async function startAnalysis({ jobId, passphrase, destinationKey, actor }) {
  const job = await getJob(jobId);
  if (job.type !== 'import') throw fail(400, 'Only imports can be analysed');
  if (!['uploaded', 'ready', 'failed'].includes(job.status) || (job.status === 'failed' && job.executedAt))
    throw fail(409, 'This package can no longer be re-analysed');
  const destination = adapter(destinationKey);
  const destinationInfo = await destination.info();
  // Decrypt synchronously so a wrong passphrase is reported straight away.
  const { entities } = openPackage(await store.getFile(job.files.upload), passphrase);
  await patchJob(job._id, {
    status: 'analyzing',
    stage: 'Validating records',
    destination: destinationInfo,
    heartbeatAt: new Date(),
    progress: { processed: 0, total: Object.values(entities).reduce((s, l) => s + l.length, 0) },
    error: null,
  });
  await store.audit(actor, 'import.analysis.started', { jobId, destination: destinationInfo.typeLabel, database: destinationInfo.database });
  active.add(String(job._id));
  const stop = startHeartbeat(job._id);
  (async () => {
    try {
      const { staged, invalid } = validatePackage(entities, (processed) =>
        patchJob(job._id, { 'progress.processed': processed }).catch(() => {}),
      );
      await patchJob(job._id, { stage: 'Comparing with destination' });
      const supports = (name) => destination.supports(name);
      const snapshot = await destination.exportAll(ENTITY_NAMES.filter(supports));
      const classified = classify(staged, snapshot, supports);

      // Persist conflicts (sensitive values redacted) for review and manual resolution.
      await store.collection(store.CONFLICTS).deleteMany({ jobId: job._id });
      const conflictDocs = [];
      let seq = 0;
      const summary = {};
      for (const entity of ENTITIES) {
        if (!entities[entity.name]) continue;
        const items = classified[entity.name] || [];
        const count = (kind) => items.filter((i) => i.kind === kind).length;
        summary[entity.name] = {
          label: entity.label,
          inPackage: entities[entity.name].length,
          invalid: invalid.filter((i) => i.entity === entity.name).length,
          new: count('new'),
          identical: count('identical'),
          conflicts: count('conflict'),
          unsupported: count('unsupported'),
          inDestination: snapshot[entity.name]?.length ?? null,
          supported: supports(entity.name),
        };
        for (const item of items.filter((i) => i.kind === 'conflict')) {
          const fields = Object.keys(entity.fields)
            .filter((field) => JSON.stringify(item.record[field]) !== JSON.stringify(item.existing[field]))
            .map((field) => ({
              field,
              existing: display(entity, field, item.existing[field]),
              incoming: display(entity, field, item.record[field]),
            }));
          conflictDocs.push({
            jobId: job._id,
            cid: `${entity.name}:${item.key}`,
            seq: seq++,
            entity: entity.name,
            entityLabel: entity.label,
            kind: item.conflict,
            key: item.key,
            existingKey: item.existingKey,
            uniqueFields: item.fields || null,
            incomingLabel: describe(entity, item.record),
            existingLabel: describe(entity, item.existing),
            fields,
            decision: null,
          });
        }
      }
      for (let i = 0; i < conflictDocs.length; i += 1000)
        await store.collection(store.CONFLICTS).insertMany(conflictDocs.slice(i, i + 1000));

      await patchJob(job._id, { stage: 'Saving analysis' });
      if (job.files?.staging) await store.deleteFile(job.files.staging);
      const stagingId = await store.putFile(
        encryptForServer(Buffer.from(JSON.stringify({ staged, invalid }))),
        `staging-${job._id}.bin`,
        { kind: 'staging', jobId: String(job._id) },
      );
      const totals = Object.values(summary).reduce(
        (acc, s) => ({
          inPackage: acc.inPackage + s.inPackage,
          invalid: acc.invalid + s.invalid,
          new: acc.new + s.new,
          identical: acc.identical + s.identical,
          conflicts: acc.conflicts + s.conflicts,
          unsupported: acc.unsupported + s.unsupported,
        }),
        { inPackage: 0, invalid: 0, new: 0, identical: 0, conflicts: 0, unsupported: 0 },
      );
      await patchJob(job._id, {
        status: 'ready',
        stage: 'Ready for review',
        'files.staging': stagingId,
        analysis: { analyzedAt: new Date(), summary, totals, invalid: invalid.slice(0, 200), invalidCount: invalid.length },
        'progress.processed': totals.inPackage,
      });
      await store.audit(actor, 'import.analysis.completed', { jobId, ...totals });
    } catch (error) {
      await patchJob(job._id, { status: 'failed', stage: 'Analysis failed', error: error.message });
      await store.audit(actor, 'import.analysis.failed', { jobId, error: error.message });
    } finally {
      stop();
      active.delete(String(job._id));
    }
  })();
  return present(await getJob(job._id));
}

// ---------------------------------------------------------------- conflict resolution
async function listConflicts(jobId, { entity, page = 1, pageSize = 25 }) {
  const job = await getJob(jobId);
  const filter = { jobId: job._id, ...(entity ? { entity } : {}) };
  const [items, total, byEntity, decided] = await Promise.all([
    store.collection(store.CONFLICTS).find(filter).sort({ seq: 1 }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    store.collection(store.CONFLICTS).countDocuments(filter),
    store.collection(store.CONFLICTS).aggregate([{ $match: { jobId: job._id } }, { $group: { _id: '$entity', count: { $sum: 1 } } }]).toArray(),
    store.collection(store.CONFLICTS).countDocuments({ jobId: job._id, decision: 'incoming' }),
  ]);
  return {
    items: items.map(({ _id, jobId: _j, ...rest }) => rest),
    total,
    page,
    pageSize,
    keepIncoming: decided,
    byEntity: Object.fromEntries(byEntity.map((e) => [e._id, e.count])),
  };
}

async function setDecisions(jobId, { decisions = {}, bulk = null }, actor) {
  const job = await getJob(jobId);
  if (job.status !== 'ready') throw fail(409, 'Conflicts can only be resolved before the import starts');
  const conflicts = store.collection(store.CONFLICTS);
  let changed = 0;
  if (bulk) {
    if (!['existing', 'incoming'].includes(bulk.choice)) throw fail(400, 'Choose existing or incoming');
    const filter = { jobId: job._id, ...(bulk.entity ? { entity: String(bulk.entity) } : {}) };
    changed += (await conflicts.updateMany(filter, { $set: { decision: bulk.choice } })).modifiedCount;
  }
  const entries = Object.entries(decisions);
  if (entries.length > 1000) throw fail(400, 'Too many decisions in one request');
  for (const [cid, choice] of entries) {
    if (!['existing', 'incoming'].includes(choice)) throw fail(400, 'Choose existing or incoming');
    changed += (await conflicts.updateOne({ jobId: job._id, cid: String(cid) }, { $set: { decision: choice } })).modifiedCount;
  }
  await store.audit(actor, 'import.conflicts.resolved', {
    jobId,
    bulk: bulk ? { entity: bulk.entity || 'all', choice: bulk.choice } : null,
    individual: entries.length,
    changed,
  });
  return { changed };
}

// ---------------------------------------------------------------- planning
// Builds the exact list of removals and writes for a strategy. Used for the dry-run preview and
// again (against fresh destination data) when the import actually runs.
async function buildPlan(job, strategy, { adminId } = {}) {
  if (!['replace', 'merge', 'skip', 'manual'].includes(strategy)) throw fail(400, 'Choose an import strategy');
  const destination = adapter(job.destination?.key);
  const supports = (name) => destination.supports(name);
  const { staged, invalid } = await loadStaged(job);
  const snapshot = await destination.exportAll(ENTITY_NAMES.filter(supports));
  const classified = classify(staged, snapshot, supports);
  const decisionsList = await store.collection(store.CONFLICTS).find({ jobId: job._id }, { projection: { cid: 1, decision: 1 } }).toArray();
  const known = new Set(decisionsList.map((d) => d.cid));
  const decisions = new Map(decisionsList.map((d) => [d.cid, d.decision]));
  const choose = (cid) =>
    strategy === 'merge' ? 'incoming' : strategy === 'skip' ? 'existing' : decisions.get(cid) || 'existing';

  const entities = {};
  const removals = []; // { entity, all?, keys?, ownedBy? }
  const writes = {}; // name -> [{ record, op: 'insert'|'update' }]
  const warnings = [];
  let newConflicts = 0;
  const stat = (name) =>
    (entities[name] ??= { label: ENTITY[name].label, insert: 0, update: 0, skip: 0, fail: 0, remove: 0, skipped: [], failed: [] });
  for (const item of invalid) {
    const s = stat(item.entity);
    s.fail += 1;
    s.failed.push({ key: item.key, reason: item.reason });
  }

  const destUsers = new Set((snapshot.users || []).map((u) => u.id));
  const finalUsers = new Set(destUsers);
  const skippedIncomingUsers = new Set();
  const removedUsers = new Set();

  if (strategy === 'replace') {
    for (const entity of [...ENTITIES].reverse()) {
      if (!supports(entity.name) || entity.appendOnly) continue;
      removals.push({ entity: entity.name, all: true });
      stat(entity.name).remove = snapshot[entity.name]?.length || 0;
    }
    finalUsers.clear();
    for (const u of staged.users || []) finalUsers.add(u.id);
  }

  for (const entity of ENTITIES) {
    for (const item of classified[entity.name] || []) {
      const s = stat(entity.name);
      const skip = (reason) => {
        s.skip += 1;
        if (s.skipped.length < 1000) s.skipped.push({ key: item.key, reason });
      };
      const write = (op) => {
        (writes[entity.name] ??= []).push({ record: item.record, op });
        s[op] += 1;
      };
      if (item.kind === 'unsupported') {
        skip(`not supported by ${job.destination.typeLabel}`);
        continue;
      }
      if (entity.owner) {
        const owner = item.record[entity.owner];
        if (!finalUsers.has(owner)) {
          if (skippedIncomingUsers.has(owner)) skip('its account was kept as the existing version');
          else {
            s.fail += 1;
            if (s.failed.length < 1000) s.failed.push({ key: item.key, reason: 'its user account is not in the package or the destination' });
          }
          continue;
        }
      }
      if (strategy === 'replace') {
        if (entity.appendOnly && item.kind !== 'new') skip('already present');
        else write('insert');
        continue;
      }
      if (item.kind === 'new') write('insert');
      else if (item.kind === 'identical') skip(entity.appendOnly ? 'already present' : 'identical record already present');
      else {
        const cid = `${entity.name}:${item.key}`;
        if (!known.has(cid)) newConflicts += 1;
        if (choose(cid) === 'existing') {
          skip('conflict resolved: kept existing');
          if (entity.name === 'users' && item.conflict === 'unique' && !destUsers.has(item.key)) skippedIncomingUsers.add(item.key);
          continue;
        }
        if (item.conflict === 'unique') {
          // The incoming record takes over a unique value (e.g. an email address) held by a
          // different existing record, which is removed first.
          removals.push({ entity: entity.name, keys: [item.existingKey] });
          s.remove += 1;
          if (entity.name === 'users') {
            removedUsers.add(item.existingKey);
            finalUsers.delete(item.existingKey);
            for (const owned of OWNED) {
              if (!supports(owned)) continue;
              const n = (snapshot[owned] || []).filter((r) => r[ENTITY[owned].owner] === item.existingKey).length;
              if (n) {
                removals.push({ entity: owned, ownedBy: [item.existingKey] });
                stat(owned).remove += n;
              }
            }
            finalUsers.add(item.key);
          }
          write('insert');
        } else write('update');
      }
    }
  }

  const removeTotal = Object.values(entities).reduce((n, s) => n + s.remove, 0);
  const updateTotal = Object.values(entities).reduce((n, s) => n + s.update, 0);
  const destructive = strategy === 'replace' || removeTotal > 0 || updateTotal > 0;
  if (adminId && destructive && !finalUsers.has(adminId))
    warnings.push('Your administrator account is not part of the resulting data. You will be signed out when the import finishes.');
  if (adminId && removedUsers.has(adminId))
    warnings.push('Your own account will be replaced by an incoming account with the same email address.');
  if (newConflicts)
    warnings.push(`${newConflicts} conflict${newConflicts === 1 ? '' : 's'} appeared after the analysis; ${strategy === 'manual' ? 'they will keep the existing version' : `they follow the ${strategy} strategy`}.`);
  if (strategy === 'replace' && invalid.length)
    warnings.push('Replace is blocked because the package has invalid records. Fix the package or choose another strategy.');
  if (process.env.NODE_ENV === 'production' && destructive)
    warnings.push('The destination is a production database.');

  const totals = Object.values(entities).reduce(
    (t, s) => ({ insert: t.insert + s.insert, update: t.update + s.update, skip: t.skip + s.skip, fail: t.fail + s.fail, remove: t.remove + s.remove }),
    { insert: 0, update: 0, skip: 0, fail: 0, remove: 0 },
  );
  return { strategy, destructive, blocked: strategy === 'replace' && invalid.length > 0, entities, totals, removals, writes, warnings, newConflicts };
}

const summarizePlan = ({ removals, writes, ...rest }) => ({
  ...rest,
  entities: Object.fromEntries(
    Object.entries(rest.entities).map(([name, s]) => [name, { ...s, skipped: s.skipped.slice(0, 50), failed: s.failed.slice(0, 50) }]),
  ),
});

async function preview(jobId, strategy, actor) {
  const job = await getJob(jobId);
  if (job.status !== 'ready') throw fail(409, 'The package must be analysed first');
  const plan = await buildPlan(job, strategy, { adminId: actor.id });
  return { ...summarizePlan(plan), confirmationPhrase: confirmationPhrase(job, strategy) };
}

function confirmationPhrase(job, strategy) {
  const target = job.destination?.database || job.destination?.typeLabel || 'database';
  return strategy === 'replace' ? `REPLACE ${target}` : `OVERWRITE ${target}`;
}

// ---------------------------------------------------------------- backups
async function createBackup(destination, { jobId, actor, reason }) {
  const info = await destination.info();
  const entities = await destination.exportAll(ENTITY_NAMES.filter((n) => destination.supports(n)));
  const counts = Object.fromEntries(Object.entries(entities).map(([n, l]) => [n, l.length]));
  const payload = Buffer.from(JSON.stringify({ entities }));
  const digest = sha256(payload);
  const fileId = await store.putFile(encryptForServer(payload), `backup-${Date.now()}.bin`, { kind: 'backup', jobId: String(jobId) });
  // Verify: read the stored copy back, decrypt it and compare digest and counts.
  const check = decryptFromServer(await store.getFile(fileId));
  const parsed = JSON.parse(check.toString('utf8'));
  const verified =
    sha256(check) === digest &&
    Object.entries(counts).every(([n, c]) => (parsed.entities[n] || []).length === c);
  const backup = {
    _id: new ObjectId(),
    createdAt: new Date(),
    jobId,
    reason,
    destination: info,
    counts,
    totalRecords: Object.values(counts).reduce((a, b) => a + b, 0),
    fileId,
    sha256: digest,
    verified,
    verifiedAt: verified ? new Date() : null,
    createdBy: actor ? actorOf(actor) : null,
  };
  await store.collection(store.BACKUPS).insertOne(backup);
  await store.audit(actor, verified ? 'backup.created' : 'backup.verification_failed', {
    backupId: String(backup._id), jobId: String(jobId), database: info.database, records: backup.totalRecords,
  });
  if (!verified) throw new Error('The safety backup could not be verified, so no changes were made');
  return backup;
}

// ---------------------------------------------------------------- execution
async function startExecution({ jobId, strategy, confirmation, actor }) {
  const job = await getJob(jobId);
  if (job.status !== 'ready') throw fail(409, 'This import is not ready to run');
  await assertNoRunningImport(job._id);
  const plan = await buildPlan(job, strategy, { adminId: actor.id });
  if (plan.blocked) throw fail(400, 'Replace is blocked because the package has invalid records');
  const phrase = confirmationPhrase(job, strategy);
  if (plan.destructive && confirmation !== phrase)
    throw fail(400, `Type "${phrase}" to confirm changes to existing data`);
  // Freeze the plan: a resumed import must continue the exact same list of operations.
  const planId = await store.putFile(
    encryptForServer(Buffer.from(JSON.stringify({ removals: plan.removals, writes: plan.writes, summary: summarizePlan(plan) }))),
    `plan-${job._id}.bin`,
    { kind: 'plan', jobId: String(job._id) },
  );
  const claimed = await jobs().findOneAndUpdate(
    { _id: job._id, status: 'ready' },
    {
      $set: {
        'files.plan': planId,
        status: 'running',
        stage: plan.destructive ? 'Creating safety backup' : 'Importing records',
        strategy,
        destructive: plan.destructive,
        executedAt: new Date(),
        executedBy: actorOf(actor),
        heartbeatAt: new Date(),
        checkpoint: { stage: plan.destructive ? 'backup' : 'remove', entityIndex: 0, offset: 0 },
        plannedTotals: plan.totals,
        warnings: plan.warnings,
        progress: { processed: 0, total: plan.totals.insert + plan.totals.update, inserted: 0, updated: 0, skipped: plan.totals.skip, failed: plan.totals.fail, removed: 0 },
        updatedAt: new Date(),
      },
    },
    { returnDocument: 'after' },
  );
  if (!claimed) {
    await store.deleteFile(planId);
    throw fail(409, 'This import has already started');
  }
  await store.audit(actor, plan.destructive ? 'import.destructive.confirmed' : 'import.started', {
    jobId, strategy, destination: job.destination?.typeLabel, database: job.destination?.database, planned: plan.totals,
  });
  run(claimed, actor);
  return present(claimed);
}

async function resume(jobId, actor) {
  const job = await getJob(jobId);
  if (!isInterrupted(job) || !['import', 'restore'].includes(job.type) || job.status !== 'running')
    throw fail(409, 'Only interrupted imports can be resumed');
  await assertNoRunningImport(job._id);
  await patchJob(job._id, { heartbeatAt: new Date(), stage: 'Resuming' });
  await store.audit(actor, 'import.resumed', {
    jobId,
    checkpoint: { stage: job.checkpoint?.stage, entityIndex: job.checkpoint?.entityIndex, offset: job.checkpoint?.offset },
  });
  run(await getJob(job._id), actor);
  return present(await getJob(job._id));
}

function run(job, actor) {
  const id = String(job._id);
  if (active.has(id)) return;
  active.add(id);
  const stop = startHeartbeat(job._id);
  execute(job, actor)
    .catch(async (error) => {
      await patchJob(job._id, { status: 'failed', stage: 'Failed', error: error.message, failedAt: new Date() });
      await store.audit(actor, 'import.failed', { jobId: id, error: error.message, backupId: job.checkpoint?.backupId || null });
      await writeReport(await getJob(job._id), null).catch(() => {});
    })
    .finally(() => {
      stop();
      active.delete(id);
    });
}

async function execute(job, actor) {
  const destination = adapter(job.destination.key);
  let checkpoint = { ...job.checkpoint };
  const save = (set = {}) => patchJob(job._id, { checkpoint, heartbeatAt: new Date(), ...set });

  // Stage 1: verified safety backup before anything destructive.
  if (checkpoint.stage === 'backup') {
    if (!checkpoint.backupId) {
      const backup = await createBackup(destination, { jobId: job._id, actor, reason: `Before ${job.type} ${job.strategy}` });
      checkpoint.backupId = backup._id;
      await patchJob(job._id, { backupId: backup._id });
    }
    checkpoint = { ...checkpoint, stage: 'remove', entityIndex: 0, offset: 0 };
    await save({ stage: 'Applying changes' });
  }

  // Atomic destinations (PostgreSQL) roll back on failure, so they always restart these stages.
  if (destination.atomic && ['remove', 'write'].includes(checkpoint.stage)) {
    checkpoint = { ...checkpoint, stage: 'remove', entityIndex: 0, offset: 0 };
    await save({ 'progress.inserted': 0, 'progress.updated': 0, 'progress.removed': 0, 'progress.processed': 0 });
  }

  const frozen = JSON.parse(decryptFromServer(await store.getFile(job.files.plan)).toString('utf8'));
  const plan = { ...frozen.summary, removals: frozen.removals, writes: frozen.writes };
  const order = ENTITIES.map((e) => e.name).filter((n) => plan.writes[n]?.length);

  const applyChanges = async () => {
    if (checkpoint.stage === 'remove') {
      let removed = 0;
      for (const removal of plan.removals) {
        if (removal.all) removed += await destination.removeAll(removal.entity);
        else if (removal.ownedBy) removed += await destination.removeOwnedBy(removal.entity, removal.ownedBy);
        else removed += await destination.remove(removal.entity, removal.keys);
      }
      checkpoint = { ...checkpoint, stage: 'write', entityIndex: 0, offset: 0 };
      await save({ 'progress.removed': removed, stage: 'Importing records' });
    }
    if (checkpoint.stage === 'write') {
      for (let e = checkpoint.entityIndex; e < order.length; e++) {
        const name = order[e];
        const list = plan.writes[name];
        for (let offset = e === checkpoint.entityIndex ? checkpoint.offset : 0; offset < list.length; offset += BATCH) {
          const batch = list.slice(offset, offset + BATCH);
          await destination.upsert(name, batch.map((w) => w.record));
          const inserted = batch.filter((w) => w.op === 'insert').length;
          checkpoint = { ...checkpoint, entityIndex: offset + BATCH >= list.length ? e + 1 : e, offset: offset + BATCH >= list.length ? 0 : offset + BATCH };
          await jobs().updateOne(
            { _id: job._id },
            {
              $set: { checkpoint, heartbeatAt: new Date(), stage: `Importing ${ENTITY[name].label.toLowerCase()}`, updatedAt: new Date() },
              $inc: { 'progress.processed': batch.length, 'progress.inserted': inserted, 'progress.updated': batch.length - inserted },
            },
          );
        }
      }
      checkpoint = { ...checkpoint, stage: 'verify', entityIndex: 0, offset: 0 };
      await save({ stage: 'Verifying imported data' });
    }
  };
  if (destination.atomic && checkpoint.stage !== 'verify') await destination.runAtomic(applyChanges);
  else await applyChanges();

  // Stage 3: read everything back and compare with what was written.
  const snapshot = await destination.exportAll(order);
  let verified = 0;
  const mismatches = [];
  for (const name of order) {
    const entity = ENTITY[name];
    const byKey = new Map((snapshot[name] || []).map((r) => [keyOf(entity, r), r]));
    for (const { record } of plan.writes[name]) {
      if (byKey.has(keyOf(entity, record)) && sameRecord(byKey.get(keyOf(entity, record)), record)) verified += 1;
      else if (mismatches.length < 500) mismatches.push({ entity: name, key: keyOf(entity, record) });
    }
  }
  const final = await getJob(job._id);
  const status = mismatches.length || final.progress.failed ? 'completed_with_issues' : 'completed';
  checkpoint = { ...checkpoint, stage: 'done' };
  await patchJob(job._id, {
    status,
    stage: 'Completed',
    completedAt: new Date(),
    checkpoint,
    verification: { verified, mismatched: mismatches.length, mismatches },
    planSummary: summarizePlan(plan),
  });
  await store.audit(actor, 'import.completed', {
    jobId: String(job._id), status, strategy: job.strategy, inserted: final.progress.inserted, updated: final.progress.updated,
    removed: final.progress.removed, skipped: final.progress.skipped, failed: final.progress.failed, verified,
  });
  await writeReport(await getJob(job._id), plan);
}

async function writeReport(job, plan) {
  const report = {
    title: job.type === 'restore' ? 'Recovery report' : 'Import report',
    jobId: String(job._id),
    status: job.status,
    strategy: job.strategy,
    source: job.source,
    package: job.package || null,
    destination: job.destination,
    startedAt: job.executedAt,
    finishedAt: job.completedAt || job.failedAt || new Date(),
    administrator: job.executedBy,
    backup: job.backupId ? { backupId: String(job.backupId) } : null,
    progress: job.progress,
    plannedTotals: job.plannedTotals,
    perEntity: plan ? summarizePlan(plan).entities : job.planSummary?.entities || null,
    verification: job.verification || null,
    warnings: job.warnings || [],
    error: job.error || null,
  };
  const reportId = await store.putFile(Buffer.from(JSON.stringify(report, null, 2)), `import-report-${job._id}.json`, { kind: 'report' });
  await patchJob(job._id, { 'files.report': reportId });
}

// ---------------------------------------------------------------- recovery
async function startRestore({ backupId, confirmation, actor }) {
  if (!ObjectId.isValid(backupId)) throw fail(404, 'Backup not found');
  const backup = await store.collection(store.BACKUPS).findOne({ _id: new ObjectId(backupId) });
  if (!backup) throw fail(404, 'Backup not found');
  if (!backup.verified || !(await store.fileExists(backup.fileId))) throw fail(409, 'This backup is not available');
  await assertNoRunningImport();
  const destination = adapter(backup.destination.key);
  const destinationInfo = await destination.info();
  const phrase = `RESTORE ${destinationInfo.database || destinationInfo.typeLabel}`;
  if (confirmation !== phrase) throw fail(400, `Type "${phrase}" to confirm the recovery`);
  const { entities } = JSON.parse(decryptFromServer(await store.getFile(backup.fileId)).toString('utf8'));
  const stagingId = await store.putFile(encryptForServer(Buffer.from(JSON.stringify({ staged: entities, invalid: [] }))), `restore-${backup._id}.bin`, { kind: 'staging' });
  const job = {
    _id: new ObjectId(),
    type: 'restore',
    status: 'ready',
    stage: 'Ready',
    source: { type: 'backup', typeLabel: 'Safety backup', database: backup.destination.database, backupId: String(backup._id), takenAt: backup.createdAt },
    destination: destinationInfo,
    files: { staging: stagingId },
    createdBy: actorOf(actor),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  await jobs().insertOne(job);
  await store.audit(actor, 'restore.confirmed', { jobId: String(job._id), backupId: String(backup._id), database: destinationInfo.database });
  return startExecution({ jobId: String(job._id), strategy: 'replace', confirmation: confirmationPhrase(job, 'replace'), actor });
}

async function discard(jobId, actor) {
  const job = await getJob(jobId);
  if (!['uploaded', 'ready', 'failed'].includes(job.status) || job.type !== 'import' || job.executedAt)
    throw fail(409, 'Only imports that have not run can be discarded');
  for (const key of ['upload', 'staging']) if (job.files?.[key]) await store.deleteFile(job.files[key]);
  await store.collection(store.CONFLICTS).deleteMany({ jobId: job._id });
  await patchJob(job._id, { status: 'discarded', stage: 'Discarded', 'files.upload': null, 'files.staging': null });
  await store.audit(actor, 'import.discarded', { jobId });
  return present(await getJob(job._id));
}

module.exports = {
  getJob, present, startExport, registerUpload, startAnalysis, listConflicts, setDecisions, preview,
  startExecution, resume, startRestore, discard, isInterrupted,
};
