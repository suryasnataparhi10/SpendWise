require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') });

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

async function main() {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI must be configured locally to back up the source database');
  }
  if (!process.env.MONGODB_BACKUP_DIR) {
    throw new Error('MONGODB_BACKUP_DIR must point to a secure directory outside the repository');
  }
  const backupDirectory = path.resolve(process.env.MONGODB_BACKUP_DIR);
  const archive = path.join(
    backupDirectory,
    `spendwise-${new Date().toISOString().replace(/[:.]/g, '-')}.archive.gz`,
  );
  await fs.mkdir(backupDirectory, { recursive: true });

  const dump = spawnSync(
    'mongodump',
    [`--uri=${process.env.MONGO_URI}`, `--archive=${archive}`, '--gzip', '--verbose'],
    { encoding: 'utf8' },
  );
  if (dump.error) throw dump.error;
  if (dump.status !== 0) {
    const details = String(dump.stderr || dump.stdout || '')
      .split(process.env.MONGO_URI)
      .join('[redacted URI]');
    throw new Error(`mongodump failed: ${details.slice(-2000)}`);
  }

  const verification = spawnSync(
    'mongorestore',
    ['--dryRun', `--archive=${archive}`, '--gzip', '--verbose'],
    { encoding: 'utf8' },
  );
  if (verification.error) throw verification.error;
  if (verification.status !== 0) {
    throw new Error(
      `mongorestore dry-run failed: ${String(verification.stderr || verification.stdout).slice(-2000)}`,
    );
  }
  const verificationLog = `${verification.stdout || ''}\n${verification.stderr || ''}`;
  const collections = [...verificationLog.matchAll(/archive prelude [^.]+\.(\S+)/g)].map(
    ([, name]) => name,
  );
  if (!collections.length) throw new Error('Backup archive contains no recognized collections');

  const hash = crypto.createHash('sha256');
  const file = await fs.open(archive, 'r');
  try {
    for await (const chunk of file.createReadStream()) hash.update(chunk);
  } finally {
    await file.close();
  }
  const report = {
    createdAt: new Date().toISOString(),
    archive: path.basename(archive),
    bytes: (await fs.stat(archive)).size,
    sha256: hash.digest('hex'),
    verification: 'mongorestore --dryRun passed',
    collections: [...new Set(collections)].sort(),
  };
  await fs.writeFile(
    path.join(backupDirectory, `${path.basename(archive, '.archive.gz')}.report.json`),
    `${JSON.stringify(report, null, 2)}\n`,
    { flag: 'wx' },
  );
  console.log(JSON.stringify({ ...report, directory: backupDirectory }, null, 2));
}

main().catch((error) => {
  console.error(`MongoDB backup failed: ${error.message}`);
  process.exitCode = 1;
});
