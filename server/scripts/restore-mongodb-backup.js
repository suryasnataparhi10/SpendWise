require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') });

const { spawnSync } = require('node:child_process');
const path = require('node:path');

function databaseName(connectionString) {
  return decodeURIComponent(new URL(connectionString).pathname.replace(/^\/+/, '').split('/')[0]);
}

function main() {
  const { MONGO_URI, MONGODB_RESTORE_URI, MONGODB_ARCHIVE_PATH } = process.env;
  if (!MONGO_URI) throw new Error('MONGO_URI must identify the original source database');
  if (!MONGODB_RESTORE_URI)
    throw new Error('MONGODB_RESTORE_URI must identify a separate restore database');
  if (!MONGODB_ARCHIVE_PATH)
    throw new Error('MONGODB_ARCHIVE_PATH must point to a verified archive');
  const sourceDatabase = databaseName(MONGO_URI);
  const targetDatabase = databaseName(MONGODB_RESTORE_URI);
  if (!sourceDatabase || !targetDatabase || sourceDatabase === targetDatabase) {
    throw new Error('Restore target must use a different database name from the original source');
  }
  const archive = path.resolve(MONGODB_ARCHIVE_PATH);
  const result = spawnSync(
    'mongorestore',
    [
      `--uri=${MONGODB_RESTORE_URI}`,
      `--archive=${archive}`,
      '--gzip',
      `--nsFrom=${sourceDatabase}.*`,
      `--nsTo=${targetDatabase}.*`,
    ],
    { encoding: 'utf8' },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const details = String(result.stderr || result.stdout || '')
      .split(MONGODB_RESTORE_URI)
      .join('[redacted URI]');
    throw new Error(`mongorestore failed: ${details.slice(-2000)}`);
  }
  console.log(`MongoDB archive restored to the separate "${targetDatabase}" database.`);
}

try {
  main();
} catch (error) {
  console.error(`MongoDB restore failed: ${error.message}`);
  process.exitCode = 1;
}
