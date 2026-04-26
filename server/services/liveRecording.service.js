'use strict';

function createLiveRecordingService({
  db,
  fileStorageService,
  nowIso = () => new Date().toISOString(),
  generateId = () => `rec_${Date.now()}`,
  getSessionById,
  getRecordingStateBySessionId,
  upsertRecordingState,
  getParticipant,
  canManageSession,
  canViewSession,
  isSuperAdminRole,
  userWorkspaceId,
  getNormalizedUserRole,
  defaultRetentionDays = 90
}) {
  if (!db) throw new Error('db is required');
  if (!fileStorageService) throw new Error('fileStorageService is required');

  function mapRecordingRow(row = {}) {
    if (!row || !row.id) return null;
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      sessionId: row.session_id,
      storageKey: row.storage_key || '',
      storageProvider: row.storage_provider || 'local_disk',
      storageMode: row.storage_mode || 'plain',
      encryptionKeyId: row.encryption_key_id || '',
      encryptionIv: row.encryption_iv || '',
      encryptionTag: row.encryption_tag || '',
      checksum: row.checksum || '',
      originalName: row.original_name || 'recording',
      mimeType: row.mime_type || 'application/octet-stream',
      sizeBytes: Number(row.size_bytes || 0) || 0,
      durationSeconds: Number(row.duration_seconds || 0) || 0,
      status: row.status || 'processing',
      startedAt: row.started_at || null,
      stoppedAt: row.stopped_at || null,
      createdByUserId: row.created_by_user_id || null,
      retentionUntil: row.retention_until || null,
      deletedAt: row.deleted_at || null,
      sessionTitle: row.session_title || null,
      studentPlaybackAllowed: Number(row.student_playback_allowed || 0) === 1
    };
  }

  function getRecordingRowById(recordingId) {
    return db.prepare(`
      SELECT r.*,
             s.title AS session_title,
             COALESCE(rs.student_playback_allowed, 0) AS student_playback_allowed
      FROM live_session_recordings r
      JOIN live_sessions s ON s.id = r.session_id
      LEFT JOIN live_session_recording rs ON rs.session_id = r.session_id
      WHERE r.id = ?
      LIMIT 1
    `).get(String(recordingId || '').trim()) || null;
  }

  function listRecordingRowsBySessionId(sessionId) {
    return db.prepare(`
      SELECT r.*,
             s.title AS session_title,
             COALESCE(rs.student_playback_allowed, 0) AS student_playback_allowed
      FROM live_session_recordings r
      JOIN live_sessions s ON s.id = r.session_id
      LEFT JOIN live_session_recording rs ON rs.session_id = r.session_id
      WHERE r.session_id = ?
        AND r.deleted_at IS NULL
      ORDER BY COALESCE(r.started_at, r.stopped_at, r.retention_until, r.id) DESC
    `).all(String(sessionId || '').trim());
  }

  function addDaysIso(days) {
    const base = new Date();
    base.setUTCDate(base.getUTCDate() + Math.max(1, Number(days || defaultRetentionDays) || defaultRetentionDays));
    return base.toISOString();
  }

  function resolvePlaybackPermission(session, user) {
    if (!session || !user) return { ok: false, status: 401 };
    if (isSuperAdminRole(user)) {
      return { ok: false, status: 403, tenantForbidden: true, reason: 'super_admin_private_recording_denied' };
    }
    if (userWorkspaceId(user) !== String(session.workspace_id || session.workspaceId || '').trim()) {
      return { ok: false, status: 403, tenantForbidden: true, reason: 'workspace_mismatch' };
    }
    if (canManageSession(user, session)) {
      return { ok: true, session, user, access: 'manager' };
    }
    const recordingState = getRecordingStateBySessionId(session.id) || {};
    const studentPlaybackAllowed = Number(recordingState.student_playback_allowed || 0) === 1;
    const participant = getParticipant(session.id, user.id || user.sub);
    const role = getNormalizedUserRole(user);
    if (!canViewSession(user, session)) {
      return { ok: false, status: 403, reason: 'session_view_denied' };
    }
    if (role !== 'student') {
      return { ok: false, status: 403, reason: 'recording_playback_denied' };
    }
    if (!studentPlaybackAllowed) {
      return { ok: false, status: 403, reason: 'student_playback_disabled' };
    }
    if (!participant || Number(participant.recording_consent || 0) !== 1) {
      return { ok: false, status: 403, reason: 'recording_consent_missing' };
    }
    return { ok: true, session, user, access: 'student' };
  }

  function ensureRecordingSession(sessionId) {
    if (typeof getSessionById !== 'function') return null;
    return getSessionById(String(sessionId || '').trim());
  }

  async function startRecording(sessionId, user, options = {}) {
    const session = ensureRecordingSession(sessionId);
    if (!session) {
      const err = new Error('Session not found');
      err.statusCode = 404;
      throw err;
    }
    if (!canManageSession(user, session)) {
      const err = new Error('Forbidden');
      err.statusCode = 403;
      throw err;
    }
    const existing = getRecordingStateBySessionId(session.id) || null;
    const startedAt = existing?.recording_started_at || nowIso();
    const next = upsertRecordingState({
      session,
      recordingEnabled: true,
      recordingStartedAt: startedAt,
      recordingStartedBy: user.id || user.sub || null,
      consentRequired: true,
      studentPlaybackAllowed: options.studentPlaybackAllowed === true
        ? true
        : Number(existing?.student_playback_allowed || 0) === 1
    });
    return {
      session,
      recordingState: next || getRecordingStateBySessionId(session.id)
    };
  }

  async function stopRecording(sessionId, user) {
    const session = ensureRecordingSession(sessionId);
    if (!session) {
      const err = new Error('Session not found');
      err.statusCode = 404;
      throw err;
    }
    if (!canManageSession(user, session)) {
      const err = new Error('Forbidden');
      err.statusCode = 403;
      throw err;
    }
    const existing = getRecordingStateBySessionId(session.id) || null;
    const next = upsertRecordingState({
      session,
      recordingEnabled: false,
      recordingStartedAt: existing?.recording_started_at || null,
      recordingStartedBy: existing?.recording_started_by || (user.id || user.sub || null),
      consentRequired: true,
      studentPlaybackAllowed: Number(existing?.student_playback_allowed || 0) === 1
    });
    return {
      session,
      recordingState: next || getRecordingStateBySessionId(session.id)
    };
  }

  async function attachRecordingObject(sessionId, objectMetadata = {}, user) {
    const session = ensureRecordingSession(sessionId);
    if (!session) {
      const err = new Error('Session not found');
      err.statusCode = 404;
      throw err;
    }
    if (!canManageSession(user, session)) {
      const err = new Error('Forbidden');
      err.statusCode = 403;
      throw err;
    }
    const recordingState = getRecordingStateBySessionId(session.id) || null;
    const recordId = generateId('lrec');
    const payload = {
      id: recordId,
      workspace_id: session.workspace_id || session.workspaceId || userWorkspaceId(user) || 'default',
      session_id: session.id,
      storage_key: String(objectMetadata.storageKey || '').trim(),
      storage_provider: String(objectMetadata.storageProvider || fileStorageService.adapter?.providerName || 'local_disk').trim() || 'local_disk',
      storage_mode: String(objectMetadata.storageMode || 'plain').trim() || 'plain',
      encryption_key_id: String(objectMetadata.encryptionKeyId || '').trim(),
      encryption_iv: String(objectMetadata.encryptionIv || '').trim(),
      encryption_tag: String(objectMetadata.encryptionTag || '').trim(),
      checksum: String(objectMetadata.checksum || '').trim(),
      original_name: String(objectMetadata.originalName || objectMetadata.fileName || 'live-recording.webm').trim() || 'live-recording.webm',
      mime_type: String(objectMetadata.mimeType || 'application/octet-stream').trim() || 'application/octet-stream',
      size_bytes: Math.max(0, Number(objectMetadata.sizeBytes || 0) || 0),
      duration_seconds: Math.max(0, Math.floor(Number(objectMetadata.durationSeconds || 0) || 0)),
      status: String(objectMetadata.status || 'ready').trim().toLowerCase() || 'ready',
      started_at: objectMetadata.startedAt || recordingState?.recording_started_at || null,
      stopped_at: objectMetadata.stoppedAt || nowIso(),
      created_by_user_id: user.id || user.sub || null,
      retention_until: objectMetadata.retentionUntil || addDaysIso(objectMetadata.retentionDays),
      deleted_at: null
    };
    db.prepare(`
      INSERT INTO live_session_recordings (
        id, workspace_id, session_id, storage_key, storage_provider, storage_mode, encryption_key_id, encryption_iv,
        encryption_tag, checksum, original_name, mime_type, size_bytes, duration_seconds, status, started_at, stopped_at,
        created_by_user_id, retention_until, deleted_at
      ) VALUES (
        @id, @workspace_id, @session_id, @storage_key, @storage_provider, @storage_mode, @encryption_key_id, @encryption_iv,
        @encryption_tag, @checksum, @original_name, @mime_type, @size_bytes, @duration_seconds, @status, @started_at, @stopped_at,
        @created_by_user_id, @retention_until, @deleted_at
      )
    `).run(payload);
    return mapRecordingRow(getRecordingRowById(recordId));
  }

  async function listRecordings(sessionId, user) {
    const session = ensureRecordingSession(sessionId);
    if (!session) {
      const err = new Error('Session not found');
      err.statusCode = 404;
      throw err;
    }
    const permission = resolvePlaybackPermission(session, user);
    if (!permission.ok) {
      const err = new Error(permission.tenantForbidden ? 'Forbidden' : 'Forbidden');
      err.statusCode = permission.status || 403;
      err.tenantForbidden = !!permission.tenantForbidden;
      err.reason = permission.reason || 'recording_list_denied';
      throw err;
    }
    return listRecordingRowsBySessionId(session.id).map(mapRecordingRow);
  }

  async function getRecording(recordingId, user) {
    const row = getRecordingRowById(recordingId);
    if (!row || row.deleted_at) {
      const err = new Error('Recording not found');
      err.statusCode = 404;
      throw err;
    }
    const session = ensureRecordingSession(row.session_id);
    const permission = resolvePlaybackPermission(session, user);
    if (!permission.ok) {
      const err = new Error(permission.tenantForbidden ? 'Forbidden' : 'Forbidden');
      err.statusCode = permission.status || 403;
      err.tenantForbidden = !!permission.tenantForbidden;
      err.reason = permission.reason || 'recording_playback_denied';
      throw err;
    }
    return mapRecordingRow(row);
  }

  async function deleteRecording(recordingId, user) {
    const row = getRecordingRowById(recordingId);
    if (!row) {
      const err = new Error('Recording not found');
      err.statusCode = 404;
      throw err;
    }
    const session = ensureRecordingSession(row.session_id);
    if (!session) {
      const err = new Error('Session not found');
      err.statusCode = 404;
      throw err;
    }
    if (!canManageSession(user, session)) {
      const err = new Error('Forbidden');
      err.statusCode = 403;
      err.tenantForbidden = isSuperAdminRole(user) || userWorkspaceId(user) !== String(session.workspace_id || '').trim();
      err.reason = err.tenantForbidden ? 'workspace_mismatch' : 'recording_delete_denied';
      throw err;
    }
    db.prepare(`
      UPDATE live_session_recordings
      SET status = 'deleted',
          deleted_at = ?,
          retention_until = COALESCE(retention_until, ?)
      WHERE id = ?
    `).run(nowIso(), nowIso(), row.id);
    return mapRecordingRow(getRecordingRowById(row.id));
  }

  return {
    startRecording,
    stopRecording,
    attachRecordingObject,
    listRecordings,
    getRecording,
    deleteRecording
  };
}

module.exports = {
  createLiveRecordingService
};
