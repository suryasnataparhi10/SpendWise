// Migration packages.
//
// Shared package format (written by every SpendWise edition, PostgreSQL and MongoDB alike):
//   ZIP containing
//     manifest.json  format "spendwise-migration", formatVersion, appSchemaVersion, packageId,
//                    source { type, engine, version, database }, per-data-set { count, sha256 },
//                    encryption parameters and payloadSha256
//     payload.enc    gzip(JSON { manifest: { packageId }, entities }) encrypted with AES-256-GCM
//                    (scrypt passphrase key); the manifest is bound as additional authenticated data
//     README.txt     human explanation
//   The entities use the shared model in ./canonical.js (kept identical to the PostgreSQL
//   edition's copy) and are translated to/from this application's model by ./interchange.js.
//
// Legacy format (packages exported by earlier versions of this MongoDB edition) is still accepted
// on import: format "spendwise-migration-package" with data.enc holding this application's model.
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { createZip, readZip } = require('./zip');
const { encryptWithPassphrase, decryptWithPassphrase, sha256 } = require('./crypto');
const { FORMAT: LEGACY_FORMAT, FORMAT_VERSION: LEGACY_FORMAT_VERSION, MODEL_VERSION, ENTITY_NAMES } = require('./model');
const shared = require('./canonical');
const { fromShared, toShared, localCounts } = require('./interchange');

const MAX_PAYLOAD_BYTES = 512 * 1024 * 1024;
const SHARED_FILES = ['manifest.json', 'payload.enc', 'README.txt'];
const invalid = (message) => Object.assign(new Error(message), { status: 400 });

// ------------------------------------------------------------------ shared format

const sharedAad = (manifest) =>
  `${shared.FORMAT}:v${manifest.formatVersion}:${manifest.packageId}:${manifest.source.type}:${shared.stable(manifest.entities)}`;
const entityChecksum = (records) => sha256(Buffer.from(shared.stable(records)));

// The engine-facing view of a manifest (same fields for both formats).
function sharedView(manifest) {
  return {
    format: manifest.format,
    formatVersion: manifest.formatVersion,
    modelVersion: MODEL_VERSION,
    appSchemaVersion: manifest.appSchemaVersion ?? null,
    application: manifest.application || 'SpendWise',
    packageId: manifest.packageId,
    createdAt: manifest.createdAt,
    source: {
      databaseType: manifest.source.type,
      databaseLabel: manifest.source.engine || manifest.source.type,
      databaseVersion: manifest.source.version || null,
      database: manifest.source.database || null,
    },
    createdBy:
      typeof manifest.createdBy === 'string'
        ? { email: manifest.createdBy, name: null }
        : manifest.createdBy && typeof manifest.createdBy === 'object'
          ? { email: manifest.createdBy.email || null, name: manifest.createdBy.name || null }
          : null,
    entities: localCounts(manifest.entities),
  };
}

