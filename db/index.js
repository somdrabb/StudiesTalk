'use strict';

const engine = String(process.env.DB_ENGINE || 'sqlite').trim().toLowerCase();

if (engine === 'postgres' || engine === 'postgresql' || engine === 'pg') {
  module.exports = require('./postgres');
} else {
  module.exports = require('./sqlite');
}
