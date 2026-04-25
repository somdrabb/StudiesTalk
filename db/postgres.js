'use strict';

const { Pool } = require('pg');
const { toPostgresPlaceholders } = require('./helpers');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  host: process.env.PGHOST,
  port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined
});

function normalizeSql(sql) {
  return toPostgresPlaceholders(sql);
}

async function many(sql, params = []) {
  const result = await pool.query(normalizeSql(sql), params);
  return result.rows;
}

async function one(sql, params = []) {
  const result = await pool.query(normalizeSql(sql), params);
  return result.rows[0] || null;
}

async function exec(sql, params = []) {
  const result = await pool.query(normalizeSql(sql), params);
  return {
    rowCount: result.rowCount,
    rows: result.rows
  };
}

async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tx = {
      query: async (sql, params = []) => {
        const result = await client.query(normalizeSql(sql), params);
        return result.rows;
      },
      many: async (sql, params = []) => {
        const result = await client.query(normalizeSql(sql), params);
        return result.rows;
      },
      one: async (sql, params = []) => {
        const result = await client.query(normalizeSql(sql), params);
        return result.rows[0] || null;
      },
      exec: async (sql, params = []) => {
        const result = await client.query(normalizeSql(sql), params);
        return {
          rowCount: result.rowCount,
          rows: result.rows
        };
      },
      queryMany: async (sql, params = []) => {
        const result = await client.query(normalizeSql(sql), params);
        return result.rows;
      },
      queryOne: async (sql, params = []) => {
        const result = await client.query(normalizeSql(sql), params);
        return result.rows[0] || null;
      },
      execute: async (sql, params = []) => {
        const result = await client.query(normalizeSql(sql), params);
        return {
          rowCount: result.rowCount,
          rows: result.rows
        };
      }
    };
    const output = await fn(tx);
    await client.query('COMMIT');
    return output;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function close() {
  await pool.end();
}

async function query(sql, params = []) {
  return many(sql, params);
}

module.exports = {
  engine: 'postgres',
  pool,
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
