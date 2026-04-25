'use strict';

const { normalizeEngine } = require('../../db/helpers');

const HOMEWORK_ACTIVE_STATUSES = new Set(['submitted', 'late', 'reviewed']);

function nowEpochMs() {
  return Date.now();
}

function nowSqliteStyleTimestamp() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function normalizeIntFlag(value) {
  return Number(value) > 0 ? 1 : 0;
}

function normalizeTaskRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    channelId: row.channel_id,
    title: row.title,
    description: row.description || '',
    status: row.status,
    priority: row.priority,
    dueAt: row.due_at == null ? null : Number(row.due_at),
    completedAt: row.completed_at == null ? null : Number(row.completed_at),
    createdBy: row.created_by,
    assignedTo: row.assigned_to || null,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at)
  };
}

function buildReactionLookup(rows = []) {
  const map = new Map();
  rows.forEach((row) => {
    const targetId = String(row.target_id || row.targetId || '');
    if (!map.has(targetId)) map.set(targetId, {});
    map.get(targetId)[row.emoji] = Number(row.count || 0);
  });
  return map;
}

function buildMineSet(rows = []) {
  return new Set(rows.map((row) => `${row.target_id || row.targetId}|${row.emoji}`));
}

function attachReactionPayload(records = [], reactionRows = [], mineRows = []) {
  const reactionsByTarget = buildReactionLookup(reactionRows);
  const mineSet = buildMineSet(mineRows);
  return records.map((record) => {
    const reactions = reactionsByTarget.get(String(record.id || '')) || {};
    return {
      ...record,
      reactions,
      myReactions: Object.keys(reactions).filter((emoji) =>
        mineSet.has(`${record.id}|${emoji}`)
      )
    };
  });
}

function toHomeworkItemFileMap(rows = []) {
  const map = new Map();
  rows.forEach((row) => {
    const key = String(row.itemId || '');
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  });
  return map;
}

function toHomeworkSubmissionFileMap(rows = []) {
  const map = new Map();
  rows.forEach((row) => {
    const key = String(row.submissionId || '');
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  });
  return map;
}

function toHomeworkSubmissionCommentMap(rows = []) {
  const map = new Map();
  rows.forEach((row) => {
    const key = String(row.submissionId || '');
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  });
  return map;
}

function buildSqlInPlaceholders(count) {
  return Array.from({ length: count }, () => '?').join(',');
}

function createTasksRepository({ engine = 'sqlite', sqliteDb } = {}) {
  const normalizedEngine = normalizeEngine(engine);
  if (normalizedEngine === 'postgres') {
    return createPostgresTasksRepository();
  }
  if (!sqliteDb) {
    throw new Error('sqliteDb is required for the SQLite tasks repository');
  }
  return createSqliteTasksRepository(sqliteDb);
}

