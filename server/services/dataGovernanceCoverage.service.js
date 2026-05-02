'use strict';

const COVERAGE_DOMAINS = [
  { key: 'users', label: 'Users', tables: ['users'] },
  { key: 'workspaces', label: 'Workspaces', tables: ['workspaces', 'workspace_settings_admin'] },
  { key: 'messages', label: 'Messages', tables: ['messages', 'channels'] },
  { key: 'dms', label: 'DMs', tables: ['dm_threads', 'dm_messages'] },
  { key: 'homework', label: 'Homework', tables: ['homework_tasks', 'homework_submissions'] },
  { key: 'attendance', label: 'Attendance', tables: ['attendance_records'] },
  { key: 'live_sessions', label: 'Live sessions', tables: ['live_sessions', 'live_session_recordings'] },
  { key: 'files', label: 'Files', tables: ['file_metadata', 'file_events', 'file_stats'] },
  { key: 'emails', label: 'Emails', tables: ['workspace_email_logs', 'email_logs'] },
  { key: 'ai_usage', label: 'AI usage', tables: ['ai_usage_events', 'ai_runtime_sessions', 'ai_conversations'] },
  { key: 'billing', label: 'Billing', tables: ['workspace_billing', 'invoices', 'payments'] },
  { key: 'audit_security_logs', label: 'Audit/security logs', tables: ['audit_logs', 'security_events'] },
  { key: 'legal_acceptances', label: 'Legal acceptances', tables: ['legal_acceptances'] }
];

function listCoveredDataDomains() {
  return COVERAGE_DOMAINS.map((domain) => ({ ...domain, covered: true }));
}

module.exports = {
  listCoveredDataDomains
};
