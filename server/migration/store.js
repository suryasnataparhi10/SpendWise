// Persistent state of the migration center, kept in the application database: job history,
// conflict decisions, backups, the audit log, and files (packages, staged data, backups,
// reports) in GridFS. None of this touches application data collections.
const { GridFSBucket, ObjectId } = require('mongodb');
const mongo = require('../db');

const JOBS = 'migrationjobs';
const CONFLICTS = 'migrationconflicts';
const BACKUPS = 'migrationbackups';
const AUDIT = 'migrationauditlog';

let indexesReady = null;
function ensureIndexes() {
  if (!indexesReady) {
    const db = mongo.db();
    indexesReady = Promise.all([
      db.collection(JOBS).createIndex({ createdAt: -1 }),
      db.collection(CONFLICTS).createIndex({ jobId: 1, entity: 1, seq: 1 }),
      db.collection(CONFLICTS).createIndex({ jobId: 1, cid: 1 }, { unique: true }),
      db.collection(BACKUPS).createIndex({ createdAt: -1 }),
      db.collection(AUDIT).createIndex({ at: -1 }),
    ]).catch((error) => {
      indexesReady = null;
      throw error;
    });
  }
  return indexesReady;
}

const collection = (name) => mongo.db().collection(name);
const bucket = () => new GridFSBucket(mongo.db(), { bucketName: 'migrationfiles' });

async function putFile(buffer, filename, metadata = {}) {
  return new Promise((resolve, reject) => {
    const upload = bucket().openUploadStream(filename, { metadata });
    upload.on('error', reject);
    upload.on('finish', () => resolve(upload.id));
    upload.end(buffer);
  });
}

async function getFile(id) {
  const chunks = [];
  for await (const chunk of bucket().openDownloadStream(new ObjectId(id))) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function fileExists(id) {
  return Boolean(await mongo.db().collection('migrationfiles.files').findOne({ _id: new ObjectId(id) }, { projection: { _id: 1 } }));
}

async function deleteFile(id) {
  try {
    await bucket().delete(new ObjectId(id));
  } catch {}
}

async function audit(actor, action, details = {}) {
  await collection(AUDIT).insertOne({
    _id: new ObjectId(),
    at: new Date(),
    actor: actor ? { id: actor.id, email: actor.email, name: actor.name || null } : { id: null, email: 'system', name: 'System' },
    action,
    details: JSON.parse(JSON.stringify(details ?? {})),
  });
}

module.exports = { JOBS, CONFLICTS, BACKUPS, AUDIT, ensureIndexes, collection, putFile, getFile, fileExists, deleteFile, audit };
