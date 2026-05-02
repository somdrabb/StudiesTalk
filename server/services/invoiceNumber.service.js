'use strict';

function padSequence(value) {
  return String(Math.max(1, Number(value || 1))).padStart(6, '0');
}

function extractSequence(invoiceNumber = '') {
  const match = String(invoiceNumber || '').match(/^ST-(\d{4})-(\d{6})$/);
  return match ? Number(match[2] || 0) : 0;
}

function generateInvoiceNumber({ db, year = new Date().getUTCFullYear(), prefix = 'ST' } = {}) {
  if (!db || typeof db.prepare !== 'function') {
    return `${prefix}-${year}-${padSequence(1)}`;
  }
  const pattern = `${prefix}-${year}-%`;
  const row = db.prepare(`
    SELECT invoice_number
    FROM invoices
    WHERE invoice_number LIKE ?
    ORDER BY invoice_number DESC
    LIMIT 1
  `).get(pattern);
  const next = extractSequence(row?.invoice_number) + 1;
  return `${prefix}-${year}-${padSequence(next)}`;
}

module.exports = {
  generateInvoiceNumber
};