function createSqliteTasksRepository(sqliteDb) {
  let homeworkItemsHasUpdatedAt;

  function hasHomeworkItemsUpdatedAt() {
    if (typeof homeworkItemsHasUpdatedAt === 'boolean') return homeworkItemsHasUpdatedAt;
    const columns = sqliteDb.prepare(`PRAGMA table_info(homework_items)`).all();
    homeworkItemsHasUpdatedAt = columns.some((column) => String(column.name || '') === 'updated_at');
    return homeworkItemsHasUpdatedAt;
  }

  function listHomeworkItemFiles(itemIds = []) {
    const normalized = itemIds.map((id) => String(id || '').trim()).filter(Boolean);
    if (!normalized.length) return new Map();
    const rows = sqliteDb.prepare(`
      SELECT
        id,
        item_id AS itemId,
        file_id AS fileId,
        file_name AS fileName,
        mime,
        size_bytes AS sizeBytes,
        url,
        created_at AS createdAt,
        file_role AS fileRole
      FROM homework_item_files
      WHERE item_id IN (${buildSqlInPlaceholders(normalized.length)})
      ORDER BY created_at ASC, id ASC
    `).all(...normalized);
    return toHomeworkItemFileMap(rows);
  }

  function listHomeworkSubmissionFiles(submissionIds = []) {
    const normalized = submissionIds.map((id) => String(id || '').trim()).filter(Boolean);
    if (!normalized.length) return new Map();
    const rows = sqliteDb.prepare(`
      SELECT
        id,
        submission_id AS submissionId,
        file_id AS fileId,
        file_name AS fileName,
        mime,
        size_bytes AS sizeBytes,
        url,
        created_at AS createdAt
      FROM homework_submission_files
      WHERE submission_id IN (${buildSqlInPlaceholders(normalized.length)})
      ORDER BY created_at ASC, id ASC
    `).all(...normalized);
    return toHomeworkSubmissionFileMap(rows);
  }

  function listHomeworkSubmissionComments(submissionIds = []) {
    const normalized = submissionIds.map((id) => String(id || '').trim()).filter(Boolean);
    if (!normalized.length) return new Map();
    const rows = sqliteDb.prepare(`
      SELECT
        hsc.id,
        hsc.submission_id AS submissionId,
        hsc.author_id AS authorId,
        hsc.comment_text AS commentText,
        hsc.created_at AS createdAt,
        hsc.updated_at AS updatedAt,
        COALESCE(u.name, u.email, u.username, hsc.author_id) AS authorName
      FROM homework_submission_comments hsc
      LEFT JOIN users u ON u.id = hsc.author_id
      WHERE hsc.submission_id IN (${buildSqlInPlaceholders(normalized.length)})
      ORDER BY hsc.created_at ASC, hsc.id ASC
    `).all(...normalized);
    return toHomeworkSubmissionCommentMap(rows);
  }

  return {
    engine: 'sqlite',

    async ensureLinkedFileRegistered() {
      return null;
    },

    async listTasks({ workspaceId, channelId, status = '', includeDone = true, limit = 50, userId }) {
      let where = 'workspace_id = ? AND channel_id = ?';
      const args = [workspaceId, channelId];

      if (status && ['open', 'doing', 'done'].includes(status)) {
        where += ' AND status = ?';
        args.push(status);
      } else if (!includeDone) {
        where += " AND status != 'done'";
      }

      const rows = sqliteDb.prepare(`
        SELECT *
        FROM tasks
        WHERE ${where}
        ORDER BY
          CASE status WHEN 'open' THEN 1 WHEN 'doing' THEN 2 WHEN 'done' THEN 3 ELSE 9 END,
          COALESCE(due_at, 9223372036854775807) ASC,
          updated_at DESC,
          id DESC
        LIMIT ?
      `).all(...args, limit);

      const records = rows.map(normalizeTaskRow);
      const taskIds = records.map((row) => row.id);
      const reactionRows = taskIds.length
        ? sqliteDb.prepare(`
            SELECT target_id, emoji, COUNT(*) AS count
            FROM task_reactions
            WHERE workspace_id = ? AND target_type = 'task' AND target_id IN (${buildSqlInPlaceholders(taskIds.length)})
            GROUP BY target_id, emoji
          `).all(workspaceId, ...taskIds)
        : [];
      const mineRows = taskIds.length
        ? sqliteDb.prepare(`
            SELECT target_id, emoji
            FROM task_reactions
            WHERE workspace_id = ? AND target_type = 'task' AND user_id = ? AND target_id IN (${buildSqlInPlaceholders(taskIds.length)})
          `).all(workspaceId, userId, ...taskIds)
        : [];

      return attachReactionPayload(records, reactionRows, mineRows);
    },

    async getTaskById({ workspaceId, taskId }) {
      const row = sqliteDb.prepare(`
        SELECT *
        FROM tasks
        WHERE id = ? AND workspace_id = ?
      `).get(taskId, workspaceId);
      return normalizeTaskRow(row);
    },

    async createTask({ id, workspaceId, channelId, title, description, status, priority, dueAt, createdBy, assignedTo, createdAt, updatedAt, completedAt }) {
      sqliteDb.prepare(`
        INSERT INTO tasks
        (id, workspace_id, channel_id, title, description, status, priority, due_at, completed_at, created_by, assigned_to, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        workspaceId,
        channelId,
        title,
        description || null,
        status,
        priority,
        dueAt == null ? null : Number(dueAt),
        completedAt == null ? null : Number(completedAt),
        createdBy,
        assignedTo || null,
        Number(createdAt),
        Number(updatedAt)
      );
      return this.getTaskById({ workspaceId, taskId: id });
    },

    async updateTask({ taskId, workspaceId, existingTask, patch, updatedAt, completedAt }) {
      const next = {
        title: patch.title !== null ? patch.title : existingTask.title,
        description: patch.description !== null ? patch.description : existingTask.description,
        status: patch.status !== null ? patch.status : existingTask.status,
        priority: patch.priority !== null ? patch.priority : existingTask.priority,
        dueAt: patch.dueAt !== undefined ? patch.dueAt : existingTask.dueAt,
        assignedTo: patch.assignedTo !== undefined ? patch.assignedTo : existingTask.assignedTo
      };

      sqliteDb.prepare(`
        UPDATE tasks
        SET title = ?, description = ?, status = ?, priority = ?, due_at = ?, assigned_to = ?, completed_at = ?, updated_at = ?
        WHERE id = ? AND workspace_id = ?
      `).run(
        next.title,
        next.description || null,
        next.status,
        next.priority,
        next.dueAt == null ? null : Number(next.dueAt),
        next.assignedTo || null,
        completedAt == null ? null : Number(completedAt),
        Number(updatedAt),
        taskId,
        workspaceId
      );

      return this.getTaskById({ workspaceId, taskId });
    },

    async createTaskComment({ id, workspaceId, taskId, userId, body, createdAt }) {
      sqliteDb.prepare(`
        INSERT INTO task_comments (id, workspace_id, task_id, user_id, body, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, workspaceId, taskId, userId, body, Number(createdAt));

      sqliteDb.prepare(`UPDATE tasks SET updated_at = ? WHERE id = ?`).run(Number(createdAt), taskId);

      return sqliteDb.prepare(`SELECT * FROM task_comments WHERE id = ?`).get(id) || null;
    },

    async listTaskComments({ workspaceId, taskId, userId }) {
      const rows = sqliteDb.prepare(`
        SELECT c.*
        FROM task_comments c
        WHERE c.workspace_id = ? AND c.task_id = ?
        ORDER BY c.created_at ASC, c.id ASC
      `).all(workspaceId, taskId);
      const commentIds = rows.map((row) => row.id);
      const reactionRows = commentIds.length
        ? sqliteDb.prepare(`
            SELECT target_id, emoji, COUNT(*) AS count
            FROM task_reactions
            WHERE workspace_id = ? AND target_type = 'comment' AND target_id IN (${buildSqlInPlaceholders(commentIds.length)})
            GROUP BY target_id, emoji
          `).all(workspaceId, ...commentIds)
        : [];
      const mineRows = commentIds.length
        ? sqliteDb.prepare(`
            SELECT target_id, emoji
            FROM task_reactions
            WHERE workspace_id = ? AND target_type = 'comment' AND user_id = ? AND target_id IN (${buildSqlInPlaceholders(commentIds.length)})
          `).all(workspaceId, userId, ...commentIds)
        : [];
      return attachReactionPayload(rows, reactionRows, mineRows);
    },

    async getTaskReactionTarget({ workspaceId, targetType, targetId }) {
      if (targetType === 'task') {
        return sqliteDb.prepare(`
          SELECT id, channel_id AS channelId
          FROM tasks
          WHERE id = ? AND workspace_id = ?
        `).get(targetId, workspaceId) || null;
      }
      return sqliteDb.prepare(`
        SELECT c.id, t.channel_id AS channelId
        FROM task_comments c
        JOIN tasks t ON t.id = c.task_id
        WHERE c.id = ? AND c.workspace_id = ? AND t.workspace_id = ?
      `).get(targetId, workspaceId, workspaceId) || null;
    },

    async toggleTaskReaction({ id, workspaceId, targetType, targetId, emoji, userId, createdAt }) {
      const existing = sqliteDb.prepare(`
        SELECT id
        FROM task_reactions
        WHERE workspace_id = ? AND target_type = ? AND target_id = ? AND emoji = ? AND user_id = ?
      `).get(workspaceId, targetType, targetId, emoji, userId);

      if (existing) {
        sqliteDb.prepare(`DELETE FROM task_reactions WHERE id = ?`).run(existing.id);
        return { on: false };
      }

      sqliteDb.prepare(`
        INSERT INTO task_reactions (id, workspace_id, target_type, target_id, emoji, user_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, workspaceId, targetType, targetId, emoji, userId, Number(createdAt));
      return { on: true };
    },

    async getHomeworkItemById(itemId) {
      const updatedAtSelect = hasHomeworkItemsUpdatedAt() ? 'updated_at' : 'created_at';
      return sqliteDb.prepare(`
        SELECT
          id,
          workspace_id AS workspaceId,
          class_channel_id AS classChannelId,
          title,
          description,
          resource_url AS resourceUrl,
          due_date AS dueDate,
          is_locked AS isLocked,
          is_archived AS isArchived,
          created_by AS createdBy,
          created_at AS createdAt,
          ${updatedAtSelect} AS updatedAt
        FROM homework_items
        WHERE id = ?
        LIMIT 1
      `).get(itemId) || null;
    },

    async listHomeworkSubmissionStudents(itemId) {
      return sqliteDb.prepare(`
        SELECT student_id AS studentId, status
        FROM homework_submissions
        WHERE homework_item_id = ?
      `).all(itemId);
    },

    async syncHomeworkCompletion(homeworkId, studentId, status) {
      const normalizedStatus = String(status || '').trim().toLowerCase();
      if (HOMEWORK_ACTIVE_STATUSES.has(normalizedStatus)) {
        sqliteDb.prepare(`
          INSERT OR REPLACE INTO homework_completions (homework_id, student_id, completed_at)
          VALUES (?, ?, ?)
        `).run(homeworkId, studentId, nowSqliteStyleTimestamp());
        return;
      }
      sqliteDb.prepare(`
        DELETE FROM homework_completions
        WHERE homework_id = ? AND student_id = ?
      `).run(homeworkId, studentId);
    },

    async listHomeworkBoardForChannel({ workspaceId, classChannelId, homeworkChannelId, viewerId, viewerRole }) {
      const updatedAtSelect = hasHomeworkItemsUpdatedAt() ? 'hi.updated_at' : 'hi.created_at';
      const items = sqliteDb.prepare(`
        SELECT
          hi.id,
          hi.workspace_id AS workspaceId,
          hi.class_channel_id AS classChannelId,
          hi.title,
          hi.description,
          hi.resource_url AS resourceUrl,
          hi.due_date AS dueDate,
          hi.is_locked AS isLocked,
          hi.is_archived AS isArchived,
          hi.created_by AS createdBy,
          hi.created_at AS createdAt,
          ${updatedAtSelect} AS updatedAt,
          COALESCE(u.name, u.email, u.username, hi.created_by) AS createdByName
        FROM homework_items hi
        LEFT JOIN users u ON u.id = hi.created_by
        WHERE hi.workspace_id = ?
          AND hi.class_channel_id = ?
          AND COALESCE(hi.is_archived, 0) = 0
        ORDER BY
          CASE WHEN COALESCE(hi.due_date, '') = '' THEN 1 ELSE 0 END ASC,
          hi.due_date ASC,
          hi.created_at DESC,
          hi.id DESC
      `).all(workspaceId, classChannelId);
      if (!items.length) return [];

      const itemIds = items.map((item) => String(item.id || ''));
      const itemFiles = listHomeworkItemFiles(itemIds);
      const submissionBaseSql = `
        SELECT
          hs.id,
          hs.homework_item_id AS homeworkItemId,
          hs.workspace_id AS workspaceId,
          hs.channel_id AS channelId,
          hs.student_id AS studentId,
          hs.status,
          hs.submission_text AS submissionText,
          hs.is_late AS isLate,
          hs.submitted_at AS submittedAt,
          hs.reviewed_at AS reviewedAt,
          hs.reviewed_by AS reviewedBy,
          hs.returned_at AS returnedAt,
          hs.feedback_text AS feedbackText,
          hs.grade_value AS gradeValue,
          hs.created_at AS createdAt,
          hs.updated_at AS updatedAt,
          COALESCE(u.name, u.email, u.username, hs.student_id) AS studentName,
          COALESCE(r.name, r.email, r.username, hs.reviewed_by) AS reviewedByName
        FROM homework_submissions hs
        LEFT JOIN users u ON u.id = hs.student_id
        LEFT JOIN users r ON r.id = hs.reviewed_by
        WHERE hs.homework_item_id IN (${buildSqlInPlaceholders(itemIds.length)})
      `;
      const submissionRows = viewerRole === 'student'
        ? sqliteDb.prepare(`
            ${submissionBaseSql}
            AND hs.student_id = ?
            ORDER BY hs.updated_at DESC, hs.created_at DESC, hs.id DESC
          `).all(...itemIds, viewerId)
        : sqliteDb.prepare(`
            ${submissionBaseSql}
            ORDER BY hs.updated_at DESC, hs.created_at DESC, hs.id DESC
          `).all(...itemIds);
      const submissionFiles = listHomeworkSubmissionFiles(submissionRows.map((row) => row.id));
      const submissionComments = listHomeworkSubmissionComments(submissionRows.map((row) => row.id));
      const submissionsByItem = new Map();

      submissionRows.forEach((row) => {
        const key = String(row.homeworkItemId || '');
        if (!submissionsByItem.has(key)) submissionsByItem.set(key, []);
        submissionsByItem.get(key).push({
          ...row,
          isLate: normalizeIntFlag(row.isLate),
          files: submissionFiles.get(String(row.id || '')) || [],
          comments: submissionComments.get(String(row.id || '')) || []
        });
      });

      return items.map((item) => {
        const itemId = String(item.id || '');
        const itemSubmissions = submissionsByItem.get(itemId) || [];
        const mySubmission = viewerRole === 'student'
          ? itemSubmissions.find((submission) => String(submission.studentId || '') === String(viewerId || '')) || null
          : null;
        return {
          ...item,
          isLocked: normalizeIntFlag(item.isLocked),
          isArchived: normalizeIntFlag(item.isArchived),
          homeworkChannelId,
          files: itemFiles.get(itemId) || [],
          mySubmission,
          submissions: viewerRole === 'student' ? [] : itemSubmissions,
          submissionSummary: {
            total: itemSubmissions.length,
            submitted: itemSubmissions.filter((row) => ['submitted', 'late', 'reviewed'].includes(String(row.status || '').toLowerCase())).length,
            reviewed: itemSubmissions.filter((row) => String(row.status || '').toLowerCase() === 'reviewed').length,
            returned: itemSubmissions.filter((row) => String(row.status || '').toLowerCase() === 'returned').length
          }
        };
      });
    },

    async createHomeworkItem({ id, workspaceId, classChannelId, title, description, resourceUrl, dueDate, isLocked, createdBy, files = [], solutionFiles = [] }) {
      const createdAt = nowSqliteStyleTimestamp();
      if (hasHomeworkItemsUpdatedAt()) {
        sqliteDb.prepare(`
          INSERT INTO homework_items
          (id, workspace_id, class_channel_id, title, description, resource_url, due_date, is_locked, is_archived, created_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
        `).run(id, workspaceId, classChannelId, title, description, resourceUrl, dueDate, normalizeIntFlag(isLocked), createdBy || null, createdAt, createdAt);
      } else {
        sqliteDb.prepare(`
          INSERT INTO homework_items
          (id, workspace_id, class_channel_id, title, description, resource_url, due_date, is_locked, is_archived, created_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
        `).run(id, workspaceId, classChannelId, title, description, resourceUrl, dueDate, normalizeIntFlag(isLocked), createdBy || null, createdAt);
      }

      const fileStmt = sqliteDb.prepare(`
        INSERT INTO homework_item_files
        (id, item_id, workspace_id, channel_id, file_id, file_name, mime, size_bytes, url, file_role, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      [...files, ...solutionFiles].forEach((entry) => {
        fileStmt.run(
          entry.id,
          id,
          workspaceId,
          entry.channelId,
          entry.fileId,
          entry.fileName,
          entry.mime,
          Number(entry.sizeBytes || 0),
          entry.url,
          entry.fileRole,
          createdBy || null,
          createdAt
        );
      });

      return this.getHomeworkItemById(id);
    },

    async updateHomeworkItem({ itemId, title, description, resourceUrl, dueDate, isLocked, isArchived, files, solutionFiles, workspaceId, channelId, userId }) {
      const updatedAt = nowSqliteStyleTimestamp();
      if (hasHomeworkItemsUpdatedAt()) {
        sqliteDb.prepare(`
          UPDATE homework_items
          SET title = ?, description = ?, resource_url = ?, due_date = ?, is_locked = ?, is_archived = ?, updated_at = ?
          WHERE id = ?
        `).run(title, description, resourceUrl, dueDate, normalizeIntFlag(isLocked), normalizeIntFlag(isArchived), updatedAt, itemId);
      } else {
        sqliteDb.prepare(`
          UPDATE homework_items
          SET title = ?, description = ?, resource_url = ?, due_date = ?, is_locked = ?, is_archived = ?
          WHERE id = ?
        `).run(title, description, resourceUrl, dueDate, normalizeIntFlag(isLocked), normalizeIntFlag(isArchived), itemId);
      }

      if (files || solutionFiles) {
        sqliteDb.prepare(`DELETE FROM homework_item_files WHERE item_id = ?`).run(itemId);
        const fileStmt = sqliteDb.prepare(`
          INSERT INTO homework_item_files
          (id, item_id, workspace_id, channel_id, file_id, file_name, mime, size_bytes, url, file_role, created_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        [...(files || []), ...(solutionFiles || [])].forEach((entry) => {
          fileStmt.run(
            entry.id,
            itemId,
            workspaceId,
            channelId,
            entry.fileId,
            entry.fileName,
            entry.mime,
            Number(entry.sizeBytes || 0),
            entry.url,
            entry.fileRole,
            userId || null,
            updatedAt
          );
        });
      }

      return this.getHomeworkItemById(itemId);
    },

    async deleteHomeworkItemCascade(itemId) {
      sqliteDb.transaction(() => {
        sqliteDb.prepare(`
          DELETE FROM homework_submission_files
          WHERE submission_id IN (SELECT id FROM homework_submissions WHERE homework_item_id = ?)
        `).run(itemId);
        sqliteDb.prepare(`
          DELETE FROM homework_submission_comments
          WHERE submission_id IN (SELECT id FROM homework_submissions WHERE homework_item_id = ?)
        `).run(itemId);
        sqliteDb.prepare(`DELETE FROM homework_submissions WHERE homework_item_id = ?`).run(itemId);
        sqliteDb.prepare(`DELETE FROM homework_item_files WHERE item_id = ?`).run(itemId);
        sqliteDb.prepare(`DELETE FROM homework_items WHERE id = ?`).run(itemId);
        sqliteDb.prepare(`DELETE FROM homework_completions WHERE homework_id = ?`).run(itemId);
      })();
    },

    async getHomeworkSubmissionById(submissionId) {
      return sqliteDb.prepare(`
        SELECT
          hs.id,
          hs.homework_item_id AS homeworkItemId,
          hs.workspace_id AS workspaceId,
          hs.channel_id AS channelId,
          hs.student_id AS studentId,
          hs.status,
          hi.class_channel_id AS classChannelId,
          hi.due_date AS dueDate
        FROM homework_submissions hs
        JOIN homework_items hi ON hi.id = hs.homework_item_id
        WHERE hs.id = ?
        LIMIT 1
      `).get(submissionId) || null;
    },

    async getHomeworkSubmissionForStudent(itemId, studentId) {
      return sqliteDb.prepare(`
        SELECT id, status
        FROM homework_submissions
        WHERE homework_item_id = ? AND student_id = ?
        LIMIT 1
      `).get(itemId, studentId) || null;
    },

    async upsertHomeworkSubmission({ submissionId, existingSubmissionId = null, itemId, workspaceId, channelId, studentId, status, submissionText, isLate, submittedAt, files = [] }) {
      const now = nowSqliteStyleTimestamp();
      if (existingSubmissionId) {
        sqliteDb.prepare(`
          UPDATE homework_submissions
          SET status = ?, submission_text = ?, is_late = ?, submitted_at = COALESCE(?, submitted_at), updated_at = ?
          WHERE id = ?
        `).run(status, submissionText, normalizeIntFlag(isLate), submittedAt || null, now, submissionId);
      } else {
        sqliteDb.prepare(`
          INSERT INTO homework_submissions
          (id, homework_item_id, workspace_id, channel_id, student_id, status, submission_text, is_late, submitted_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(submissionId, itemId, workspaceId, channelId, studentId, status, submissionText, normalizeIntFlag(isLate), submittedAt || null, now, now);
      }

      const fileStmt = sqliteDb.prepare(`
        INSERT INTO homework_submission_files
        (id, submission_id, workspace_id, channel_id, file_id, file_name, mime, size_bytes, url, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      files.forEach((entry) => {
        fileStmt.run(
          entry.id,
          submissionId,
          workspaceId,
          channelId,
          entry.fileId,
          entry.fileName,
          entry.mime,
          Number(entry.sizeBytes || 0),
          entry.url,
          studentId,
          now
        );
      });
    },

    async reviewHomeworkSubmission({ submissionId, status, feedbackText, gradeValue, reviewedBy }) {
      const now = nowSqliteStyleTimestamp();
      sqliteDb.prepare(`
        UPDATE homework_submissions
        SET status = ?, feedback_text = ?, grade_value = ?, reviewed_at = ?, reviewed_by = ?, returned_at = CASE WHEN ? = 'returned' THEN ? ELSE returned_at END, updated_at = ?
        WHERE id = ?
      `).run(status, feedbackText, gradeValue, now, reviewedBy || null, status, now, now, submissionId);
    },

    async createHomeworkSubmissionComment({ id, submissionId, workspaceId, channelId, authorId, commentText }) {
      const now = nowSqliteStyleTimestamp();
      sqliteDb.prepare(`
        INSERT INTO homework_submission_comments
        (id, submission_id, workspace_id, channel_id, author_id, comment_text, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, submissionId, workspaceId, channelId, authorId, commentText, now, now);
    }
  };
}

function createPostgresTasksRepository() {
  const postgres = require('../../db/postgres');

  async function listHomeworkItemFiles(itemIds = []) {
    const normalized = itemIds.map((id) => String(id || '').trim()).filter(Boolean);
    if (!normalized.length) return new Map();
    const rows = await postgres.queryMany(`
      SELECT
        id,
        item_id AS "itemId",
        file_id AS "fileId",
        file_name AS "fileName",
        mime,
        size_bytes AS "sizeBytes",
        url,
        created_at AS "createdAt",
        file_role AS "fileRole"
      FROM homework_item_files
      WHERE item_id IN (${buildSqlInPlaceholders(normalized.length)})
      ORDER BY created_at ASC, id ASC
    `, normalized);
    return toHomeworkItemFileMap(rows);
  }

  async function listHomeworkSubmissionFiles(submissionIds = []) {
    const normalized = submissionIds.map((id) => String(id || '').trim()).filter(Boolean);
    if (!normalized.length) return new Map();
    const rows = await postgres.queryMany(`
      SELECT
        id,
        submission_id AS "submissionId",
        file_id AS "fileId",
        file_name AS "fileName",
        mime,
        size_bytes AS "sizeBytes",
        url,
        created_at AS "createdAt"
      FROM homework_submission_files
      WHERE submission_id IN (${buildSqlInPlaceholders(normalized.length)})
      ORDER BY created_at ASC, id ASC
    `, normalized);
    return toHomeworkSubmissionFileMap(rows);
  }

  async function listHomeworkSubmissionComments(submissionIds = []) {
    const normalized = submissionIds.map((id) => String(id || '').trim()).filter(Boolean);
    if (!normalized.length) return new Map();
    const rows = await postgres.queryMany(`
      SELECT
        hsc.id,
        hsc.submission_id AS "submissionId",
        hsc.author_id AS "authorId",
        hsc.comment_text AS "commentText",
        hsc.created_at AS "createdAt",
        hsc.updated_at AS "updatedAt",
        COALESCE(u.name, u.email::text, u.username, hsc.author_id) AS "authorName"
      FROM homework_submission_comments hsc
      LEFT JOIN users u ON u.id = hsc.author_id
      WHERE hsc.submission_id IN (${buildSqlInPlaceholders(normalized.length)})
      ORDER BY hsc.created_at ASC, hsc.id ASC
    `, normalized);
    return toHomeworkSubmissionCommentMap(rows);
  }

  return {
    engine: 'postgres',

    async ensureLinkedFileRegistered({ fileId, workspaceId, channelId, messageId, uploaderId, purpose, fileName, mime, sizeBytes, url, storageKey = '', checksum = '', storageProvider = 'local_disk', storageMode = 'plain', encryptionKeyId = '', encryptionIv = '', encryptionTag = '', permissions = 'workspace_private' }) {
      const now = nowSqliteStyleTimestamp();
      await postgres.execute(`
        INSERT INTO files_registry
        (file_id, workspace_id, channel_id, message_id, uploader_id, purpose, file_name, mime, size_bytes, url, storage_key, checksum, storage_provider, storage_mode, encryption_key_id, encryption_iv, encryption_tag, permissions, pinned, deleted, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
        ON CONFLICT (file_id) DO NOTHING
      `, [fileId, workspaceId, channelId || null, messageId, uploaderId || null, purpose, fileName, mime, Number(sizeBytes || 0), url, storageKey, checksum, storageProvider, storageMode, encryptionKeyId, encryptionIv, encryptionTag, permissions, now, now]);
    },

    async listTasks({ workspaceId, channelId, status = '', includeDone = true, limit = 50, userId }) {
      let where = 'workspace_id = ? AND channel_id = ?';
      const args = [workspaceId, channelId];

      if (status && ['open', 'doing', 'done'].includes(status)) {
        where += ' AND status = ?';
        args.push(status);
      } else if (!includeDone) {
        where += " AND status != 'done'";
      }

      const rows = await postgres.queryMany(`
        SELECT *
        FROM tasks
        WHERE ${where}
        ORDER BY
          CASE status WHEN 'open' THEN 1 WHEN 'doing' THEN 2 WHEN 'done' THEN 3 ELSE 9 END,
          COALESCE(due_at, 9223372036854775807) ASC,
          updated_at DESC,
          id DESC
        LIMIT ?
      `, [...args, limit]);

      const records = rows.map(normalizeTaskRow);
      const taskIds = records.map((row) => row.id);
      const reactionRows = taskIds.length
        ? await postgres.queryMany(`
            SELECT target_id, emoji, COUNT(*)::int AS count
            FROM task_reactions
            WHERE workspace_id = ? AND target_type = 'task' AND target_id IN (${buildSqlInPlaceholders(taskIds.length)})
            GROUP BY target_id, emoji
          `, [workspaceId, ...taskIds])
        : [];
      const mineRows = taskIds.length
        ? await postgres.queryMany(`
            SELECT target_id, emoji
            FROM task_reactions
            WHERE workspace_id = ? AND target_type = 'task' AND user_id = ? AND target_id IN (${buildSqlInPlaceholders(taskIds.length)})
          `, [workspaceId, userId, ...taskIds])
        : [];

      return attachReactionPayload(records, reactionRows, mineRows);
    },

    async getTaskById({ workspaceId, taskId }) {
      const row = await postgres.queryOne(`
        SELECT *
        FROM tasks
        WHERE id = ? AND workspace_id = ?
      `, [taskId, workspaceId]);
      return normalizeTaskRow(row);
    },

    async createTask({ id, workspaceId, channelId, title, description, status, priority, dueAt, createdBy, assignedTo, createdAt, updatedAt, completedAt }) {
      await postgres.execute(`
        INSERT INTO tasks
        (id, workspace_id, channel_id, title, description, status, priority, due_at, completed_at, created_by, assigned_to, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        id,
        workspaceId,
        channelId,
        title,
        description || null,
        status,
        priority,
        dueAt == null ? null : Number(dueAt),
        completedAt == null ? null : Number(completedAt),
        createdBy,
        assignedTo || null,
        Number(createdAt),
        Number(updatedAt)
      ]);
      return this.getTaskById({ workspaceId, taskId: id });
    },

    async updateTask({ taskId, workspaceId, existingTask, patch, updatedAt, completedAt }) {
      const next = {
        title: patch.title !== null ? patch.title : existingTask.title,
        description: patch.description !== null ? patch.description : existingTask.description,
        status: patch.status !== null ? patch.status : existingTask.status,
        priority: patch.priority !== null ? patch.priority : existingTask.priority,
        dueAt: patch.dueAt !== undefined ? patch.dueAt : existingTask.dueAt,
        assignedTo: patch.assignedTo !== undefined ? patch.assignedTo : existingTask.assignedTo
      };

      await postgres.execute(`
        UPDATE tasks
        SET title = ?, description = ?, status = ?, priority = ?, due_at = ?, assigned_to = ?, completed_at = ?, updated_at = ?
        WHERE id = ? AND workspace_id = ?
      `, [
        next.title,
        next.description || null,
        next.status,
        next.priority,
        next.dueAt == null ? null : Number(next.dueAt),
        next.assignedTo || null,
        completedAt == null ? null : Number(completedAt),
        Number(updatedAt),
        taskId,
        workspaceId
      ]);

      return this.getTaskById({ workspaceId, taskId });
    },

    async createTaskComment({ id, workspaceId, taskId, userId, body, createdAt }) {
      await postgres.transaction(async (tx) => {
        await tx.execute(`
          INSERT INTO task_comments (id, workspace_id, task_id, user_id, body, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [id, workspaceId, taskId, userId, body, Number(createdAt)]);
        await tx.execute(`UPDATE tasks SET updated_at = ? WHERE id = ?`, [Number(createdAt), taskId]);
      });
      return postgres.queryOne(`SELECT * FROM task_comments WHERE id = ?`, [id]);
    },

    async listTaskComments({ workspaceId, taskId, userId }) {
      const rows = await postgres.queryMany(`
        SELECT c.*
        FROM task_comments c
        WHERE c.workspace_id = ? AND c.task_id = ?
        ORDER BY c.created_at ASC, c.id ASC
      `, [workspaceId, taskId]);
      const commentIds = rows.map((row) => row.id);
      const reactionRows = commentIds.length
        ? await postgres.queryMany(`
            SELECT target_id, emoji, COUNT(*)::int AS count
            FROM task_reactions
            WHERE workspace_id = ? AND target_type = 'comment' AND target_id IN (${buildSqlInPlaceholders(commentIds.length)})
            GROUP BY target_id, emoji
          `, [workspaceId, ...commentIds])
        : [];
      const mineRows = commentIds.length
        ? await postgres.queryMany(`
            SELECT target_id, emoji
            FROM task_reactions
            WHERE workspace_id = ? AND target_type = 'comment' AND user_id = ? AND target_id IN (${buildSqlInPlaceholders(commentIds.length)})
          `, [workspaceId, userId, ...commentIds])
        : [];
      return attachReactionPayload(rows, reactionRows, mineRows);
    },

    async getTaskReactionTarget({ workspaceId, targetType, targetId }) {
      if (targetType === 'task') {
        return postgres.queryOne(`
          SELECT id, channel_id AS "channelId"
          FROM tasks
          WHERE id = ? AND workspace_id = ?
        `, [targetId, workspaceId]);
      }
      return postgres.queryOne(`
        SELECT c.id, t.channel_id AS "channelId"
        FROM task_comments c
        JOIN tasks t ON t.id = c.task_id
        WHERE c.id = ? AND c.workspace_id = ? AND t.workspace_id = ?
      `, [targetId, workspaceId, workspaceId]);
    },

    async toggleTaskReaction({ id, workspaceId, targetType, targetId, emoji, userId, createdAt }) {
      const existing = await postgres.queryOne(`
        SELECT id
        FROM task_reactions
        WHERE workspace_id = ? AND target_type = ? AND target_id = ? AND emoji = ? AND user_id = ?
      `, [workspaceId, targetType, targetId, emoji, userId]);

      if (existing) {
        await postgres.execute(`DELETE FROM task_reactions WHERE id = ?`, [existing.id]);
        return { on: false };
      }

      await postgres.execute(`
        INSERT INTO task_reactions (id, workspace_id, target_type, target_id, emoji, user_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [id, workspaceId, targetType, targetId, emoji, userId, Number(createdAt)]);
      return { on: true };
    },

    async getHomeworkItemById(itemId) {
      return postgres.queryOne(`
        SELECT
          id,
          workspace_id AS "workspaceId",
          class_channel_id AS "classChannelId",
          title,
          description,
          resource_url AS "resourceUrl",
          due_date AS "dueDate",
          is_locked AS "isLocked",
          is_archived AS "isArchived",
          created_by AS "createdBy",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM homework_items
        WHERE id = ?
        LIMIT 1
      `, [itemId]);
    },

    async listHomeworkSubmissionStudents(itemId) {
      return postgres.queryMany(`
        SELECT student_id AS "studentId", status
        FROM homework_submissions
        WHERE homework_item_id = ?
      `, [itemId]);
    },

    async syncHomeworkCompletion(homeworkId, studentId, status) {
      const normalizedStatus = String(status || '').trim().toLowerCase();
      if (HOMEWORK_ACTIVE_STATUSES.has(normalizedStatus)) {
        await postgres.execute(`
          INSERT INTO homework_completions (homework_id, student_id, completed_at)
          VALUES (?, ?, ?)
          ON CONFLICT (homework_id, student_id)
          DO UPDATE SET completed_at = EXCLUDED.completed_at
        `, [homeworkId, studentId, nowSqliteStyleTimestamp()]);
        return;
      }
      await postgres.execute(`
        DELETE FROM homework_completions
        WHERE homework_id = ? AND student_id = ?
      `, [homeworkId, studentId]);
    },

    async listHomeworkBoardForChannel({ workspaceId, classChannelId, homeworkChannelId, viewerId, viewerRole }) {
      const items = await postgres.queryMany(`
        SELECT
          hi.id,
          hi.workspace_id AS "workspaceId",
          hi.class_channel_id AS "classChannelId",
          hi.title,
          hi.description,
          hi.resource_url AS "resourceUrl",
          hi.due_date AS "dueDate",
          hi.is_locked AS "isLocked",
          hi.is_archived AS "isArchived",
          hi.created_by AS "createdBy",
          hi.created_at AS "createdAt",
          hi.updated_at AS "updatedAt",
          COALESCE(u.name, u.email::text, u.username, hi.created_by) AS "createdByName"
        FROM homework_items hi
        LEFT JOIN users u ON u.id = hi.created_by
        WHERE hi.workspace_id = ?
          AND hi.class_channel_id = ?
          AND COALESCE(hi.is_archived, 0) = 0
        ORDER BY
          CASE WHEN COALESCE(hi.due_date, '') = '' THEN 1 ELSE 0 END ASC,
          hi.due_date ASC,
          hi.created_at DESC,
          hi.id DESC
      `, [workspaceId, classChannelId]);
      if (!items.length) return [];

      const itemIds = items.map((item) => String(item.id || ''));
      const itemFiles = await listHomeworkItemFiles(itemIds);
      const submissionBaseSql = `
        SELECT
          hs.id,
          hs.homework_item_id AS "homeworkItemId",
          hs.workspace_id AS "workspaceId",
          hs.channel_id AS "channelId",
          hs.student_id AS "studentId",
          hs.status,
          hs.submission_text AS "submissionText",
          hs.is_late AS "isLate",
          hs.submitted_at AS "submittedAt",
          hs.reviewed_at AS "reviewedAt",
          hs.reviewed_by AS "reviewedBy",
          hs.returned_at AS "returnedAt",
          hs.feedback_text AS "feedbackText",
          hs.grade_value AS "gradeValue",
          hs.created_at AS "createdAt",
          hs.updated_at AS "updatedAt",
          COALESCE(u.name, u.email::text, u.username, hs.student_id) AS "studentName",
          COALESCE(r.name, r.email::text, r.username, hs.reviewed_by) AS "reviewedByName"
        FROM homework_submissions hs
        LEFT JOIN users u ON u.id = hs.student_id
        LEFT JOIN users r ON r.id = hs.reviewed_by
        WHERE hs.homework_item_id IN (${buildSqlInPlaceholders(itemIds.length)})
      `;
      const submissionRows = viewerRole === 'student'
        ? await postgres.queryMany(`
            ${submissionBaseSql}
            AND hs.student_id = ?
            ORDER BY hs.updated_at DESC, hs.created_at DESC, hs.id DESC
          `, [...itemIds, viewerId])
        : await postgres.queryMany(`
            ${submissionBaseSql}
            ORDER BY hs.updated_at DESC, hs.created_at DESC, hs.id DESC
          `, itemIds);
      const submissionFiles = await listHomeworkSubmissionFiles(submissionRows.map((row) => row.id));
      const submissionComments = await listHomeworkSubmissionComments(submissionRows.map((row) => row.id));
      const submissionsByItem = new Map();

      submissionRows.forEach((row) => {
        const key = String(row.homeworkItemId || '');
        if (!submissionsByItem.has(key)) submissionsByItem.set(key, []);
        submissionsByItem.get(key).push({
          ...row,
          isLate: normalizeIntFlag(row.isLate),
          files: submissionFiles.get(String(row.id || '')) || [],
          comments: submissionComments.get(String(row.id || '')) || []
        });
      });

      return items.map((item) => {
        const itemId = String(item.id || '');
        const itemSubmissions = submissionsByItem.get(itemId) || [];
        const mySubmission = viewerRole === 'student'
          ? itemSubmissions.find((submission) => String(submission.studentId || '') === String(viewerId || '')) || null
          : null;
        return {
          ...item,
          isLocked: normalizeIntFlag(item.isLocked),
          isArchived: normalizeIntFlag(item.isArchived),
          homeworkChannelId,
          files: itemFiles.get(itemId) || [],
          mySubmission,
          submissions: viewerRole === 'student' ? [] : itemSubmissions,
          submissionSummary: {
            total: itemSubmissions.length,
            submitted: itemSubmissions.filter((row) => ['submitted', 'late', 'reviewed'].includes(String(row.status || '').toLowerCase())).length,
            reviewed: itemSubmissions.filter((row) => String(row.status || '').toLowerCase() === 'reviewed').length,
            returned: itemSubmissions.filter((row) => String(row.status || '').toLowerCase() === 'returned').length
          }
        };
      });
    },

    async createHomeworkItem({ id, workspaceId, classChannelId, title, description, resourceUrl, dueDate, isLocked, createdBy, files = [], solutionFiles = [] }) {
      const now = nowSqliteStyleTimestamp();
      await postgres.transaction(async (tx) => {
        await tx.execute(`
          INSERT INTO homework_items
          (id, workspace_id, class_channel_id, title, description, resource_url, due_date, is_locked, is_archived, created_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
        `, [id, workspaceId, classChannelId, title, description, resourceUrl, dueDate, normalizeIntFlag(isLocked), createdBy || null, now, now]);

        for (const entry of [...files, ...solutionFiles]) {
          await tx.execute(`
            INSERT INTO homework_item_files
            (id, item_id, workspace_id, channel_id, file_id, file_name, mime, size_bytes, url, file_role, created_by, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            entry.id,
            id,
            workspaceId,
            entry.channelId,
            entry.fileId,
            entry.fileName,
            entry.mime,
            Number(entry.sizeBytes || 0),
            entry.url,
            entry.fileRole,
            createdBy || null,
            now
          ]);
        }
      });

      return this.getHomeworkItemById(id);
    },

    async updateHomeworkItem({ itemId, title, description, resourceUrl, dueDate, isLocked, isArchived, files, solutionFiles, workspaceId, channelId, userId }) {
      const now = nowSqliteStyleTimestamp();
      await postgres.transaction(async (tx) => {
        await tx.execute(`
          UPDATE homework_items
          SET title = ?, description = ?, resource_url = ?, due_date = ?, is_locked = ?, is_archived = ?, updated_at = ?
          WHERE id = ?
        `, [title, description, resourceUrl, dueDate, normalizeIntFlag(isLocked), normalizeIntFlag(isArchived), now, itemId]);

        if (files || solutionFiles) {
          await tx.execute(`DELETE FROM homework_item_files WHERE item_id = ?`, [itemId]);
          for (const entry of [...(files || []), ...(solutionFiles || [])]) {
            await tx.execute(`
              INSERT INTO homework_item_files
              (id, item_id, workspace_id, channel_id, file_id, file_name, mime, size_bytes, url, file_role, created_by, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
              entry.id,
              itemId,
              workspaceId,
              channelId,
              entry.fileId,
              entry.fileName,
              entry.mime,
              Number(entry.sizeBytes || 0),
              entry.url,
              entry.fileRole,
              userId || null,
              now
            ]);
          }
        }
      });
      return this.getHomeworkItemById(itemId);
    },

    async deleteHomeworkItemCascade(itemId) {
      await postgres.transaction(async (tx) => {
        await tx.execute(`
          DELETE FROM homework_submission_files
          WHERE submission_id IN (SELECT id FROM homework_submissions WHERE homework_item_id = ?)
        `, [itemId]);
        await tx.execute(`
          DELETE FROM homework_submission_comments
          WHERE submission_id IN (SELECT id FROM homework_submissions WHERE homework_item_id = ?)
        `, [itemId]);
        await tx.execute(`DELETE FROM homework_submissions WHERE homework_item_id = ?`, [itemId]);
        await tx.execute(`DELETE FROM homework_item_files WHERE item_id = ?`, [itemId]);
        await tx.execute(`DELETE FROM homework_items WHERE id = ?`, [itemId]);
        await tx.execute(`DELETE FROM homework_completions WHERE homework_id = ?`, [itemId]);
      });
    },

    async getHomeworkSubmissionById(submissionId) {
      return postgres.queryOne(`
        SELECT
          hs.id,
          hs.homework_item_id AS "homeworkItemId",
          hs.workspace_id AS "workspaceId",
          hs.channel_id AS "channelId",
          hs.student_id AS "studentId",
          hs.status,
          hi.class_channel_id AS "classChannelId",
          hi.due_date AS "dueDate"
        FROM homework_submissions hs
        JOIN homework_items hi ON hi.id = hs.homework_item_id
        WHERE hs.id = ?
        LIMIT 1
      `, [submissionId]);
    },

    async getHomeworkSubmissionForStudent(itemId, studentId) {
      return postgres.queryOne(`
        SELECT id, status
        FROM homework_submissions
        WHERE homework_item_id = ? AND student_id = ?
        LIMIT 1
      `, [itemId, studentId]);
    },

    async upsertHomeworkSubmission({ submissionId, existingSubmissionId = null, itemId, workspaceId, channelId, studentId, status, submissionText, isLate, submittedAt, files = [] }) {
      const now = nowSqliteStyleTimestamp();
      await postgres.transaction(async (tx) => {
        if (existingSubmissionId) {
          await tx.execute(`
            UPDATE homework_submissions
            SET status = ?, submission_text = ?, is_late = ?, submitted_at = COALESCE(?, submitted_at), updated_at = ?
            WHERE id = ?
          `, [status, submissionText, normalizeIntFlag(isLate), submittedAt || null, now, submissionId]);
        } else {
          await tx.execute(`
            INSERT INTO homework_submissions
            (id, homework_item_id, workspace_id, channel_id, student_id, status, submission_text, is_late, submitted_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [submissionId, itemId, workspaceId, channelId, studentId, status, submissionText, normalizeIntFlag(isLate), submittedAt || null, now, now]);
        }

        for (const entry of files) {
          await tx.execute(`
            INSERT INTO homework_submission_files
            (id, submission_id, workspace_id, channel_id, file_id, file_name, mime, size_bytes, url, created_by, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            entry.id,
            submissionId,
            workspaceId,
            channelId,
            entry.fileId,
            entry.fileName,
            entry.mime,
            Number(entry.sizeBytes || 0),
            entry.url,
            studentId,
            now
          ]);
        }
      });
    },

    async reviewHomeworkSubmission({ submissionId, status, feedbackText, gradeValue, reviewedBy }) {
      const now = nowSqliteStyleTimestamp();
      await postgres.execute(`
        UPDATE homework_submissions
        SET status = ?, feedback_text = ?, grade_value = ?, reviewed_at = ?, reviewed_by = ?, returned_at = CASE WHEN ? = 'returned' THEN ? ELSE returned_at END, updated_at = ?
        WHERE id = ?
      `, [status, feedbackText, gradeValue, now, reviewedBy || null, status, now, now, submissionId]);
    },

    async createHomeworkSubmissionComment({ id, submissionId, workspaceId, channelId, authorId, commentText }) {
      const now = nowSqliteStyleTimestamp();
      await postgres.execute(`
        INSERT INTO homework_submission_comments
        (id, submission_id, workspace_id, channel_id, author_id, comment_text, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [id, submissionId, workspaceId, channelId, authorId, commentText, now, now]);
    }
  };
}

module.exports = {
  createTasksRepository,
  nowEpochMs
};
