'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { pool } = require('./postgres');

async function main() {
  const explicitPath = process.argv[2] ? path.resolve(process.argv[2]) : null;
  const schemaDir = explicitPath || path.join(__dirname, 'schema', 'pg');

  if (fs.existsSync(schemaDir) && fs.statSync(schemaDir).isDirectory()) {
    const files = fs.readdirSync(schemaDir)
      .filter((name) => /^\d+_.*\.sql$/i.test(name))
      .sort();
    for (const file of files) {
      const schemaPath = path.join(schemaDir, file);
      const sql = fs.readFileSync(schemaPath, 'utf8');
      await pool.query(sql);
      console.log(`[postgres] Applied schema: ${schemaPath}`);
    }
    return;
  }

  const fallbackPath = explicitPath || path.join(__dirname, 'schema', 'postgres-core.sql');
  const sql = fs.readFileSync(fallbackPath, 'utf8');
  await pool.query(sql);
  console.log(`[postgres] Applied schema: ${fallbackPath}`);
}

main()
  .catch((error) => {
    console.error('[postgres] Schema apply failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });
