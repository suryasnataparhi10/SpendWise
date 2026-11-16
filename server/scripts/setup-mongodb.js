require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') });

// Creates the SpendWise collections, validation rules and indexes. Safe to run repeatedly; it
// never modifies or deletes documents.
const mongo = require('../db');
const { ensureSchema, definitions } = require('../db/schema');

async function main() {
  const db = await mongo.connect();
  await ensureSchema(db);
  const names = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  const missing = Object.keys(definitions).filter((name) => !names.has(name));
  if (missing.length) throw new Error(`MongoDB schema is incomplete; missing: ${missing.join(', ')}`);
  console.log(
    `MongoDB schema ready in "${db.databaseName}" (${Object.keys(definitions).length} SpendWise collections, ` +
      `transactions ${mongo.transactionsSupported() ? 'supported' : 'not supported (standalone server)'}).`,
  );
}

main()
  .catch((error) => {
    console.error('MongoDB schema setup failed:', error.message);
    process.exitCode = 1;
  })
  .finally(() => mongo.close());
