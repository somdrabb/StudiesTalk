'use strict';

function normalizeEngine(value) {
  const engine = String(value || 'sqlite').trim().toLowerCase();
  if (engine === 'postgresql' || engine === 'pg') return 'postgres';
  return engine || 'sqlite';
}

function toPostgresPlaceholders(sql) {
  let index = 0;
  return String(sql).replace(/\?/g, () => `$${++index}`);
}

function boolToInt(value) {
  return value ? 1 : 0;
}

function intToBool(value) {
  return value === true || value === 1 || value === '1';
}

module.exports = {
  normalizeEngine,
  toPostgresPlaceholders,
  boolToInt,
  intToBool
};
