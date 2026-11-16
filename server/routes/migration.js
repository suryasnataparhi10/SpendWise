// Database Migration & Portability Center API (administrators only). All database work happens
// here on the server; responses never include connection strings or credentials.
const express = require('express');
const { ObjectId } = require('mongodb');
const auth = require('../middleware/auth');
const { requireAdmin, loadAdmin, adminEmails } = require('../middleware/admin');
const { describeAll } = require('../migration/adapters');
const engine = require('../migration/engine');
const store = require('../migration/store');
const { MIN_PASSPHRASE } = require('../migration/crypto');
const { ENTITIES } = require('../migration/model');
const { ok, fail, wrap } = require('../utils/http');

const router = express.Router();
const MAX_UPLOAD_MB = Number(process.env.MIGRATION_MAX_UPLOAD_MB) || 200;

router.param('id', (req, res, next, id) => (ObjectId.isValid(id) ? next() : next(fail(404, 'Not found'))));
router.use(auth);
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  store.ensureIndexes().then(() => next(), next);
});

// Lets the website decide whether to show the section. Not an error for non-administrators.
router.get(
  '/access',
  wrap(async (req, res) => {
    ok(res, { isAdmin: Boolean(await loadAdmin(req.uid)), configured: adminEmails().size > 0 });
  }),
);

router.use(
  requireAdmin((req) =>
    store.audit({ id: req.uid, email: 'unknown' }, 'access.denied', { method: req.method, path: req.originalUrl.split('?')[0] }),
  ),
);

router.get(
  '/overview',
  wrap(async (req, res) => {
    const [databases, running] = await Promise.all([
      describeAll(),
      store.collection(store.JOBS).find({ status: { $in: ['running', 'analyzing'] } }).toArray(),
    ]);
    ok(res, {
      databases,
      entities: ENTITIES.map(({ name, label }) => ({ name, label })),
      environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
      limits: { maxUploadBytes: MAX_UPLOAD_MB * 1024 * 1024, minPassphrase: MIN_PASSPHRASE },
      activeJobs: running.map(engine.present),
      administrator: req.admin,
    });
  }),
);

// ----- export
router.post(
  '/exports',
  wrap(async (req, res) => {
    const job = await engine.startExport({
      sourceKey: String(req.body?.source || 'application'),
      passphrase: req.body?.passphrase,
      actor: req.admin,
    });
    ok(res, job, 'Export package created', 201);
  }),
);

// ----- history and downloads
router.get(
  '/jobs',
  wrap(async (req, res) => {
    const filter = ['export', 'import', 'restore'].includes(req.query.type) ? { type: req.query.type } : {};
    const list = await store.collection(store.JOBS).find(filter).sort({ createdAt: -1 }).limit(100).toArray();
    ok(res, list.map(engine.present));
  }),
);

router.get(
  '/jobs/:id',
  wrap(async (req, res) => ok(res, engine.present(await engine.getJob(req.params.id)))),
);

async function sendFile(res, fileId, filename, type) {
  if (!fileId || !(await store.fileExists(fileId))) throw fail(404, 'That file is no longer available');
  const buffer = await store.getFile(fileId);
  res.set({
    'Content-Type': type,
    'Content-Disposition': `attachment; filename="${filename.replace(/"/g, '')}"`,
    'Content-Length': buffer.length,
  });
  res.end(buffer);
}

router.get(
  '/jobs/:id/package',
  wrap(async (req, res) => {
    const job = await engine.getJob(req.params.id);
    if (job.type !== 'export') throw fail(400, 'Only exports have a downloadable package');
    await store.audit(req.admin, 'export.downloaded', { jobId: req.params.id, packageId: job.package?.packageId });
    await sendFile(res, job.files?.package, job.package?.filename || 'spendwise-package.swpkg.zip', 'application/zip');
  }),
);

router.get(
  '/jobs/:id/report',
  wrap(async (req, res) => {
    const job = await engine.getJob(req.params.id);
    await sendFile(res, job.files?.report, `${job.type}-report-${job._id}.json`, 'application/json');
  }),
);

router.post(
  '/jobs/:id/resume',
  wrap(async (req, res) => ok(res, await engine.resume(req.params.id, req.admin), 'Import resumed')),
);

// ----- import
router.post(
  '/imports',
  express.raw({ type: 'application/octet-stream', limit: `${MAX_UPLOAD_MB}mb` }),
  wrap(async (req, res) => {
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw fail(400, 'Choose a migration package to upload');
    const job = await engine.registerUpload({ buffer: req.body, filename: req.get('x-file-name'), actor: req.admin });
    ok(res, job, 'Package uploaded', 201);
  }),
);

router.post(
  '/imports/:id/analyze',
  wrap(async (req, res) => {
    const job = await engine.startAnalysis({
      jobId: req.params.id,
      passphrase: req.body?.passphrase,
      destinationKey: String(req.body?.destination || 'application'),
      actor: req.admin,
    });
    ok(res, job, 'Analysis started');
  }),
);

router.get(
  '/imports/:id/conflicts',
  wrap(async (req, res) => {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 25));
    const entity = ENTITIES.some((e) => e.name === req.query.entity) ? req.query.entity : null;
    ok(res, await engine.listConflicts(req.params.id, { entity, page, pageSize }));
  }),
);

router.post(
  '/imports/:id/decisions',
  wrap(async (req, res) => ok(res, await engine.setDecisions(req.params.id, req.body || {}, req.admin), 'Decisions saved')),
);

router.get(
  '/imports/:id/preview',
  wrap(async (req, res) => ok(res, await engine.preview(req.params.id, String(req.query.strategy || ''), req.admin))),
);

router.post(
  '/imports/:id/execute',
  wrap(async (req, res) => {
    const job = await engine.startExecution({
      jobId: req.params.id,
      strategy: String(req.body?.strategy || ''),
      confirmation: req.body?.confirmation,
      actor: req.admin,
    });
    ok(res, job, 'Import started');
  }),
);

router.post(
  '/imports/:id/discard',
  wrap(async (req, res) => ok(res, await engine.discard(req.params.id, req.admin), 'Upload discarded')),
);

// ----- backups and recovery
router.get(
  '/backups',
  wrap(async (req, res) => {
    const backups = await store.collection(store.BACKUPS).find({}).sort({ createdAt: -1 }).limit(100).toArray();
    const out = [];
    for (const { fileId, ...backup } of backups)
      out.push({ ...backup, id: String(backup._id), available: backup.verified && (await store.fileExists(fileId)) });
    ok(res, out);
  }),
);

router.post(
  '/backups/:id/restore',
  wrap(async (req, res) => {
    const job = await engine.startRestore({ backupId: req.params.id, confirmation: req.body?.confirmation, actor: req.admin });
    ok(res, job, 'Recovery started');
  }),
);

// ----- audit log
router.get(
  '/audit',
  wrap(async (req, res) => {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const [items, total] = await Promise.all([
      store.collection(store.AUDIT).find({}).sort({ at: -1 }).skip((page - 1) * 50).limit(50).toArray(),
      store.collection(store.AUDIT).countDocuments(),
    ]);
    ok(res, { items: items.map((i) => ({ ...i, id: String(i._id) })), total, page, pageSize: 50 });
  }),
);


module.exports = router;
