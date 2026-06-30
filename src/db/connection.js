// src/db/connection.js
// Single shared better-sqlite3 connection. better-sqlite3 is synchronous,
// which keeps the rest of the codebase free of an extra layer of async
// noise for what are, in this project, fast local file-backed queries.

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const config = require('../config');

const dbDir = path.dirname(config.db.path);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(config.db.path);

// WAL mode improves concurrent read/write behavior for a multi-request
// server even though we're on SQLite rather than a client/server DB.
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

module.exports = db;
