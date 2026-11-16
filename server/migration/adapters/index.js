// Registry of databases the migration center can read from and write to. The application
// database is always available; other databases are detected from server configuration.
// Only the database type, name and version are ever reported to the browser.
const { createMongoAdapter } = require('./mongodb');

const adapters = new Map();

function available() {
  if (!adapters.has('application')) adapters.set('application', createMongoAdapter());
  if (process.env.DATABASE_URL && !adapters.has('postgresql')) {
    try {
      adapters.set('postgresql', require('./postgresql').createPostgresAdapter());
    } catch (error) {
      console.error('PostgreSQL adapter unavailable:', error.message);
    }
  }
  return [...adapters.values()];
}

function adapter(key = 'application') {
  const found = available().find((candidate) => candidate.key === key);
  if (!found) throw Object.assign(new Error('That database is not connected to this server'), { status: 400 });
  return found;
}

async function describeAll() {
  const out = [];
  for (const candidate of available()) {
    try {
      out.push({ ...(await candidate.info()), counts: await candidate.counts(), connected: true });
    } catch (error) {
      out.push({ key: candidate.key, type: candidate.type, typeLabel: candidate.typeLabel, role: candidate.role, connected: false, error: 'Not reachable' });
    }
  }
  return out;
}

module.exports = { available, adapter, describeAll };