function buildPackage({ entities, source, createdBy, passphrase }) {
  // JSON round trip so the checksums match exactly what an importer parses back.
  const dataset = JSON.parse(JSON.stringify(toShared(entities)));
  const packageId = crypto.randomBytes(12).toString('hex');
  const counts = {};
  for (const name of shared.ENTITY_ORDER) {
    counts[name] = { count: dataset[name].length, sha256: entityChecksum(dataset[name]) };
  }
  const manifest = {
    format: shared.FORMAT,
    formatVersion: shared.FORMAT_VERSION,
    appSchemaVersion: shared.APP_SCHEMA_VERSION,
    packageId,
    createdAt: new Date().toISOString(),
    createdBy: createdBy?.email || null,
    application: 'SpendWise',
    source: {
      type: source.type,
      engine: source.typeLabel || source.type,
      version: source.version || null,
      database: source.database || null,
    },
    entities: counts,
  };
  const plaintext = zlib.gzipSync(Buffer.from(JSON.stringify({ manifest: { packageId }, entities: dataset })));
  const { ciphertext, encryption } = encryptWithPassphrase(plaintext, passphrase, Buffer.from(sharedAad(manifest), 'utf8'));
  manifest.encryption = encryption;
  manifest.payloadSha256 = sha256(ciphertext);
  const readme = [
    'SpendWise migration package',
    '===========================',
    '',
    `Created: ${manifest.createdAt}`,
    `Source database: ${manifest.source.type}${manifest.source.version ? ` (${manifest.source.version})` : ''}`,
    `Package format: ${shared.FORMAT} v${shared.FORMAT_VERSION}`,
    '',
    'Records:',
    ...shared.ENTITY_ORDER.map((name) => `  ${shared.ENTITIES[name].label}: ${counts[name].count}`),
    '',
    'payload.enc is encrypted (AES-256-GCM). It contains password hashes and other sensitive',
    'data and can only be opened with the passphrase chosen at export time.',
    'Import it from the Database Migration & Portability Center of a SpendWise installation.',
    '',
  ].join('\n');
  const buffer = createZip([
    { name: 'manifest.json', data: Buffer.from(JSON.stringify(manifest, null, 2)) },
    { name: 'payload.enc', data: ciphertext, compress: false },
    { name: 'README.txt', data: Buffer.from(readme) },
  ]);
  return { manifest: sharedView(manifest), buffer };
}

// Same validation rules as the PostgreSQL edition's inspectPackage.
function inspectShared(manifest, files, names) {
  for (const name of names) {
    if (!SHARED_FILES.includes(name)) throw invalid(`Invalid migration package: unexpected file ${name}`);
  }
  if (!files['payload.enc']) throw invalid('Invalid migration package: manifest.json or payload.enc is missing');
  if (!Number.isInteger(manifest.formatVersion) || manifest.formatVersion < 1)
    throw invalid('The package version is missing or invalid');
  if (manifest.formatVersion > shared.FORMAT_VERSION)
    throw invalid(
      `This package uses format v${manifest.formatVersion}, which is newer than this installation supports (v${shared.FORMAT_VERSION}). Update SpendWise first.`,
    );
  if (!/^[a-f0-9]{24}$/.test(manifest.packageId || '')) throw invalid('The package id is invalid');
  if (typeof manifest.source?.type !== 'string' || !/^[a-z0-9-]{2,32}$/.test(manifest.source.type))
    throw invalid('The package does not identify its source database');
  if (!manifest.entities || typeof manifest.entities !== 'object') throw invalid('The package does not list its contents');
  for (const [name, info] of Object.entries(manifest.entities)) {
    if (!shared.ENTITIES[name]) throw invalid(`The package contains an unknown data set "${name}"`);
    if (!Number.isInteger(info?.count) || info.count < 0) throw invalid(`Invalid record count for ${name}`);
  }
  if (!manifest.encryption) throw invalid('The package is missing its encryption details');
  const payload = files['payload.enc'];
  if (manifest.payloadSha256 !== sha256(payload)) throw invalid('The package payload is corrupt (checksum mismatch)');
  return payload;
}

function openShared(manifest, payload, passphrase) {
  const plaintext = decryptWithPassphrase(payload, manifest.encryption, passphrase, Buffer.from(sharedAad(manifest), 'utf8'));
  let body;
  try {
    body = JSON.parse(zlib.gunzipSync(plaintext, { maxOutputLength: MAX_PAYLOAD_BYTES }).toString('utf8'));
  } catch {
    throw invalid('The package payload could not be read');
  }
  if (body?.manifest?.packageId !== manifest.packageId || !body.entities || typeof body.entities !== 'object')
    throw invalid('The package payload does not match its manifest');
  for (const [name, info] of Object.entries(manifest.entities)) {
    const records = body.entities[name] || [];
    if (!Array.isArray(records) || records.length !== info.count)
      throw invalid(`${shared.ENTITIES[name].label}: record count does not match the manifest`);
    if (info.sha256 && entityChecksum(records) !== info.sha256)
      throw invalid(`${shared.ENTITIES[name].label}: checksum does not match the manifest`);
  }
  // Format v1 is current; later versions add upgrade steps here.
  if (manifest.formatVersion !== 1) throw invalid(`No upgrade path for package format v${manifest.formatVersion}`);
  return fromShared(body.entities);
}

