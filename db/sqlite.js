'use strict';

const path = require('path');
const Database = require('better-sqlite3');

const defaultPath = path.join(process.cwd(), 'storage', 'studiestalk.db');
const dbPath = process.env.DB_PATH || defaultPath;
const db = new Database(dbPath);

function many(sql, params = []) {
  return db.prepare(sql).all(...params);
}

function one(sql, params = []) {
  return db.prepare(sql).get(...params) || null;
}

function exec(sql, params = []) {
  const result = db.prepare(sql).run(...params);
  return {
    changes: result.changes,
    lastInsertRowid: result.lastInsertRowid
  };
}

function transaction(fn) {
  return db.transaction(() => {
    const tx = {
      query: (sql, params = []) => many(sql, params),
      many: (sql, params = []) => many(sql, params),
      one: (sql, params = []) => one(sql, params),
      exec: (sql, params = []) => exec(sql, params),
      queryMany: (sql, params = []) => many(sql, params),
      queryOne: (sql, params = []) => one(sql, params),
      execute: (sql, params = []) => exec(sql, params)
    };
    return fn(tx);
  })();
}

function close() {
  db.close();
}

function query(sql, params = []) {
  return many(sql, params);
}

module.exports = {
  engine: 'sqlite',
  db,
  query,
  one,
  many,
  exec,
  queryMany: many,
  queryOne: one,
  execute: exec,
  transaction,
  close
};
