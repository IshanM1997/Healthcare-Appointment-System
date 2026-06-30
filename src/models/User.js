// src/models/User.js
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');

const User = {
  create({ email, passwordHash, role }) {
    const id = uuidv4();
    db.prepare(
      `INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, ?)`
    ).run(id, email.toLowerCase(), passwordHash, role);
    return User.findById(id);
  },

  findById(id) {
    return db.prepare(`SELECT * FROM users WHERE id = ?`).get(id);
  },

  findByEmail(email) {
    return db.prepare(`SELECT * FROM users WHERE email = ?`).get(email.toLowerCase());
  },

  deactivate(id) {
    db.prepare(`UPDATE users SET is_active = 0, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).run(id);
  },
};

module.exports = User;