// ------------------------------------------------------------------ legacy format (import only)

const sortKeys = (value) =>
  Array.isArray(value)
    ? value.map(sortKeys)
    : value && typeof value === 'object'
      ? Object.fromEntries(Object.keys(value).sort().map((k) => [k, sortKeys(value[k])]))
      : value;

function legacyAuthenticatedPart(manifest) {
  const { encryption, ...rest } = manifest;
  return Buffer.from(JSON.stringify(sortKeys(rest)));
}

function inspectLegacy(manifest, files) {
  if (!files['data.enc']) throw invalid('This is not a SpendWise migration package');
  if (!Number.isInteger(manifest.formatVersion) || manifest.formatVersion > LEGACY_FORMAT_VERSION)
    throw invalid(`Package format version ${manifest.formatVersion} is newer than this application supports`);
  if (manifest.modelVersion > MODEL_VERSION)
    throw invalid(`Package data model version ${manifest.modelVersion} is newer than this application supports`);
  if (!manifest.encryption || !manifest.payload) throw invalid('The package is missing its encryption details');
  return files['data.enc'];
}

function openLegacy(manifest, ciphertext, passphrase) {
  const payload = decryptWithPassphrase(ciphertext, manifest.encryption, passphrase, legacyAuthenticatedPart(manifest));
  if (sha256(payload) !== manifest.payload.sha256) throw invalid('The package failed its integrity check');
  let data;
  try {
    data = JSON.parse(payload.toString('utf8'));
  } catch {
    throw invalid('The package data is unreadable');
  }
  if (!data || typeof data.entities !== 'object') throw invalid('The package data is malformed');
  const unknown = Object.keys(data.entities).filter((name) => !ENTITY_NAMES.includes(name));
  if (unknown.length) throw invalid(`The package contains unsupported data sets: ${unknown.join(', ')}`);
  for (const [name, list] of Object.entries(data.entities)) {
    if (!Array.isArray(list)) throw invalid(`The ${name} data set is malformed`);
    if (manifest.entities?.[name] && manifest.entities[name].count !== list.length)
      throw invalid(`The ${name} record count does not match the manifest`);
  }
  return data.entities;
}

// ------------------------------------------------------------------ public API

function parse(buffer) {
  const names = [];
  const files = readZip(buffer, { allowed: ['manifest.json', 'payload.enc', 'data.enc'], names });
  if (!files['manifest.json']) throw invalid('This is not a SpendWise migration package');
  let raw;
  try {
    raw = JSON.parse(files['manifest.json'].toString('utf8'));
  } catch {
    throw invalid('The package manifest is unreadable');
  }
  if (raw?.format === shared.FORMAT) {
    const payload = inspectShared(raw, files, names);
    return { kind: 'shared', raw, payload, manifest: sharedView(raw) };
  }
  if (raw?.format === LEGACY_FORMAT) {
    const payload = inspectLegacy(raw, files);
    return { kind: 'legacy', raw, payload, manifest: raw };
  }
  throw invalid('This is not a SpendWise migration package');
}

// Reads and validates the manifest without needing the passphrase.
function readManifest(buffer) {
  const { manifest, payload } = parse(buffer);
  return { manifest, ciphertext: payload };
}

// Decrypts, verifies and returns the dataset in this application's model.
function openPackage(buffer, passphrase) {
  const { kind, raw, payload, manifest } = parse(buffer);
  const entities = kind === 'shared' ? openShared(raw, payload, passphrase) : openLegacy(raw, payload, passphrase);
  return { manifest, entities };
}

module.exports = { buildPackage, readManifest, openPackage };
