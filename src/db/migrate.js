// src/db/migrate.js
// Applies schema.sql to the configured database. Safe to run repeatedly:
// every statement uses CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.

const fs = require('fs');
const path = require('path');
const db = require('./connection');

function migrate() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schema);
  console.log(`[migrate] Schema applied to ${db.name}`);
}

if (require.main === module) {
  migrate();
}

module.exports = migrate;
